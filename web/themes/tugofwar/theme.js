// Tug of war: two teams pull a rope, and the knot slides towards the side with more votes.
// Players with a finger down lean back and pull; resting votes stand and hold.

const MAX_SHOWN = 10;   // figures drawn per side; the rest show as "+N"
const MAX_TRAVEL = 0.6; // how far the knot can move, as a share of the half rope

export function mount(stage, kit) {
  kit.loadCss(new URL('theme.css', import.meta.url));
  stage.innerHTML = `
    <canvas class="tw-canvas"></canvas>
    <div class="tw-banner tw-left"><div class="tw-name"></div><div class="tw-count"></div></div>
    <div class="tw-banner tw-right"><div class="tw-name"></div><div class="tw-count"></div></div>
    <div class="tw-shout"></div>`;
  const canvas = stage.querySelector('canvas');
  const banners = [stage.querySelector('.tw-left'), stage.querySelector('.tw-right')];
  const shout = stage.querySelector('.tw-shout');

  const rope = { pos: 0, vel: 0, target: 0 }; // knot offset, -1 (left) to 1 (right)
  const figures = new Map(); // id -> { id, side, down, color, x }
  const dust = [];
  let pulling = 0, time = 0;

  return {
    update(state) {
      const [left = 0, right = 0] = state.counts;
      const total = left + right;
      rope.target = total ? ((right - left) / total) * MAX_TRAVEL : 0;

      state.zones.slice(0, 2).forEach((name, i) => {
        banners[i].querySelector('.tw-name').textContent = name;
        banners[i].querySelector('.tw-count').textContent = state.counts[i] || 0;
        banners[i].style.setProperty('--team', state.colors[i]);
      });
      const lead = total >= 2 && Math.abs(right - left) / total >= 0.6 ? (right > left ? 1 : 0) : -1;
      banners.forEach((b, i) => b.classList.toggle('tw-winning', i === lead));
      shout.textContent = lead >= 0 ? `${state.zones[lead]} is winning!` : '';
      shout.classList.toggle('tw-visible', lead >= 0);

      const seen = new Set();
      for (const p of state.players) {
        if (p.z > 1) continue;
        const fig = figures.get(p.id) || { id: p.id, x: null, color: kit.colorFor(p.id) };
        Object.assign(fig, { side: p.z === 0 ? -1 : 1, down: p.down, team: state.colors[p.z] });
        figures.set(p.id, fig);
        seen.add(p.id);
      }
      for (const id of figures.keys()) if (!seen.has(id)) figures.delete(id);
      pulling = state.players.filter((p) => p.down).length;
    },

    frame(dt) {
      time += dt;
      const { ctx, w, h } = kit.fitCanvas(canvas);
      const s = Math.max(0.6, Math.min(1.6, h / 560));
      const groundY = h * 0.74;
      const ropeY = groundY - 50 * s;

      // Spring towards the target, with a little shake while people pull.
      const shake = pulling ? Math.sin(time * 23) * 0.004 * Math.min(pulling, 5) : 0;
      rope.vel += ((rope.target + shake - rope.pos) * 7 - rope.vel * 3.2) * dt;
      rope.pos += rope.vel * dt;
      const knotX = w / 2 + rope.pos * w * 0.36;

      drawScenery(ctx, w, h, groundY, s, time);

      // Rope: sags a little, pulled tight from end to end.
      ctx.strokeStyle = '#c9a26b';
      ctx.lineWidth = 6 * s;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(knotX - w * 0.44, ropeY);
      ctx.quadraticCurveTo(knotX, ropeY + 5 * s, knotX + w * 0.44, ropeY);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(90, 60, 30, 0.35)';
      ctx.lineWidth = 2 * s;
      ctx.setLineDash([6 * s, 8 * s]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Knot ribbon.
      ctx.fillStyle = '#e8333a';
      ctx.beginPath();
      ctx.moveTo(knotX - 7 * s, ropeY + 2 * s);
      ctx.lineTo(knotX + 7 * s, ropeY + 2 * s);
      ctx.lineTo(knotX + Math.sin(time * 3) * 4 * s, ropeY + 34 * s);
      ctx.closePath();
      ctx.fill();

      // Teams.
      for (const side of [-1, 1]) {
        const team = [...figures.values()].filter((f) => f.side === side).sort((a, b) => a.id - b.id);
        const shown = team.slice(0, MAX_SHOWN);
        const spacing = Math.min(58 * s, (w * 0.34) / Math.max(1, shown.length));
        shown.forEach((fig, i) => {
          const tx = knotX + side * (80 * s + i * spacing);
          fig.x = fig.x === null ? tx : fig.x + (tx - fig.x) * (1 - Math.exp(-dt / 0.3));
          drawFigure(ctx, fig, groundY, ropeY, s, time);
          if (fig.down && Math.random() < dt * 4) {
            dust.push({ x: fig.x - side * 12 * s, y: groundY, vx: -side * (20 + Math.random() * 30) * s, vy: -(10 + Math.random() * 20) * s, life: 1 });
          }
        });
        if (team.length > shown.length) {
          ctx.fillStyle = '#f6efe8';
          ctx.font = `600 ${18 * s}px system-ui, sans-serif`;
          ctx.textAlign = side < 0 ? 'right' : 'left';
          ctx.fillText(`+${team.length - shown.length}`, knotX + side * (100 * s + shown.length * spacing), ropeY - 30 * s);
        }
      }

      // Dust puffs from feet that dig in.
      for (let i = dust.length - 1; i >= 0; i--) {
        const d = dust[i];
        d.life -= dt * 1.4;
        if (d.life <= 0) { dust.splice(i, 1); continue; }
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        ctx.fillStyle = `rgba(160, 120, 80, ${d.life * 0.5})`;
        ctx.beginPath();
        ctx.arc(d.x, d.y, (1.6 - d.life) * 8 * s, 0, Math.PI * 2);
        ctx.fill();
      }
    },

    destroy() {
      stage.innerHTML = '';
    },
  };
}

function drawScenery(ctx, w, h, groundY, s, time) {
  const sky = ctx.createLinearGradient(0, 0, 0, groundY);
  sky.addColorStop(0, '#1f2a4d');
  sky.addColorStop(0.6, '#8a4f6b');
  sky.addColorStop(1, '#f2a65a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, groundY);

  ctx.fillStyle = '#ffd98a';
  ctx.beginPath();
  ctx.arc(w * 0.78, groundY - h * 0.08, 46 * s, 0, Math.PI * 2);
  ctx.fill();

  // Hills.
  ctx.fillStyle = '#3c3350';
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  for (let x = 0; x <= w; x += w / 12) ctx.lineTo(x, groundY - (30 + 22 * Math.sin(x / w * 7 + 1)) * s);
  ctx.lineTo(w, groundY);
  ctx.fill();

  const grass = ctx.createLinearGradient(0, groundY, 0, h);
  grass.addColorStop(0, '#4f7d3a');
  grass.addColorStop(1, '#2a4720');
  ctx.fillStyle = grass;
  ctx.fillRect(0, groundY, w, h - groundY);

  // Mud pit and the centre line.
  ctx.fillStyle = '#5b3a22';
  ctx.beginPath();
  ctx.ellipse(w / 2, groundY + 18 * s, 70 * s, 14 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.beginPath();
  ctx.ellipse(w / 2 - 20 * s + Math.sin(time) * 4 * s, groundY + 15 * s, 18 * s, 3 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = 3 * s;
  ctx.beginPath();
  ctx.moveTo(w / 2, groundY + 36 * s);
  ctx.lineTo(w / 2, h);
  ctx.stroke();
}

// A chunky figure facing the centre. side -1 = left team, 1 = right team.
function drawFigure(ctx, fig, groundY, ropeY, s, time) {
  const { side, down, x } = fig;
  const lean = down ? 0.55 + 0.08 * Math.sin(time * 9 + fig.id) : 0.16 + 0.03 * Math.sin(time * 2 + fig.id);
  const hipY = groundY - (down ? 26 : 32) * s;
  const shoulder = { x: x + side * Math.sin(lean) * 30 * s, y: hipY - Math.cos(lean) * 30 * s };
  const head = { x: shoulder.x + side * Math.sin(lean) * 13 * s, y: shoulder.y - Math.cos(lean) * 13 * s };
  const hands = { x: x - side * 22 * s, y: ropeY };

  ctx.strokeStyle = fig.color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 7 * s;

  // Legs: front foot dug in towards the centre, back foot braced.
  for (const [footX, kneeOut] of [[x - side * (down ? 18 : 10) * s, -1], [x + side * (down ? 6 : 8) * s, 1]]) {
    ctx.beginPath();
    ctx.moveTo(x, hipY);
    ctx.lineTo((x + footX) / 2 + kneeOut * side * 4 * s, (hipY + groundY) / 2 - (down ? 4 : 0) * s);
    ctx.lineTo(footX, groundY);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.moveTo(x, hipY);
  ctx.lineTo(shoulder.x, shoulder.y);
  ctx.stroke();

  ctx.lineWidth = 5 * s;
  for (const offset of [-3, 3]) {
    ctx.beginPath();
    ctx.moveTo(shoulder.x, shoulder.y + 4 * s);
    ctx.lineTo(hands.x + offset * s, hands.y);
    ctx.stroke();
  }

  ctx.fillStyle = '#f3d2b3';
  ctx.beginPath();
  ctx.arc(head.x, head.y, 10 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = fig.team;
  ctx.fillRect(head.x - 10 * s, head.y - 6 * s, 20 * s, 4 * s); // headband in the team's colour
}
