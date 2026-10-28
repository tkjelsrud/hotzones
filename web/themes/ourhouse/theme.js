// Our house: one house in the middle of a field shows how solid the room thinks something is.
// Four zones, left to right: shanty, sticks, planks, brick. The house follows the average vote and
// blends between stages, with a little wobble when it changes.

const STAGES = 4;

export function mount(stage, kit) {
  kit.loadCss(new URL('theme.css', import.meta.url));
  stage.innerHTML = `
    <canvas class="oh-canvas"></canvas>
    <div class="oh-scale"><div class="oh-track"><div class="oh-marker"></div></div><div class="oh-labels"></div></div>`;
  const canvas = stage.querySelector('canvas');
  const labels = stage.querySelector('.oh-labels');
  const marker = stage.querySelector('.oh-marker');

  let target = 1.5, shown = 1.5, voted = false, time = 0, wobble = 0;
  let zonesKey = '';

  return {
    update(state) {
      const key = [...state.zones, ...state.colors].join('\n');
      if (key !== zonesKey) {
        zonesKey = key;
        labels.innerHTML = '';
        state.zones.slice(0, STAGES).forEach((name, z) => {
          const el = document.createElement('div');
          el.className = 'oh-label';
          el.style.setProperty('--zone', state.colors[z]);
          el.innerHTML = '<span class="oh-name"></span><span class="oh-count"></span>';
          el.querySelector('.oh-name').textContent = name;
          labels.append(el);
        });
      }
      [...labels.children].forEach((el, z) => { el.querySelector('.oh-count').textContent = state.counts[z] || 0; });

      // The house follows the average vote: 0 = shanty ... 3 = brick.
      const counts = state.counts.slice(0, STAGES);
      const total = counts.reduce((a, b) => a + b, 0);
      voted = total > 0;
      target = voted ? counts.reduce((sum, c, z) => sum + c * z, 0) / total : 1.5;
    },

    frame(dt) {
      time += dt;
      const before = Math.round(shown);
      shown += (target - shown) * (1 - Math.exp(-dt / 0.7));
      if (Math.round(shown) !== before) wobble = 1; // changed stage: give it a shake
      wobble = Math.max(0, wobble - dt * 1.2);

      const { ctx, w, h } = kit.fitCanvas(canvas);
      const groundY = h * 0.68;
      drawScenery(ctx, w, h, groundY);

      const size = Math.min(w * 0.3, h * 0.46);
      const lower = Math.min(STAGES - 2, Math.floor(shown)), blend = shown - lower;
      ctx.save();
      ctx.translate(w / 2, groundY);
      ctx.rotate(Math.sin(time * 16) * 0.035 * wobble);
      ctx.globalAlpha = voted ? 1 : 0.45; // no votes yet: a faint house in the middle of the scale
      const alpha = ctx.globalAlpha;
      ctx.globalAlpha = alpha * (1 - blend);
      HOUSES[lower](ctx, size, time);
      ctx.globalAlpha = alpha * blend;
      HOUSES[lower + 1](ctx, size, time);
      ctx.restore();

      marker.style.left = `${((shown + 0.5) / STAGES) * 100}%`;
      marker.classList.toggle('oh-faint', !voted);
    },

    destroy() {
      stage.innerHTML = '';
    },
  };
}

function drawScenery(ctx, w, h, groundY) {
  ctx.fillStyle = '#9cc3dd';
  ctx.fillRect(0, 0, w, groundY);
  ctx.fillStyle = '#ffe08a';
  ctx.beginPath();
  ctx.arc(w * 0.8, h * 0.18, Math.min(w, h) * 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6fa34f';
  ctx.fillRect(0, groundY, w, h - groundY);
}

// Each house is drawn with its base centred on (0, 0), `s` wide. Few shapes, flat colours.
const HOUSES = [
  // 0: shanty – leaning walls, a sagging roof, a patch and a crooked door.
  (ctx, s) => {
    const wh = s * 0.62;
    ctx.fillStyle = '#8b8178';
    shape(ctx, [[-s / 2, 0], [s / 2, 0], [s * 0.44, -wh * 0.85], [-s * 0.46, -wh * 0.72]]);
    ctx.fillStyle = '#5f5852';
    ctx.beginPath();
    ctx.moveTo(-s * 0.6, -wh * 0.7);
    ctx.quadraticCurveTo(-s * 0.05, -wh * 0.66, s * 0.55, -wh * 0.96);
    ctx.lineTo(s * 0.55, -wh * 0.84);
    ctx.quadraticCurveTo(-s * 0.05, -wh * 0.54, -s * 0.6, -wh * 0.6);
    ctx.fill();
    ctx.fillStyle = '#a89e93';
    shape(ctx, [[s * 0.08, -wh * 0.32], [s * 0.26, -wh * 0.36], [s * 0.27, -wh * 0.18], [s * 0.1, -wh * 0.15]]);
    ctx.fillStyle = '#3b3530';
    shape(ctx, [[-s * 0.32, 0], [-s * 0.15, 0], [-s * 0.17, -wh * 0.42], [-s * 0.33, -wh * 0.38]]);
  },

  // 1: sticks – a row of uneven sticks, a thin crossbar and a stick roof.
  (ctx, s) => {
    const wh = s * 0.62, rh = s * 0.36;
    ctx.strokeStyle = '#c9a96b';
    ctx.lineCap = 'round';
    ctx.lineWidth = s * 0.03;
    for (let i = 0; i <= 9; i++) {
      const x = -s / 2 + (i * s) / 9;
      if (i === 3 || i === 4) continue; // the doorway
      line(ctx, x, 0, x, -wh * (0.9 + ((i * 7) % 4) * 0.04));
    }
    line(ctx, -s * 0.52, -wh * 0.55, s * 0.52, -wh * 0.5);
    ctx.fillStyle = '#b8975a';
    shape(ctx, [[-s * 0.6, -wh], [0, -wh - rh], [s * 0.6, -wh]]);
    ctx.strokeStyle = '#9c7d47';
    ctx.lineWidth = s * 0.015;
    for (const f of [0.3, 0.55, 0.8]) line(ctx, -s * 0.6 * f, -wh - rh * (1 - f), s * 0.6 * f, -wh - rh * (1 - f));
  },

  // 2: planks – a plank box, a simple roof, a door and a lit window.
  (ctx, s) => {
    const wh = s * 0.62, rh = s * 0.38;
    ctx.fillStyle = '#a8703f';
    ctx.fillRect(-s / 2, -wh, s, wh);
    ctx.strokeStyle = '#8a5a31';
    ctx.lineWidth = s * 0.012;
    for (let i = 1; i < 6; i++) line(ctx, -s / 2, -(wh * i) / 6, s / 2, -(wh * i) / 6);
    ctx.fillStyle = '#6e4426';
    shape(ctx, [[-s * 0.58, -wh], [0, -wh - rh], [s * 0.58, -wh]]);
    ctx.fillStyle = '#5a3820';
    ctx.fillRect(-s * 0.3, -wh * 0.55, s * 0.16, wh * 0.55);
    ctx.fillStyle = '#f3d98b';
    ctx.fillRect(s * 0.12, -wh * 0.65, s * 0.18, s * 0.16);
  },

  // 3: brick – a brick body, a proper roof with overhang and chimney, door, window and a wisp of smoke.
  (ctx, s, time) => {
    const wh = s * 0.62, rh = s * 0.42;
    ctx.fillStyle = 'rgba(240, 240, 245, 0.7)';
    for (let i = 0; i < 3; i++) {
      const t = (time * 0.35 + i / 3) % 1; // each puff rises and fades, then starts over
      ctx.save();
      ctx.globalAlpha *= 1 - t;
      ctx.beginPath();
      ctx.arc(s * 0.27 + Math.sin(t * 6) * s * 0.03, -wh - rh * 0.85 - t * s * 0.35, s * (0.03 + t * 0.05), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#8f4232';
    ctx.fillRect(s * 0.2, -wh - rh * 0.85, s * 0.12, rh * 0.6);
    ctx.fillStyle = '#b4553f';
    ctx.fillRect(-s / 2, -wh, s, wh);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.16)';
    ctx.lineWidth = s * 0.008;
    for (let row = 1; row < 8; row++) {
      const y = -(wh * row) / 8;
      line(ctx, -s / 2, y, s / 2, y);
      for (let x = -s / 2 + (row % 2 ? s / 12 : s / 6); x < s / 2; x += s / 6) line(ctx, x, y, x, y + wh / 8);
    }
    ctx.fillStyle = '#3e4a5e';
    shape(ctx, [[-s * 0.64, -wh], [0, -wh - rh], [s * 0.64, -wh]]);
    ctx.fillStyle = '#56647b';
    ctx.fillRect(-s * 0.64, -wh, s * 1.28, s * 0.025);
    ctx.fillStyle = '#2f3a4c';
    ctx.beginPath();
    ctx.roundRect(-s * 0.3, -wh * 0.58, s * 0.17, wh * 0.58, [s * 0.085, s * 0.085, 0, 0]);
    ctx.fill();
    ctx.fillStyle = '#f3d98b';
    ctx.fillRect(s * 0.1, -wh * 0.68, s * 0.22, s * 0.18);
    ctx.strokeStyle = '#f6efe8';
    ctx.lineWidth = s * 0.014;
    ctx.strokeRect(s * 0.1, -wh * 0.68, s * 0.22, s * 0.18);
    line(ctx, s * 0.21, -wh * 0.68, s * 0.21, -wh * 0.68 + s * 0.18);
    line(ctx, s * 0.1, -wh * 0.68 + s * 0.09, s * 0.32, -wh * 0.68 + s * 0.09);
  },
];

function shape(ctx, points) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
}

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
