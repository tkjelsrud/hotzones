// Our town: a street of houses, one per vote, from shanties on the left to brick houses on the right.
// A quality nobody votes for has no houses. New votes pop up a house, lost votes sink one, and the street
// closes up around them. Reuses Our house's drawings, scenery, scale and visitors.
import { HOUSES, drawScenery, nextVisit, newTumbleweed, drawTumbleweed, carVisit, drawCar } from '../ourhouse/theme.js';

const STAGES = 4;
const MAX_HOUSES = 40; // past this, each house stands for several votes

export function mount(stage, kit) {
  kit.loadCss(new URL('../ourhouse/theme.css', import.meta.url));
  kit.loadCss(new URL('theme.css', import.meta.url));
  stage.innerHTML = `
    <canvas class="oh-canvas"></canvas>
    <div class="ot-note" hidden></div>
    <div class="oh-scale"><div class="oh-track"><div class="oh-marker"></div></div><div class="oh-labels"></div></div>`;
  const canvas = stage.querySelector('canvas');
  const labels = stage.querySelector('.oh-labels');
  const marker = stage.querySelector('.oh-marker');
  const note = stage.querySelector('.ot-note');

  let houses = []; // { id, stage, slot, x, y, scale, grow (0-1), leaving }
  let nextId = 0, total = 0, target = 1.5, shown = 1.5, voted = false, time = 0;
  let zonesKey = '', counts = [0, 0, 0, 0];
  let visitIn = nextVisit(), weed = null, car = null;

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

      counts = state.counts.slice(0, STAGES);
      total = counts.reduce((a, b) => a + b, 0);
      voted = total > 0;
      target = voted ? counts.reduce((sum, c, z) => sum + c * z, 0) / total : 1.5;

      // How many houses each quality gets, then add or retire houses to match.
      const per = Math.max(1, Math.ceil(total / MAX_HOUSES));
      note.hidden = per === 1;
      note.textContent = `Each house = ${per} votes`;
      counts.forEach((c, z) => {
        const want = c ? Math.max(1, Math.round(c / per)) : 0;
        const staying = houses.filter((h) => h.stage === z && !h.leaving);
        for (let i = staying.length; i < want; i++) houses.push({ id: nextId++, stage: z, x: null, grow: 0, leaving: false });
        staying.slice(want).forEach((h) => { h.leaving = true; });
      });
      // The street, left to right: by quality, then by age. Leaving houses keep their spot until gone.
      houses.filter((h) => !h.leaving).sort((a, b) => a.stage - b.stage || a.id - b.id).forEach((h, i, all) => {
        h.slot = i;
        h.of = all.length;
      });
    },

    frame(dt) {
      time += dt;
      shown += (target - shown) * (1 - Math.exp(-dt / 0.7));
      const { ctx, w, h } = kit.fitCanvas(canvas);
      const groundY = h * 0.62;
      drawScenery(ctx, w, h, groundY, voted ? shown / (STAGES - 1) : 1);

      // Place the street: one row for a few houses, up to three staggered rows for many.
      const n = houses.filter((x) => !x.leaving).length;
      const rows = n <= 7 ? 1 : n <= 18 ? 2 : 3;
      const margin = w * 0.07, spacing = (w - 2 * margin) / Math.max(1, n);
      const size = Math.min((spacing * rows) / 1.5, h * 0.2, w * 0.12);
      const ease = 1 - Math.exp(-dt / 0.35);
      for (const house of houses) {
        if (!house.leaving) {
          const depth = rows > 1 ? house.slot % rows : 0; // neighbours alternate rows, so the street zigzags
          house.depth = depth;
          house.tx = margin + (house.slot + 0.5) * spacing;
          house.ty = groundY + h * (0.1 - depth * 0.045);
          house.tscale = 1 - depth * 0.17;
        }
        if (house.x === null) [house.x, house.y, house.scale] = [house.tx, house.ty, house.tscale];
        house.x += (house.tx - house.x) * ease;
        house.y += (house.ty - house.y) * ease;
        house.scale += (house.tscale - house.scale) * ease;
        house.grow = Math.max(0, Math.min(1, house.grow + (house.leaving ? -dt : dt) / 0.45));
      }
      houses = houses.filter((x) => !(x.leaving && x.grow === 0));

      // Visitors: a tumbleweed when shanties are the biggest group, a car coming home to a brick house.
      const bricks = houses.filter((x) => x.stage === 3 && !x.leaving);
      const shanty = counts[0] > 0 && counts[0] >= Math.max(...counts);
      if (car && (car.house.leaving || !houses.includes(car.house))) car = null;
      if (shanty || bricks.length) visitIn -= dt;
      if (visitIn <= 0 && !weed && !car) {
        const choices = [...(shanty ? ['weed'] : []), ...(bricks.length ? ['car'] : [])];
        const pick = choices[Math.floor(Math.random() * choices.length)];
        if (pick === 'weed') weed = newTumbleweed(size);
        if (pick === 'car') {
          const front = Math.min(...bricks.map((x) => x.depth));
          const near = bricks.filter((x) => x.depth === front);
          car = { t: 0, house: near[Math.floor(Math.random() * near.length)] };
        }
        visitIn = nextVisit(pick === 'car' ? 5 : 0);
      }
      if (weed && !drawTumbleweed(ctx, weed, dt, w, groundY)) weed = null;

      // Back rows first, so nearer houses stand in front.
      for (const house of [...houses].sort((a, b) => b.depth - a.depth || a.x - b.x)) {
        const f = house.scale * (house.leaving ? house.grow : popOut(house.grow));
        if (f <= 0.001) continue;
        ctx.save();
        ctx.translate(house.x, house.y);
        ctx.scale(f, f);
        let visit = null;
        if (car && car.house === house) {
          visit = carVisit(car, dt, (-house.x - size) / f, size);
          if (visit.done) car = null;
        }
        HOUSES[house.stage](ctx, size, time + house.id * 0.37, visit ? visit.door : 0);
        if (visit?.car) drawCar(ctx, size, visit.car);
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

// Grows from nothing with a little overshoot, like it popped out of the ground.
function popOut(t) {
  const c = 1.7;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}
