// Facilitator screen: set up a room, show the QR code and poll the room.
// How the room is drawn is up to the session's theme (web/themes/), loaded on demand.
import { PALETTE, RISO, call, fitCanvas, layout, showSplash, softField, withAlpha, zoneColors } from './common.js';
import { DEFAULT_THEME, THEMES, findTheme, loadTheme } from '../themes/registry.js';

const $ = (id) => document.getElementById(id);
// Yes/no wordings for two-zone sessions, from data/wordings.json; one is picked at random as the default.
const PRO_CON = await fetch('data/wordings.json')
  .then((r) => r.json())
  .then((list) => list.map((w) => [w.yes, w.no]))
  .catch(() => []);
const pair = PRO_CON.length ? PRO_CON[Math.floor(Math.random() * PRO_CON.length)] : ['Agree', 'Disagree'];

const themeDefaults = () => findTheme($('theme').value).defaults;

// A theme's own labels if it has them; otherwise the random pair for the first two zones and "Option 3", "Option 4", ...
const defaultNames = (n) =>
  themeDefaults()?.names.slice(0, n) || [...pair, ...Array.from({ length: n - 2 }, (_, i) => `Option ${i + 3}`)];

// A name the host hasn't typed themselves, so it can be replaced when the theme or zone count changes.
const isDefaultName = (name) =>
  pair.includes(name) || /^Option \d$/.test(name) || THEMES.some((t) => t.defaults?.names.includes(name));
const SESSION_KEY = 'hz-host';

const hideSplash = showSplash();

// --- setup ---------------------------------------------------------------------

for (const t of THEMES) $('theme').append(new Option(t.name, t.id));
$('theme').value = DEFAULT_THEME;

function renderZoneCounts() {
  const { minZones, maxZones } = findTheme($('theme').value);
  const current = Number($('zone-count').value) || minZones;
  $('zone-count').innerHTML = '';
  for (let n = minZones; n <= maxZones; n++) $('zone-count').append(new Option(n, n));
  $('zone-count').value = Math.max(minZones, Math.min(maxZones, current));
  $('zone-count').closest('label').hidden = minZones === maxZones; // a fixed zone count needs no choice
  renderNameInputs();
}

// One Riso colour per zone: the theme's own colours if it has them, otherwise Green and Bright Red for the
// first two and a random unused ink for the rest. Switching theme starts the colours over.
let colors = [];
$('theme').addEventListener('change', () => { colors = []; });

function randomFreeColor() {
  const free = RISO.filter((c) => !colors.includes(c.hex));
  const pool = free.length ? free : RISO;
  return pool[Math.floor(Math.random() * pool.length)].hex;
}

function renderNameInputs() {
  const n = Number($('zone-count').value);
  const current = [...$('zone-names').querySelectorAll('input')].map((i) => i.value);
  const defaults = defaultNames(n);
  colors = colors.slice(0, n);
  while (colors.length < n) {
    const i = colors.length;
    colors.push(themeDefaults()?.colors[i] || (i < 2 ? RISO[i].hex : randomFreeColor()));
  }

  $('zone-names').innerHTML = '';
  for (let i = 0; i < n; i++) {
    const row = document.createElement('div');
    row.className = 'zone-row';
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'swatch';
    swatch.style.background = colors[i];
    swatch.setAttribute('aria-label', `Zone ${i + 1} colour`);
    swatch.addEventListener('click', () => openPalette(row, i));
    const input = document.createElement('input');
    input.maxLength = 24;
    input.value = current[i] && !isDefaultName(current[i]) ? current[i] : defaults[i];
    input.setAttribute('aria-label', `Zone ${i + 1} name`);
    row.append(swatch, input);
    $('zone-names').append(row);
  }
}

function openPalette(row, i) {
  const wasOpen = row.querySelector('.palette');
  closePalette();
  if (wasOpen) return;
  const palette = document.createElement('div');
  palette.className = 'palette';
  for (const ink of RISO) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = `swatch${ink.hex === colors[i] ? ' chosen' : ''}`;
    option.style.background = ink.hex;
    option.title = ink.name;
    option.setAttribute('aria-label', ink.name);
    option.addEventListener('click', () => {
      colors[i] = ink.hex;
      row.querySelector('.swatch').style.background = ink.hex;
      closePalette();
    });
    palette.append(option);
  }
  row.append(palette);
}

const closePalette = () => document.querySelector('.palette')?.remove();
document.addEventListener('click', (e) => { if (!e.target.closest('.zone-row')) closePalette(); });
$('theme').addEventListener('change', renderZoneCounts);
$('zone-count').addEventListener('change', renderNameInputs);
$('rate').addEventListener('input', () => { $('rate-out').textContent = `${$('rate').value} Hz`; });
renderZoneCounts();

$('start').addEventListener('click', async () => {
  $('start').disabled = true;
  $('setup-error').textContent = '';
  const { status, body } = await call('/rooms', {});
  if (status !== 200) {
    $('setup-error').textContent = status ? body.error || 'Could not start a session.' : 'Could not reach the server.';
    $('start').disabled = false;
    return;
  }
  const session = { code: body.code, token: body.token };
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* reload loses the session */ }
  const zones = [...$('zone-names').querySelectorAll('input')].map((i, n) => i.value.trim() || `Zone ${n + 1}`);
  await command(session, { t: 'scene', zones, colors, theme: $('theme').value });
  await command(session, { t: 'config', hz: Number($('rate').value) });
  goLive(session);
});

// A reload with ?room=CODE picks the running session back up.
const resumeCode = new URLSearchParams(location.search).get('room');
let saved = null;
try { saved = JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { /* no saved session */ }
if (resumeCode && saved?.code === resumeCode) goLive(saved);
else hideSplash();

function command(session, msg) {
  return call(`/rooms/${session.code}/host`, { token: session.token, ...msg });
}

// --- theme -----------------------------------------------------------------------

const kit = {
  layout,
  fitCanvas,
  colorFor: (id) => PALETTE[id % PALETTE.length],
  withAlpha,
  softField,
  loadCss(url) {
    const href = String(url);
    if (document.querySelector(`link[href="${href}"]`)) return;
    document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href }));
  },
};

let theme = null, themeId = null;

async function useTheme(id) {
  themeId = id;
  theme?.destroy();
  theme = null;
  const { module } = await loadTheme(id);
  if (themeId === id) theme = module.mount($('stage'), kit);
}

// Unpack the wire format once, so themes get plain data.
function unpack(state) {
  const heat = new Float32Array(state.zones.length * state.grid * state.grid);
  for (let i = 0; i < state.heat.length; i += 2) heat[state.heat[i]] = state.heat[i + 1] / 255;
  const players = state.dots.map(([id, z, u, v, down]) => ({ id, z, u, v, down: Boolean(down) }));
  const colors = zoneColors(state.zones, state.colors);
  return { zones: state.zones, colors, counts: state.counts, n: state.n, grid: state.grid, heat, players };
}

// --- live ----------------------------------------------------------------------

let polling = true, rate = 2;

function goLive(session) {
  $('setup').hidden = true;
  $('live').hidden = false;
  history.replaceState(null, '', `?room=${session.code}`);

  const joinUrl = new URL(`play.html?room=${session.code}`, location.href).href;
  const qr = qrcode(0, 'M');
  qr.addData(joinUrl);
  qr.make();
  $('qr').innerHTML = `<img alt="QR code to join" src="${qr.createDataURL(8, 2)}">`;
  $('code').textContent = session.code;
  $('join-url').textContent = joinUrl.replace(/^https?:\/\//, '');

  $('live-rate').addEventListener('input', () => { $('live-rate-out').textContent = `${$('live-rate').value} Hz`; });
  $('live-rate').addEventListener('change', () => command(session, { t: 'config', hz: Number($('live-rate').value) }));
  $('reset').addEventListener('click', () => command(session, { t: 'reset' }));
  $('end').addEventListener('click', async () => {
    if (!confirm('End the session for everyone?')) return;
    const { status, body } = await command(session, { t: 'close' });
    ended(status === 200 ? body : null);
  });

  poll(session);
  requestAnimationFrame(frame);
}

async function poll(session) {
  let first = true;
  while (polling) {
    const started = performance.now();
    const { status, body } = await call(`/rooms/${session.code}/state?token=${encodeURIComponent(session.token)}`);
    if (!polling) return;
    if (status === 200 && body.zones) {
      if (body.theme !== themeId) await useTheme(body.theme);
      theme?.update(unpack(body));
      showStats(body);
      if (first) { hideSplash(); first = false; }
    } else if (status === 404 || status === 410 || status === 403) {
      ended(null, status === 410 ? 'The session was closed.' : 'This session no longer exists.');
      return;
    } else if (status !== 200) {
      $('stats').textContent = 'Reconnecting…';
    }
    const interval = status === 200 ? 1000 / Math.min(rate, 4) : 2000;
    await new Promise((r) => setTimeout(r, Math.max(0, interval - (performance.now() - started))));
  }
}

function showStats(state) {
  rate = state.rate;
  $('stats').textContent = `${state.n} ${state.n === 1 ? 'player' : 'players'} · ${state.rate} Hz`;
  if (document.activeElement !== $('live-rate')) {
    $('live-rate').value = state.hostHz;
    $('live-rate-out').textContent = state.rate < state.hostHz ? `${state.hostHz} Hz (room uses ${state.rate})` : `${state.hostHz} Hz`;
  }
}

let last = performance.now();

function frame(t) {
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  theme?.frame(dt);
  if (polling) requestAnimationFrame(frame);
}

// --- end -----------------------------------------------------------------------

function ended(summary, text = 'Thanks for facilitating.') {
  polling = false;
  theme?.destroy();
  theme = null;
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* nothing saved */ }
  history.replaceState(null, '', location.pathname);
  $('setup').hidden = $('live').hidden = true;
  $('ended').hidden = false;
  hideSplash();
  $('ended-text').textContent = text;
  if (!summary) return;

  const minutes = Math.round(summary.durationSeconds / 60);
  $('ended-text').textContent = `${summary.peakPlayers} players at most, ${minutes} min. Final votes:`;
  $('summary').innerHTML = '';
  for (const zone of summary.zones) {
    const li = document.createElement('li');
    li.append(Object.assign(document.createElement('span'), { textContent: zone.name }));
    li.append(Object.assign(document.createElement('span'), { textContent: `${zone.votes}` }));
    $('summary').append(li);
  }
  const link = $('download');
  link.href = URL.createObjectURL(new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' }));
  link.download = `hotzones-${summary.startedAt.slice(0, 10)}.json`;
  link.hidden = false;
}
