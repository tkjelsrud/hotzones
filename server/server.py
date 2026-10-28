"""Hotzones backend: hands out room codes and keeps each room in memory.

Plain HTTP, no sockets, so it works through any proxy or VPN:
phones POST their position (and get the counts back), the shared screen polls for state.

Run locally:  python server.py   ->  http://localhost:8787  (also serves ../web)
Nothing is stored. When a room closes or goes idle, its state is gone.
Must run as a single process: all rooms live in this process's memory.
"""
import json
import os
import re
import secrets
import time

from aiohttp import web

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O, 1/I
GRID = 32                # cells per zone, each way
MAX_PLAYERS = 250
MAX_ROOMS = 50
MSG_BUDGET = 300         # player requests per second per room, shared by all players
MAX_BODY = 256           # bytes
MAX_TICK_HZ = 4
LIVE_TIMEOUT = 5         # seconds without a position before a finger counts as lifted
PLAYER_TIMEOUT = 60      # seconds without any request before a player (and their vote) counts as gone
RESTING_WEIGHT = 0.3     # heat from a vote left in place, relative to a finger that is touching
HEAT_DECAY = 0.08        # share of heat lost per second
IDLE_SECONDS = 30 * 60
MAX_LIFE_SECONDS = 3 * 3600
CLOSED_MEMORY = 10 * 60  # how long a closed code answers "closed" instead of "missing"
ROOMS_PER_IP_PER_HOUR = 10

PORT = int(os.environ.get("PORT", "8787"))
ALLOWED_ORIGINS = {o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "https://tkjelsrud.github.io").split(",") if o.strip()}
WEB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web")
LOCAL_HOST = re.compile(r"^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)")

rooms = {}
closed_rooms = {}   # code -> when it closed
created_by_ip = {}  # ip -> [timestamps]


class Player:
    def __init__(self, number, now):
        self.id = number
        self.voted = False  # the last touched cell stays as this player's vote
        self.down = False   # finger touching right now
        self.z = self.u = self.v = 0
        self.seen = self.pos_at = now
        self.tokens = 3.0
        self.tokens_at = now
        self.drops = 0
        self.drops_at = now
        self.blocked_until = 0.0


class Room:
    def __init__(self, code):
        self.code = code
        self.token = secrets.token_urlsafe(16)
        self.players = {}  # pid -> Player
        self.zones = []
        self.theme = "heatmap"  # only stored and passed on; themes are drawn by the clients
        self.heat = None
        self.dwell = []    # seconds of finger time per zone, for the summary
        self.counts = []
        self.host_hz = 2
        self.rate = 2
        self.next_id = 1
        self.peak_players = 0
        self.created = self.last_active = time.monotonic()
        self.created_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        self.closed = False
        self.host_view = {}
        self.last_tick = self.created

    # --- requests ----------------------------------------------------------

    def player_request(self, pid, msg):
        """A phone checks in: with a position, a lift, or nothing (just polling). Returns (status, body)."""
        now = time.monotonic()
        p = self.players.get(pid)
        if not p:
            if len(self.players) >= MAX_PLAYERS:
                return 429, {"error": "full"}
            p = self.players[pid] = Player(self.next_id, now)
            self.next_id += 1
            self.peak_players = max(self.peak_players, len(self.players))
            self.update_rate()
        if now < p.blocked_until:
            return 429, {"error": "slow down"}

        # Token bucket: over-sending is dropped quietly, and only gross abuse gets a 30 s time-out.
        p.tokens = min(3.0, p.tokens + (now - p.tokens_at) * self.rate)
        p.tokens_at = now
        if now - p.drops_at > 10:
            p.drops, p.drops_at = 0, now
        if p.tokens < 1:
            p.drops += 1
            if p.drops > 40 * self.rate:
                p.blocked_until = now + 30
        else:
            p.tokens -= 1
            if msg.get("t") == "pos" and valid_cell(msg, len(self.zones)):
                p.z, p.u, p.v = msg["z"], msg["u"], msg["v"]
                p.voted = p.down = True
                p.pos_at = now
            elif msg.get("t") == "lift":
                p.down = False

        p.seen = self.last_active = now
        return 200, {
            "zones": self.zones, "theme": self.theme, "grid": GRID, "counts": self.counts, "n": len(self.players), "rate": self.rate,
            "you": [p.z, p.u, p.v] if p.voted else None,
        }

    def clear_votes(self):
        self.heat = [0.0] * (len(self.zones) * GRID * GRID)
        self.dwell = [0.0] * len(self.zones)
        self.counts = [0] * len(self.zones)
        for p in self.players.values():
            p.voted = p.down = False

    def host_command(self, msg):
        t = msg.get("t")
        if t == "scene" and isinstance(msg.get("zones"), list) and 2 <= len(msg["zones"]) <= 6:
            self.zones = [str(z)[:24] for z in msg["zones"]]
            theme = str(msg.get("theme", "heatmap"))
            self.theme = theme if re.fullmatch(r"[a-z0-9-]{1,32}", theme) else "heatmap"
            self.clear_votes()
        elif t == "config":
            try:
                self.host_hz = max(1, min(10, round(float(msg.get("hz")))))
            except (TypeError, ValueError):
                pass
            self.update_rate()
        elif t == "reset" and self.zones:
            self.clear_votes()
        elif t == "close":
            return self.close()
        self.last_active = time.monotonic()
        return {"ok": True}

    # Effective rate = what the host asked for, lowered so the whole room stays within budget.
    def update_rate(self):
        self.rate = max(1, min(self.host_hz, MSG_BUDGET // max(1, len(self.players))))

    # --- the tick: decay, accumulate, snapshot -------------------------------

    # The room only works when someone asks: no background loop, so a host that bills for CPU
    # only during requests (Cloud Run) costs nothing between them.
    def maybe_tick(self):
        now = time.monotonic()
        if self.host_view and now - self.last_tick < 1 / min(self.rate, MAX_TICK_HZ):
            return
        dt, self.last_tick = now - self.last_tick, now
        self.tick(now, dt)

    def expired(self, now):
        return now - self.last_active > IDLE_SECONDS or now - self.created > MAX_LIFE_SECONDS

    def tick(self, now, dt):
        gone = [pid for pid, p in self.players.items() if now - p.seen > PLAYER_TIMEOUT]
        for pid in gone:
            del self.players[pid]
        if gone:
            self.update_rate()

        counts = [0] * len(self.zones)
        dots = []
        step = min(dt, 1.0)  # after a quiet gap, don't credit a finger with the whole gap
        heat = self.heat
        if heat:
            keep = (1 - HEAT_DECAY) ** dt
            for i, h in enumerate(heat):
                if h:
                    heat[i] = h * keep if h > 0.01 else 0.0
        for p in self.players.values():
            if p.down and now - p.pos_at > LIVE_TIMEOUT:
                p.down = False
            if not p.voted or not heat:
                continue
            counts[p.z] += 1
            if p.down:
                self.dwell[p.z] += step
            # one cell per player per tick caps each person's weight; a resting vote glows less than a finger
            heat[(p.z * GRID + p.v) * GRID + p.u] += step if p.down else step * RESTING_WEIGHT
            dots.append([p.id, p.z, p.u, p.v, 1 if p.down else 0])

        # Heat goes out sparse, as [cellIndex, 0-255, cellIndex, 0-255, ...].
        sparse = []
        if heat:
            top = max(3.0, max(heat))  # a lone finger never reads as full heat
            for i, h in enumerate(heat):
                b = round(h / top * 255)
                if b > 0:
                    sparse += (i, b)

        self.counts = counts
        self.host_view = {
            "zones": self.zones, "theme": self.theme, "grid": GRID, "counts": counts, "heat": sparse, "dots": dots,
            "n": len(self.players), "rate": self.rate, "hostHz": self.host_hz,
        }

    def close(self):
        self.closed = True
        rooms.pop(self.code, None)
        closed_rooms[self.code] = time.monotonic()
        return {
            "zones": [
                {"name": name, "votes": self.counts[i] if i < len(self.counts) else 0, "fingerSeconds": round(self.dwell[i])}
                for i, name in enumerate(self.zones)
            ],
            "peakPlayers": self.peak_players,
            "durationSeconds": round(time.monotonic() - self.created),
            "startedAt": self.created_at,
        }


def valid_cell(m, zone_count):
    def ok(n, top):
        return isinstance(n, int) and not isinstance(n, bool) and 0 <= n < top
    return ok(m.get("z"), zone_count) and ok(m.get("u"), GRID) and ok(m.get("v"), GRID)


def new_code():
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(5))


# --- HTTP ---------------------------------------------------------------------

# Production: only the listed origins, or the page this server serves itself.
# Local dev (server on localhost or a LAN address): any local origin.
def origin_allowed(request):
    origin = request.headers.get("Origin")
    # Same host counts as same origin: behind a proxy (Cloud Run) the request scheme is http even when the page is https.
    if origin is None or origin in ALLOWED_ORIGINS or re.sub(r"^https?://", "", origin) == request.host:
        return True
    host = request.host.split(":")[0]
    origin_host = re.sub(r"^https?://", "", origin).split(":")[0]
    return bool(LOCAL_HOST.match(host) and LOCAL_HOST.match(origin_host))


def reply(request, body, status=200):
    headers = {"Access-Control-Allow-Origin": request.headers.get("Origin", "*"), "Cache-Control": "no-store"}
    return web.json_response(body, status=status, headers=headers)


async def read_body(request):
    """Bodies are sent as text/plain JSON so browsers skip the CORS preflight."""
    raw = await request.content.read(MAX_BODY + 1)
    if len(raw) > MAX_BODY:
        return None
    try:
        msg = json.loads(raw or b"{}")
    except ValueError:
        return None
    return msg if isinstance(msg, dict) else None


def find_room(request):
    """Returns (room, None) or (None, error response)."""
    code = request.match_info["code"]
    room = rooms.get(code)
    if room and room.expired(time.monotonic()):
        room.close()
    elif room:
        return room, None
    if code in closed_rooms:
        return None, reply(request, {"error": "closed"}, 410)
    return None, reply(request, {"error": "missing"}, 404)


@web.middleware
async def check_origin(request, handler):
    if request.path.startswith("/rooms") and not origin_allowed(request):
        return web.Response(status=403, text="Forbidden")
    return await handler(request)


async def create_room(request):
    now = time.monotonic()
    ip = request.headers.get("X-Forwarded-For", request.remote or "").split(",")[0].strip()
    recent = [t for t in created_by_ip.get(ip, []) if now - t < 3600]
    if len(recent) >= ROOMS_PER_IP_PER_HOUR or len(rooms) >= MAX_ROOMS:
        return reply(request, {"error": "Too many rooms right now, try again later"}, 429)
    created_by_ip[ip] = recent + [now]
    for room in [r for r in rooms.values() if r.expired(now)]:
        room.close()
    for code, closed_at in list(closed_rooms.items()):
        if now - closed_at > CLOSED_MEMORY:
            del closed_rooms[code]

    code = new_code()
    while code in rooms or code in closed_rooms:
        code = new_code()
    room = rooms[code] = Room(code)
    return reply(request, {"code": code, "token": room.token})


async def play(request):
    room, error = find_room(request)
    if error:
        return error
    msg = await read_body(request)
    if msg is None or not isinstance(msg.get("pid"), str) or not msg["pid"]:
        return reply(request, {"error": "bad request"}, 400)
    status, body = room.player_request(msg["pid"][:64], msg)
    room.maybe_tick()
    return reply(request, body, status)


async def host_state(request):
    room, error = find_room(request)
    if error:
        return error
    if request.query.get("token") != room.token:
        return reply(request, {"error": "not the host"}, 403)
    room.last_active = time.monotonic()
    room.maybe_tick()
    return reply(request, room.host_view)


async def host_command(request):
    room, error = find_room(request)
    if error:
        return error
    msg = await read_body(request)
    if msg is None or msg.get("token") != room.token:
        return reply(request, {"error": "not the host"}, 403)
    return reply(request, room.host_command(msg))


async def index(request):
    return web.FileResponse(os.path.join(WEB_DIR, "index.html"))


def make_app():
    app = web.Application(middlewares=[check_origin])
    code = "{code:[A-Z0-9]{5}}"
    app.router.add_post("/rooms", create_room)
    app.router.add_post(f"/rooms/{code}/play", play)
    app.router.add_get(f"/rooms/{code}/state", host_state)
    app.router.add_post(f"/rooms/{code}/host", host_command)
    if os.path.isdir(WEB_DIR):
        app.router.add_get("/", index)
        app.router.add_static("/", WEB_DIR)
    return app


if __name__ == "__main__":
    web.run_app(make_app(), host="0.0.0.0", port=PORT)
