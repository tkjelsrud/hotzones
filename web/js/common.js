// Shared helpers for the host and player pages.

// Where the Python server runs in production (Cloud Run). Anywhere else the server serves these pages itself, so same origin.
const PROD_API = 'https://hotzones-940521904806.europe-north1.run.app';
export const API = location.hostname.endsWith('github.io') ? PROD_API : location.origin;

// Riso ink colours for zones. Zone 1 defaults to Green ("yes"), zone 2 to Bright Red ("no").
export const RISO = [
  { name: 'Green', hex: '#00a95c' },
  { name: 'Bright Red', hex: '#f15060' },
  { name: 'Orange', hex: '#ff6c2f' },
  { name: 'Fluorescent Pink', hex: '#ff48b0' },
  { name: 'Sunflower', hex: '#ffb511' },
  { name: 'Yellow', hex: '#ffe800' },
  { name: 'Blue', hex: '#0078bf' },
  { name: 'Teal', hex: '#00838a' },
  { name: 'Aqua', hex: '#5ec8e5' },
  { name: 'Purple', hex: '#765ba7' },
  { name: 'Kelly Green', hex: '#67b346' },
  { name: 'Burgundy', hex: '#914e72' },
];

// The zone's colour as the room has it, or the palette default for rooms without colours.
export const zoneColors = (zones, colors) =>
  colors?.length === zones.length ? colors : zones.map((_, z) => RISO[z % RISO.length].hex);

export function withAlpha(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// A soft, edgeless field of colour over a rectangle: strongest in the middle, fading to nothing at every edge.
// stops: [[offset 0-1, alpha], ...]
export function softField(ctx, r, hex, stops) {
  ctx.save();
  ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
  ctx.scale(r.w / 2, r.h / 2); // a unit circle becomes an ellipse that fits the rectangle
  const field = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (const [offset, alpha] of stops) field.addColorStop(offset, withAlpha(hex, alpha));
  ctx.fillStyle = field;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
}

// Player colours, for themes that show each person (e.g. tug-of-war figures).
export const PALETTE = [
  '#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7',
  '#748ffc', '#da77f2', '#f783ac', '#a9e34b', '#3bc9db', '#ffc078',
];

// Plain HTTP calls. Bodies go as text/plain JSON so the browser skips the CORS preflight.
// Resolves to { status, body }; network errors resolve to status 0 so callers can just retry.
export async function call(path, body) {
  try {
    const res = await fetch(API + path, body === undefined ? { cache: 'no-store' } : { method: 'POST', body: JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  } catch {
    return { status: 0, body: {} };
  }
}

// Anonymous id per device, so a reload is the same person. crypto.randomUUID needs https, getRandomValues doesn't.
export function playerId() {
  const fresh = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
  try {
    let id = localStorage.getItem('hz-pid');
    if (!id) localStorage.setItem('hz-pid', (id = fresh()));
    return id;
  } catch {
    return fresh();
  }
}

// Zone rectangles for a screen. Landscape puts zones side by side; portrait stacks them, except:
// two zones are always side by side (left/right reads naturally), and 'match' copies the landscape arrangement.
export function layout(n, w, h, phoneLayout = 'fit') {
  const wide = w >= h || n === 2 || phoneLayout === 'match';
  let cols, rows;
  if (n <= 3) [cols, rows] = wide ? [n, 1] : [1, n];
  else if (n === 4) [cols, rows] = [2, 2];
  else [cols, rows] = wide ? [3, 2] : [2, 3];
  const cw = w / cols, ch = h / rows;
  return Array.from({ length: n }, (_, i) => ({ x: (i % cols) * cw, y: Math.floor(i / cols) * ch, w: cw, h: ch }));
}

// Splash: shown at least 0.8 s and at most 1.5 s. Call the returned function when ready.
export function showSplash() {
  const el = document.createElement('div');
  el.className = 'splash';
  el.innerHTML = '<img src="logo.svg" alt="" width="96" height="96"><h1>Hotzones</h1><p>Show where you stand</p>';
  document.body.append(el);
  const shown = Date.now();
  let hidden = false;
  const hide = () => {
    if (hidden) return;
    hidden = true;
    el.classList.add('hide');
    setTimeout(() => el.remove(), 400);
  };
  setTimeout(hide, 1500);
  return () => setTimeout(hide, Math.max(0, 800 - (Date.now() - shown)));
}

// Canvas sized to its element in device pixels; drawing happens in CSS pixels.
export function fitCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}
