// Our house: one house in the middle of a field shows how solid the room thinks something is.
// Four zones, left to right: shanty, shack, clapboard, brick. The house shows the stage nearest the average vote
// and swaps with a quick crossfade and a wobble; the sky, sun and grass shift smoothly with the average.

const STAGES = 4;
const SWAP_SECONDS = 0.35; // how long the crossfade between two houses takes
const BRICK_SHIFT = 0.15; // the brick house is wider on the left (the wing), so it moves right to stay centred
const GARAGE = { x: -0.8, w: 0.42, h: 0.3 }; // the garage door in the wing, in house widths, before the shift
// The car's visit, in seconds: drive up to the garage, open the door, the car is gone inside, close the door.
const CAR = { drive: 3.2, open: 0.9, vanish: 0.5, close: 0.9 };

export function mount(stage, kit) {
  kit.loadCss(new URL('theme.css', import.meta.url));
  stage.innerHTML = `
    <canvas class="oh-canvas"></canvas>
    <div class="oh-scale"><div class="oh-track"><div class="oh-marker"></div></div><div class="oh-labels"></div></div>`;
  const canvas = stage.querySelector('canvas');
  const labels = stage.querySelector('.oh-labels');
  const marker = stage.querySelector('.oh-marker');

  const layers = [document.createElement('canvas'), document.createElement('canvas')];

  let target = 1.5, shown = 1.5, voted = false, time = 0, wobble = 0;
  let house = 2, previous = 2, fade = 1; // the stage on show, the one before it, and how far the swap has come (0-1)
  // Now and then the shanty gets a tumbleweed rolling past behind it, and the brick house a car coming home.
  let visitIn = nextVisit(), weed = null, car = null;
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
      shown += (target - shown) * (1 - Math.exp(-dt / 0.7));
      const now = Math.max(0, Math.min(STAGES - 1, Math.round(shown)));
      if (now !== house) {
        [previous, house, fade, wobble] = [house, now, 0, 1]; // changed stage: swap houses and give it a shake
      }
      fade = Math.min(1, fade + dt / SWAP_SECONDS);
      wobble = Math.max(0, wobble - dt * 1.2);

      const { ctx, w, h } = kit.fitCanvas(canvas);
      const groundY = h * 0.68;
      drawScenery(ctx, w, h, groundY, voted ? shown / (STAGES - 1) : 1); // the scenery shifts smoothly with the average

      const size = Math.min(w * 0.28, h * 0.42);
      if (house === 0 || house === 3) visitIn -= dt;
      else visitIn = nextVisit();
      if (house !== 3) car = null; // the garage is gone: so is the car
      if (visitIn <= 0 && !weed && !car) {
        if (house === 0) weed = newTumbleweed(size);
        else car = { t: 0 };
        visitIn = nextVisit(car ? 5 : 0); // the car comes a little less often
      }
      if (weed && !drawTumbleweed(ctx, weed, dt, w, groundY - size * 0.05)) weed = null;
      const visit = car && carVisit(car, dt, w, size);
      if (visit?.done) car = null;

      const alpha = voted ? 1 : 0.45; // no votes yet: a faint house in the middle of the scale
      // One whole house at a time. Only during a swap are two drawn, each whole on its own layer and then blended,
      // so one house never shows through the other's parts.
      [[previous, 1 - fade], [house, fade]].forEach(([stage, share], i) => {
        if (share < 0.01) return;
        const lctx = clearLayer(layers[i], canvas.width, canvas.height, w);
        lctx.translate(w / 2, groundY);
        lctx.rotate(Math.sin(time * 16) * 0.035 * wobble);
        HOUSES[stage](lctx, size, time, stage === 3 && visit ? visit.door : 0);
        ctx.globalAlpha = alpha * share;
        ctx.drawImage(layers[i], 0, 0, w, h);
      });
      ctx.globalAlpha = 1;
      if (visit?.car) {
        ctx.save();
        ctx.translate(w / 2, groundY);
        drawCar(ctx, size, visit.car);
        ctx.restore();
      }

      marker.style.left = `${((shown + 0.5) / STAGES) * 100}%`;
      marker.classList.toggle('oh-faint', !voted);
    },

    destroy() {
      stage.innerHTML = '';
    },
  };
}

// Seconds until the next visitor: somewhere between 10 and 30, plus `extra`.
const nextVisit = (extra = 0) => 10 + extra + Math.random() * 20;

const ease = (t) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

// Where the car and the garage door are, `car.t` seconds into its visit. Positions are relative to the
// middle of the screen at ground level. Returns { door, car: { x, alpha, wheel } | null, done }.
function carVisit(car, dt, w, s) {
  car.t += dt;
  const doorX = (GARAGE.x + GARAGE.w / 2 + BRICK_SHIFT) * s, startX = -w / 2 - s * 0.3;
  let t = car.t;
  if (t < CAR.drive) {
    const x = startX + (doorX - startX) * ease(t / CAR.drive);
    return { door: 0, car: { x, alpha: 1, wheel: x / (s * 0.03) } };
  }
  const parked = { x: doorX, wheel: doorX / (s * 0.03) };
  if ((t -= CAR.drive) < CAR.open) return { door: ease(t / CAR.open), car: { ...parked, alpha: 1 } };
  if ((t -= CAR.open) < CAR.vanish) return { door: 1, car: { ...parked, alpha: 1 - t / CAR.vanish } };
  t -= CAR.vanish;
  return { door: 1 - ease(t / CAR.close), car: null, done: t >= CAR.close };
}

// A red convertible facing right, wheels on the ground at (car.x, 0).
function drawCar(ctx, s, car) {
  const L = s * 0.36;
  ctx.save();
  ctx.globalAlpha = car.alpha;
  ctx.translate(car.x, 0);
  ctx.scale(L, L);
  ctx.strokeStyle = '#2f3540';
  ctx.lineWidth = 0.03;
  ctx.lineCap = 'round';
  line(ctx, 0.04, -0.2, -0.06, -0.31); // windscreen
  ctx.fillStyle = '#3a2a22';
  ctx.beginPath();
  ctx.arc(-0.16, -0.28, 0.05, 0, Math.PI * 2); // the driver
  ctx.fill();
  ctx.fillStyle = '#e0412f';
  shape(ctx, [[-0.5, -0.07], [-0.48, -0.19], [-0.1, -0.2], [0.04, -0.2], [0.4, -0.16], [0.5, -0.11], [0.5, -0.07]]);
  ctx.fillStyle = '#a8291f';
  ctx.fillRect(-0.5, -0.09, 1, 0.03);
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(0.45, -0.15, 0.05, 0.03);
  ctx.fillStyle = '#7a1c14';
  ctx.fillRect(-0.5, -0.17, 0.03, 0.04);
  for (const wx of [-0.3, 0.3]) {
    ctx.fillStyle = '#1f2228';
    ctx.beginPath();
    ctx.arc(wx, -0.085, 0.085, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#b8bcc4';
    ctx.lineWidth = 0.015;
    for (let k = 0; k < 3; k++) {
      const a = car.wheel + (k * Math.PI) / 3;
      line(ctx, wx - Math.cos(a) * 0.045, -0.085 - Math.sin(a) * 0.045, wx + Math.cos(a) * 0.045, -0.085 + Math.sin(a) * 0.045);
    }
  }
  ctx.restore();
}

// A tangle of loops, rolling in from the left or the right.
function newTumbleweed(s) {
  const r = s * (0.1 + Math.random() * 0.03);
  return {
    r,
    dir: Math.random() < 0.5 ? 1 : -1,
    x: null,
    t: 0,
    spin: 0,
    hop: r * (1.2 + Math.random()),
    speed: s * (0.9 + Math.random() * 0.5), // pixels a second
    loops: Array.from({ length: 16 }, () => [Math.random() * r * 0.5, Math.random() * r * 0.5, r * (0.35 + Math.random() * 0.6), r * (0.25 + Math.random() * 0.5), Math.random() * Math.PI]),
  };
}

// Moves and draws the tumbleweed along the ground line. Returns false once it has left the screen.
function drawTumbleweed(ctx, weed, dt, w, groundY) {
  if (weed.x === null) weed.x = weed.dir > 0 ? -weed.r * 2 : w + weed.r * 2;
  weed.t += dt;
  weed.x += weed.dir * weed.speed * dt;
  weed.spin += (weed.dir * weed.speed * dt) / weed.r;
  const y = groundY - weed.r - Math.abs(Math.sin(weed.t * 4.2)) * weed.hop * Math.exp(-weed.t * 0.08);
  ctx.save();
  ctx.translate(weed.x, y);
  ctx.rotate(weed.spin);
  ctx.strokeStyle = '#7a5a32';
  ctx.lineWidth = Math.max(1.5, weed.r * 0.06);
  for (const [dx, dy, rx, ry, a] of weed.loops) {
    ctx.beginPath();
    ctx.ellipse(dx - weed.r * 0.25, dy - weed.r * 0.25, rx, ry, a, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  return weed.dir > 0 ? weed.x < w + weed.r * 3 : weed.x > -weed.r * 3;
}

// An offscreen canvas the size of the stage, cleared, drawing in CSS pixels.
function clearLayer(layer, pw, ph, w) {
  if (layer.width !== pw || layer.height !== ph) [layer.width, layer.height] = [pw, ph];
  const ctx = layer.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, pw, ph);
  ctx.setTransform(pw / w, 0, 0, pw / w, 0, 0);
  return ctx;
}

// The scene follows the house. mood 0 = falling apart: a dusky sky, the sun setting behind dry yellow grass.
// mood 1 = solid as brick: a clear blue day, the sun high, green grass.
export function drawScenery(ctx, w, h, groundY, mood = 1) {
  const sky = ctx.createLinearGradient(0, 0, 0, groundY);
  sky.addColorStop(0, mix('#3d4a6b', '#8fbcd9', mood));
  sky.addColorStop(1, mix('#e0956a', '#bcdbea', mood));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, groundY);
  const r = Math.min(w, h) * 0.06;
  ctx.fillStyle = mix('#ff9a4d', '#ffe08a', mood);
  ctx.beginPath();
  ctx.arc(w * 0.8, mix(groundY + r * 0.2, h * 0.18, mood), r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = mix('#c4b35c', '#6fa34f', mood);
  ctx.fillRect(0, groundY, w, h - groundY);
}

// Blends two hex colours (t = 0 gives a, 1 gives b), or two numbers.
function mix(a, b, t) {
  if (typeof a === 'number') return a + (b - a) * t;
  const [x, y] = [parseInt(a.slice(1), 16), parseInt(b.slice(1), 16)];
  const ch = (n, s) => (n >> s) & 255;
  return `rgb(${[16, 8, 0].map((s) => Math.round(ch(x, s) + (ch(y, s) - ch(x, s)) * t)).join(', ')})`;
}

// Each house is drawn with its base centred on (0, 0), `s` wide. Few shapes, flat colours.
// The stages run from a patched-together shack to a modern brick house with a glass gable.
export const HOUSES = [
  // 0: shanty – ochre plaster and a mud wall, loose tin sheets, a red board for a door, a barred window,
  // newspaper patches, crooked poles and a cloth hung out to dry.
  (ctx, s, time) => {
    const wh = s * 0.56;
    ctx.fillStyle = '#a3906e';
    shape(ctx, [[-s * 0.7, s * 0.03], [s * 0.72, s * 0.03], [s * 0.66, -s * 0.02], [-s * 0.64, -s * 0.02]]);
    ctx.fillStyle = '#d6ac48';
    shape(ctx, [[-s * 0.06, 0], [s * 0.46, 0], [s * 0.44, -wh], [-s * 0.07, -wh * 0.94]]);
    ctx.fillStyle = 'rgba(140, 100, 40, 0.35)'; // damp stains
    blob(ctx, s * 0.36, -wh * 0.2, s * 0.09, s * 0.12);
    blob(ctx, s * 0.05, -wh * 0.85, s * 0.1, s * 0.05);
    ctx.fillStyle = '#7d7264';
    shape(ctx, [[-s * 0.46, 0], [-s * 0.06, 0], [-s * 0.07, -wh * 0.8], [-s * 0.44, -wh * 0.74]]);
    ctx.fillStyle = '#9a8f7e';
    shape(ctx, [[-s * 0.16, -wh * 0.9], [s * 0.04, -wh * 0.93], [s * 0.03, -wh * 1.14], [-s * 0.15, -wh * 1.1]]);
    ctx.fillStyle = '#b04a3f';
    shape(ctx, [[-s * 0.4, -wh * 0.08], [-s * 0.21, -wh * 0.1], [-s * 0.2, -wh * 0.72], [-s * 0.41, -wh * 0.68]]);
    ctx.fillStyle = '#4f6d8a';
    ctx.fillRect(-s * 0.36, -wh * 0.58, s * 0.1, s * 0.08);
    ctx.fillStyle = '#2e2924';
    ctx.fillRect(-s * 0.19, -wh * 0.72, s * 0.12, wh * 0.72);
    ctx.strokeStyle = '#c9b38a';
    ctx.lineWidth = s * 0.012;
    line(ctx, -s * 0.12, 0, -s * 0.13, -wh * 0.66);
    ctx.fillStyle = '#9c3a30';
    ctx.fillRect(s * 0.07, -wh * 0.74, s * 0.2, s * 0.19);
    ctx.fillStyle = '#2e2924';
    ctx.fillRect(s * 0.09, -wh * 0.72, s * 0.16, s * 0.15);
    ctx.strokeStyle = '#c4c0b8';
    ctx.lineWidth = s * 0.008;
    for (let i = 1; i < 5; i++) line(ctx, s * (0.09 + i * 0.032), -wh * 0.72, s * (0.09 + i * 0.032), -wh * 0.72 + s * 0.15);
    paper(ctx, s, s * 0.35, -wh * 0.42, 0.06);
    paper(ctx, s, s * 0.31, -wh * 0.2, -0.05);
    sheet(ctx, s, -s * 0.28, -wh * 0.8, s * 0.56, s * 0.07, -0.1, '#b8673a');
    sheet(ctx, s, s * 0.22, -wh * 1.05, s * 0.74, s * 0.08, 0.17, '#8d949a');
    sheet(ctx, s, s * 0.02, -wh * 1.02, s * 0.32, s * 0.06, -0.24, '#c2793f');
    ctx.strokeStyle = '#7b5a3a';
    ctx.lineCap = 'round';
    ctx.lineWidth = s * 0.025;
    line(ctx, -s * 0.56, 0, -s * 0.5, -wh * 0.86);
    line(ctx, s * 0.5, 0, s * 0.55, -wh * 0.98);
    line(ctx, s * 0.62, -wh * 0.05, s * 0.76, -wh * 0.92);
    ctx.fillStyle = '#3d7d6a';
    const sway = Math.sin(time * 2.2) * s * 0.015;
    shape(ctx, [[s * 0.55, -wh * 0.9], [s * 0.66, -wh * 0.86], [s * 0.67 + sway, -wh * 0.5], [s * 0.56 + sway, -wh * 0.54]]);
  },

  // 1: wobbly – a lean plank shack with a plaster patch, a tin shed roof with one rusty sheet,
  // a plank door, a window with a hanging shutter and a prop holding up one side.
  (ctx, s) => {
    const wh = s * 0.6;
    ctx.fillStyle = '#a3906e';
    shape(ctx, [[-s * 0.6, s * 0.03], [s * 0.6, s * 0.03], [s * 0.56, -s * 0.015], [-s * 0.56, -s * 0.015]]);
    const wall = [[-s * 0.45, 0], [s * 0.45, 0], [s * 0.44, -wh * 0.9], [-s * 0.46, -wh * 1.04]];
    ctx.fillStyle = '#8f7a62';
    shape(ctx, wall);
    clipTo(ctx, wall, () => {
      ctx.strokeStyle = '#6f5d4a';
      ctx.lineWidth = s * 0.01;
      for (let x = -s * 0.45; x < s * 0.45; x += s * 0.075) line(ctx, x, 0, x + s * 0.004, -wh * 1.1);
      ctx.fillStyle = '#d1a84c';
      shape(ctx, [[s * 0.08, 0], [s * 0.46, 0], [s * 0.46, -wh * 0.5], [s * 0.12, -wh * 0.44]]);
    });
    ctx.fillStyle = '#6b4f36';
    shape(ctx, [[-s * 0.31, 0], [-s * 0.12, 0], [-s * 0.12, -wh * 0.64], [-s * 0.31, -wh * 0.62]]);
    ctx.strokeStyle = '#563e2a';
    ctx.lineWidth = s * 0.008;
    for (const x of [-0.25, -0.18]) line(ctx, s * x, 0, s * x, -wh * 0.63);
    ctx.fillStyle = '#2e2924';
    ctx.fillRect(s * 0.12, -wh * 0.78, s * 0.18, s * 0.15);
    ctx.fillStyle = '#4f6d8a';
    shape(ctx, [[s * 0.3, -wh * 0.78], [s * 0.38, -wh * 0.74], [s * 0.38, -wh * 0.5], [s * 0.3, -wh * 0.53]]);
    sheet(ctx, s, 0, -wh * 1.0, s * 1.1, s * 0.07, 0.13, '#9aa1a6');
    sheet(ctx, s, -s * 0.3, -wh * 1.07, s * 0.36, s * 0.075, 0.13, '#b8673a');
    ctx.strokeStyle = '#7b5a3a';
    ctx.lineCap = 'round';
    ctx.lineWidth = s * 0.025;
    line(ctx, s * 0.62, 0, s * 0.47, -wh * 0.84);
  },

  // 2: pretty sturdy – a proper gable takes shape: painted clapboard on a brick plinth, a tidy tin roof,
  // a small chimney, a lit window, a little attic window and a porch on the side.
  (ctx, s, time) => {
    const wh = s * 0.6, peak = -s * 0.98;
    smoke(ctx, s, time, -s * 0.21, -s * 0.94, 0.6);
    ctx.fillStyle = '#9b4a37';
    ctx.fillRect(-s * 0.26, -s * 0.94, s * 0.1, s * 0.22);
    ctx.strokeStyle = '#6d7680';
    ctx.lineWidth = s * 0.05;
    line(ctx, -s * 0.66, -wh * 0.6, -s * 0.42, -wh * 0.8);
    ctx.strokeStyle = '#7b5a3a';
    ctx.lineWidth = s * 0.025;
    line(ctx, -s * 0.62, 0, -s * 0.62, -wh * 0.62);
    const body = [[-s * 0.42, 0], [s * 0.42, 0], [s * 0.42, -wh], [0, peak + s * 0.04], [-s * 0.42, -wh]];
    ctx.fillStyle = '#c98a4b';
    shape(ctx, body);
    clipTo(ctx, body, () => {
      ctx.strokeStyle = '#a96f38';
      ctx.lineWidth = s * 0.008;
      for (let y = -s * 0.14; y > peak; y -= s * 0.05) line(ctx, -s * 0.42, y, s * 0.42, y);
      ctx.fillStyle = '#a64f3a';
      ctx.fillRect(-s * 0.42, -s * 0.12, s * 0.84, s * 0.12);
      bricks(ctx, s, -s * 0.42, -s * 0.12, s * 0.42, 0);
    });
    ctx.strokeStyle = '#5d6670';
    ctx.lineWidth = s * 0.06;
    ctx.lineJoin = 'miter';
    ctx.beginPath();
    ctx.moveTo(-s * 0.52, -wh + s * 0.06);
    ctx.lineTo(0, peak);
    ctx.lineTo(s * 0.52, -wh + s * 0.06);
    ctx.stroke();
    ctx.fillStyle = '#3b4250';
    ctx.fillRect(-s * 0.05, -s * 0.82, s * 0.1, s * 0.1);
    ctx.fillStyle = '#5a3820';
    ctx.fillRect(-s * 0.28, -s * 0.42, s * 0.16, s * 0.42);
    ctx.fillStyle = '#f3d98b';
    ctx.fillRect(s * 0.08, -s * 0.48, s * 0.22, s * 0.2);
    ctx.strokeStyle = '#f6efe8';
    ctx.lineWidth = s * 0.014;
    ctx.strokeRect(s * 0.08, -s * 0.48, s * 0.22, s * 0.2);
    line(ctx, s * 0.19, -s * 0.48, s * 0.19, -s * 0.28);
  },

  // 3: solid as brick – a modern brick house: a tall gable with a triangle of glass, a chimney on the slope,
  // a wide lower wing with a garage door and wood slats, and a wide window at ground level.
  // garage: how far the garage door is open (0-1).
  (ctx, s, time, garage = 0) => {
    ctx.save();
    ctx.translate(s * BRICK_SHIFT, 0);
    const wh = s * 0.62, peakX = s * 0.175, peakY = -s * 1.17;
    smoke(ctx, s, time, s * 0.04, -s * 1.12, 1);
    ctx.fillStyle = '#93432f';
    ctx.fillRect(0, -s * 1.12, s * 0.08, s * 0.26);
    const wing = [[-s * 0.86, 0], [-s * 0.2, 0], [-s * 0.2, -s * 0.42], [-s * 0.53, -s * 0.68], [-s * 0.86, -s * 0.42]];
    ctx.fillStyle = '#a24c38';
    shape(ctx, wing);
    clipTo(ctx, wing, () => bricks(ctx, s, -s * 0.86, -s * 0.7, -s * 0.2, 0));
    const [gx, gw, gh] = [GARAGE.x * s, GARAGE.w * s, GARAGE.h * s];
    ctx.fillStyle = '#2b2622';
    ctx.fillRect(gx, -gh, gw, gh);
    ctx.fillStyle = 'rgba(243, 217, 139, 0.2)'; // warm light inside
    ctx.fillRect(gx + gw * 0.2, -gh, gw * 0.6, gh);
    const panel = gh * (1 - garage); // a roll-up door: what is left of it hangs from the top
    ctx.fillStyle = '#3a3f47';
    ctx.fillRect(gx, -gh, gw, panel);
    ctx.strokeStyle = '#2a2d33';
    ctx.lineWidth = s * 0.006;
    for (let y = -gh + gh / 8; y < -gh + panel; y += gh / 8) line(ctx, gx, y, gx + gw, y);
    ctx.strokeStyle = '#7a3627';
    ctx.lineWidth = s * 0.016;
    ctx.strokeRect(gx, -gh, gw, gh);
    ctx.strokeStyle = '#9a6a40';
    ctx.lineWidth = s * 0.014;
    for (let x = -s * 0.33; x < -s * 0.23; x += s * 0.026) line(ctx, x, 0, x, -s * 0.4);
    const main = [[-s * 0.2, 0], [s * 0.55, 0], [s * 0.55, -wh], [peakX, peakY], [-s * 0.2, -wh]];
    ctx.fillStyle = '#a9503b';
    shape(ctx, main);
    clipTo(ctx, main, () => bricks(ctx, s, -s * 0.2, peakY, s * 0.55, 0));
    ctx.strokeStyle = '#7a3627';
    ctx.lineWidth = s * 0.022;
    ctx.lineJoin = 'miter';
    for (const outline of [[[-s * 0.86, -s * 0.42], [-s * 0.53, -s * 0.68], [-s * 0.2, -s * 0.42]], [[-s * 0.2, -wh], [peakX, peakY], [s * 0.55, -wh]]]) {
      ctx.beginPath();
      outline.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
    const glass = [[-s * 0.045, -s * 0.68], [s * 0.395, -s * 0.68], [peakX, -s * 1.0]];
    ctx.fillStyle = '#2f3743';
    shape(ctx, glass);
    clipTo(ctx, glass, () => {
      ctx.fillStyle = 'rgba(160, 190, 215, 0.3)'; // sky reflected in the glass
      shape(ctx, [[-s * 0.05, -s * 0.68], [s * 0.1, -s * 0.68], [s * 0.26, -s * 1.0], [s * 0.11, -s * 1.0]]);
      ctx.strokeStyle = '#55606c';
      ctx.lineWidth = s * 0.008;
      for (let x = s * 0.25; x < s * 0.4; x += s * 0.022) line(ctx, x, -s * 0.68, x, -s * 1.0);
    });
    ctx.strokeStyle = '#2a2d33';
    ctx.lineWidth = s * 0.016;
    ctx.beginPath();
    glass.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = '#3a3f47';
    ctx.fillRect(-s * 0.14, -s * 0.44, s * 0.15, s * 0.44);
    ctx.fillStyle = '#2c2f36';
    ctx.fillRect(s * 0.12, -s * 0.34, s * 0.4, s * 0.3);
    ctx.fillStyle = '#c9dbe2';
    ctx.fillRect(s * 0.14, -s * 0.32, s * 0.36, s * 0.26);
    ctx.fillStyle = 'rgba(243, 217, 139, 0.55)';
    ctx.fillRect(s * 0.33, -s * 0.32, s * 0.17, s * 0.26);
    ctx.fillStyle = '#2c2f36';
    ctx.fillRect(s * 0.31, -s * 0.34, s * 0.02, s * 0.3);
    ctx.restore();
  },
];

// Chimney smoke: three puffs that rise and fade, then start over.
function smoke(ctx, s, time, x, y, amount) {
  ctx.fillStyle = 'rgba(240, 240, 245, 0.7)';
  for (let i = 0; i < 3; i++) {
    const t = (time * 0.35 + i / 3) % 1;
    ctx.save();
    ctx.globalAlpha *= (1 - t) * amount;
    ctx.beginPath();
    ctx.arc(x + Math.sin(t * 6) * s * 0.03, y - t * s * 0.3, s * (0.03 + t * 0.05), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// A sheet of corrugated tin, centred on (cx, cy) and turned by `angle`.
function sheet(ctx, s, cx, cy, w, h, angle, color) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.lineWidth = s * 0.006;
  for (let x = -w / 2 + s * 0.03; x < w / 2; x += s * 0.03) line(ctx, x, -h / 2, x, h / 2);
  ctx.restore();
}

// A newspaper pasted over a crack.
function paper(ctx, s, cx, cy, angle) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.fillStyle = '#e3e0d6';
  ctx.fillRect(-s * 0.06, -s * 0.07, s * 0.12, s * 0.14);
  ctx.strokeStyle = '#a9a59a';
  ctx.lineWidth = s * 0.006;
  for (let y = -s * 0.05; y < s * 0.06; y += s * 0.02) line(ctx, -s * 0.045, y, s * 0.045, y);
  ctx.restore();
}

// Brick courses over a rectangle; clip first to keep them inside a shape.
function bricks(ctx, s, x0, y0, x1, y1) {
  const row = s * 0.035;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.16)';
  ctx.lineWidth = s * 0.005;
  for (let i = 0, y = y1; y > y0; i++, y -= row) {
    line(ctx, x0, y, x1, y);
    for (let x = x0 + (i % 2 ? row * 1.5 : 0); x < x1; x += row * 3) line(ctx, x, y, x, y - row);
  }
}

function clipTo(ctx, points, draw) {
  ctx.save();
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.clip();
  draw();
  ctx.restore();
}

function blob(ctx, x, y, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

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
