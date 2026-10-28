// The earlier best house, kept in case we want it back: a modern red-brick house with a tall gable, a triangle
// of glass, a chimney with smoke, a wing with a garage door and a wide window at ground level.
// Not used right now. To bring it back, put it in HOUSES[3] in theme.js and set BEST_SCALE to 1 there
// (it was drawn at the same size as the other houses).
import { BRICK_SHIFT, GARAGE, bricks, clipTo, line, shape, smoke } from './theme.js';

export function brickHouse(ctx, s, time, garage = 0) {
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
}
