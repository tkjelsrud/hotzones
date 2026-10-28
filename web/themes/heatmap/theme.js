// Heatmap: zones glow where people vote, with a dot per player and big counters.

const PAD = 6;
const HEAT_STOPS = [ // value, r, g, b, alpha
  [0, 232, 51, 58, 0],
  [0.25, 232, 51, 58, 0.55],
  [0.6, 255, 122, 46, 0.85],
  [1, 255, 236, 150, 0.95],
];

function heatColor(v) {
  for (let i = 1; i < HEAT_STOPS.length; i++) {
    const [v1, ...c1] = HEAT_STOPS[i];
    if (v <= v1) {
      const [v0, ...c0] = HEAT_STOPS[i - 1];
      const t = (v - v0) / (v1 - v0);
      return c0.map((c, k) => c + (c1[k] - c) * t);
    }
  }
  return HEAT_STOPS[HEAT_STOPS.length - 1].slice(1);
}

export function mount(stage, kit) {
  kit.loadCss(new URL('theme.css', import.meta.url));
  stage.innerHTML = '<canvas class="hm-canvas"></canvas><div class="hm-labels"></div>';
  const canvas = stage.querySelector('canvas');
  const labels = stage.querySelector('.hm-labels');
  const cellCanvas = document.createElement('canvas');

  let zones = [], grid = 32, counts = [];
  let heatTarget = new Float32Array(0), heatNow = new Float32Array(0);
  const dots = new Map(); // id -> { x, y, z, u, v, down, color }

  function renderLabels() {
    labels.innerHTML = '';
    for (const name of zones) {
      const el = document.createElement('div');
      el.className = 'hm-zone';
      el.innerHTML = '<div class="hm-name"></div><div class="hm-count"><small></small><span></span></div>';
      el.querySelector('.hm-name').textContent = name;
      labels.append(el);
    }
    placeLabels();
  }

  function placeLabels() {
    const rects = kit.layout(zones.length, stage.clientWidth, stage.clientHeight);
    [...labels.children].forEach((el, z) => {
      const r = rects[z];
      Object.assign(el.style, { left: `${r.x + PAD}px`, top: `${r.y + PAD}px`, width: `${r.w - 2 * PAD}px`, height: `${r.h - 2 * PAD}px` });
    });
  }
  window.addEventListener('resize', placeLabels);

  return {
    update(state) {
      if (state.zones.join('\n') !== zones.join('\n')) {
        zones = state.zones;
        heatNow = new Float32Array(state.heat.length);
        dots.clear();
        renderLabels();
      }
      grid = state.grid;
      counts = state.counts;
      heatTarget = state.heat;

      const total = counts.reduce((a, b) => a + b, 0);
      [...labels.children].forEach((el, z) => {
        const count = counts[z] || 0;
        el.querySelector('.hm-count span').textContent = count;
        el.querySelector('.hm-count small').textContent = total ? `${Math.round((count / total) * 100)}%` : '';
      });

      const seen = new Set();
      for (const p of state.players) {
        const dot = dots.get(p.id) || { x: null, y: null, color: kit.colorFor(p.id) };
        Object.assign(dot, p);
        dots.set(p.id, dot);
        seen.add(p.id);
      }
      for (const id of dots.keys()) if (!seen.has(id)) dots.delete(id);
    },

    frame(dt) {
      const ease = 1 - Math.exp(-dt / 0.25); // reaches a new state in about half a second
      const { ctx, w, h } = kit.fitCanvas(canvas);
      ctx.fillStyle = '#15110f';
      ctx.fillRect(0, 0, w, h);
      const G = grid;
      const rects = kit.layout(zones.length, w, h);

      for (let i = 0; i < heatNow.length; i++) heatNow[i] += (heatTarget[i] - heatNow[i]) * ease;

      cellCanvas.width = cellCanvas.height = G;
      const cells = cellCanvas.getContext('2d');
      const img = cells.createImageData(G, G);

      rects.forEach((r, z) => {
        const x = r.x + PAD, y = r.y + PAD, rw = r.w - 2 * PAD, rh = r.h - 2 * PAD;
        ctx.fillStyle = '#1d1714';
        ctx.fillRect(x, y, rw, rh);

        for (let c = 0; c < G * G; c++) {
          const [red, green, blue, alpha] = heatColor(Math.min(1, heatNow[z * G * G + c]));
          img.data.set([red, green, blue, alpha * 255], c * 4);
        }
        cells.putImageData(img, 0, 0);
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, rw, rh);
        ctx.clip();
        ctx.imageSmoothingEnabled = true;
        ctx.filter = `blur(${Math.round(Math.min(r.w, r.h) / G)}px)`;
        ctx.drawImage(cellCanvas, x, y, rw, rh);
        ctx.restore();

        ctx.strokeStyle = '#3a2f2a';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, rw, rh);
      });

      for (const dot of dots.values()) {
        const r = rects[dot.z];
        if (!r) continue;
        const tx = r.x + ((dot.u + 0.5) / G) * r.w, ty = r.y + ((dot.v + 0.5) / G) * r.h;
        if (dot.x === null) { dot.x = tx; dot.y = ty; }
        dot.x += (tx - dot.x) * ease;
        dot.y += (ty - dot.y) * ease;
        // A touching finger is a big bright dot; a vote left in place is smaller and quieter.
        ctx.globalAlpha = dot.down ? 1 : 0.7;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.down ? 10 : 6, 0, Math.PI * 2);
        ctx.fillStyle = dot.color;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = dot.down ? '#f6efe8' : '#15110f';
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    },

    destroy() {
      window.removeEventListener('resize', placeLabels);
      stage.innerHTML = '';
    },
  };
}
