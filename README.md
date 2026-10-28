# Hotzones

Show where you stand. A facilitator starts a session, people join by QR code and put a finger on the zone they agree with. The shared screen shows the zones heating up, with live counts.

- `web/` – plain HTML, CSS and JS. No build step. `host.html` is the facilitator screen, `play.html` the phone.
- `server/server.py` – one Python file. Rooms live in memory only; nothing is stored.

Phones and the shared screen talk to the server over plain HTTP (POST and polling, no WebSockets), so it works through corporate proxies and VPNs.

## Run locally

```sh
cd server
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python server.py
```

The server also serves `web/`. Open the facilitator screen at **your laptop's network address**, not `localhost`, so the QR code works for phones on the same Wi-Fi:

```sh
ipconfig getifaddr en0   # e.g. 192.168.1.23
open http://192.168.1.23:8787/host.html
```

## API

| Method | Path | Who | Body / reply |
| --- | --- | --- | --- |
| POST | `/rooms` | host | → `{ code, token }` |
| POST | `/rooms/{code}/host` | host | `{ token, t: "scene", zones: [...] }`, `{ token, t: "config", hz }`, `{ token, t: "reset" }`, `{ token, t: "close" }` (→ summary) |
| GET | `/rooms/{code}/state?token=` | host | → `{ zones, grid, counts, heat, dots, n, rate, hostHz }` |
| POST | `/rooms/{code}/play` | phone | `{ pid, t: "pos", z, u, v }`, `{ pid, t: "lift" }` or `{ pid }` → `{ zones, grid, counts, n, rate }` |

Bodies are JSON sent as `text/plain`, so browsers skip the CORS preflight. `404` = no such room, `410` = room closed, `429` = room full or too many requests.

## Limits

Set at the top of `server.py`: 32 × 32 cells per zone, 250 players and 50 rooms at most, 300 player requests per second per room (the phone rate drops automatically in big rooms), 10 new rooms per IP per hour, 30 minutes idle and 3 hours max per room.

## Deploy (later)

- `web/` to GitHub Pages; set `PROD_API` in `web/js/common.js` to the server URL.
- `server/` to any host that runs one Python process, e.g. Google Cloud Run with `--max-instances 1` (rooms live in one process's memory). Set `ALLOWED_ORIGINS` to the Pages origin.
