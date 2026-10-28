// Participant phone: a touch surface. Sends the finger's zone and cell, gets the counts back.
import { call, fitCanvas, layout, playerId, showSplash } from './common.js';
import { findTheme } from '../themes/registry.js';

const $ = (id) => document.getElementById(id);
const KEEP_ALIVE_MS = 2000; // resend an unchanged cell this often, so a resting finger keeps counting
const IDLE_POLL_MS = 1500;  // check in this often with no finger down, to keep counts fresh
const HYSTERESIS = 0.25;    // share of a cell the finger must pass the edge by before switching cell

const code = (new URLSearchParams(location.search).get('room') || '').trim().toUpperCase();
const pid = playerId();
const hideSplash = showSplash();

const room = { zones: [], grid: 32, counts: [], n: 0, rate: 2 };
let finger = null;  // { x, y } in CSS pixels while touching
let cell = null;    // { z, u, v } the finger is in
let vote = null;    // { z, u, v } this player's vote: the last touched cell, as the room has it
let lastKey = null, lastSentAt = -Infinity, inFlight = false, liftPending = false, stopped = false, joined = false;

if (!code) {
  hideSplash();
  $('join').hidden = false;
  $('join').addEventListener('submit', (e) => {
    e.preventDefault();
    const value = $('code').value.trim().toUpperCase();
    if (value) location.search = `?room=${encodeURIComponent(value)}`;
  });
} else {
  $('room').textContent = `Room ${code}`;
  setInterval(tick, 50);
  requestAnimationFrame(draw);
}

// --- talking to the room ---------------------------------------------------------

function tick() {
  if (stopped || inFlight) return;
  const now = performance.now();
  if (liftPending) {
    liftPending = false;
    lastKey = null;
    lastSentAt = now;
    checkIn({ t: 'lift' });
  } else if (finger && cell) {
    const key = `${cell.z},${cell.u},${cell.v}`;
    if (now - lastSentAt < 1000 / room.rate) return;
    if (key === lastKey && now - lastSentAt < KEEP_ALIVE_MS) return; // small moves inside a cell send nothing
    lastKey = key;
    lastSentAt = now;
    checkIn({ t: 'pos', ...cell });
  } else if (now - lastSentAt > IDLE_POLL_MS) {
    lastSentAt = now;
    checkIn({});
  }
}

async function checkIn(msg) {
  inFlight = true;
  const { status, body } = await call(`/rooms/${code}/play`, { pid, ...msg });
  inFlight = false;
  if (status === 200) {
    Object.assign(room, body);
    if (!finger) vote = body.you ? { z: body.you[0], u: body.you[1], v: body.you[2] } : null;
    updateStatus();
    if (!joined) {
      joined = true;
      $('game').hidden = false;
      hideSplash();
    }
  } else if (status === 404) {
    end('Room not found', `There is no room ${code}. Check the code with your facilitator.`);
  } else if (status === 410) {
    end('Session ended', 'Thanks for joining!');
  } else if (status === 429 && body.error === 'full') {
    end('Room is full', 'This session has reached its limit of participants.');
  } else if (status === 0) {
    $('people').textContent = 'Reconnecting…';
  }
}

function updateStatus() {
  const zone = vote && room.zones[vote.z];
  $('room').textContent = zone ? `Your vote: ${zone}` : room.zones.length ? 'Touch a zone to vote' : `Room ${code}`;
  $('people').textContent = `${room.n} here`;
}

function end(title, text) {
  stopped = true;
  $('game').hidden = true;
  $('message').hidden = false;
  $('message-title').textContent = title;
  $('message-text').textContent = text;
  hideSplash();
}

// --- touch -------------------------------------------------------------------------

const pad = $('pad');

pad.addEventListener('pointerdown', (e) => {
  if (!e.isPrimary) return;
  pad.setPointerCapture(e.pointerId);
  move(e);
  tick();
});
pad.addEventListener('pointermove', (e) => { if (finger && e.isPrimary) move(e); });
for (const type of ['pointerup', 'pointercancel']) {
  pad.addEventListener(type, (e) => {
    if (!e.isPrimary || !finger) return;
    if (cell) vote = cell; // the last touched cell stays as the vote
    finger = cell = null;
    updateStatus();
    liftPending = true;
  });
}

function move(e) {
  const box = pad.getBoundingClientRect();
  finger = { x: e.clientX - box.left, y: e.clientY - box.top };
  const G = room.grid;
  const rects = zoneRects(box.width, box.height);
  const z = rects.findIndex((r) => finger.x >= r.x && finger.x < r.x + r.w && finger.y >= r.y && finger.y < r.y + r.h);
  if (z < 0) return;
  const r = rects[z];
  const fu = ((finger.x - r.x) / r.w) * G, fv = ((finger.y - r.y) / r.h) * G;
  const inside = (f, c) => f >= c - HYSTERESIS && f < c + 1 + HYSTERESIS;
  if (cell && cell.z === z && inside(fu, cell.u) && inside(fv, cell.v)) return;
  const clamp = (n) => Math.max(0, Math.min(G - 1, Math.floor(n)));
  cell = { z, u: clamp(fu), v: clamp(fv) };
}

// --- drawing -----------------------------------------------------------------------

const STATUS_HEIGHT = 36;

function zoneRects(w, h) {
  return layout(room.zones.length, w, h - STATUS_HEIGHT, findTheme(room.theme).phoneLayout).map((r) => ({ ...r, y: r.y + STATUS_HEIGHT }));
}

function draw() {
  const { ctx, w, h } = fitCanvas(pad);
  ctx.fillStyle = '#15110f';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (!room.zones.length) {
    ctx.fillStyle = '#b3a69c';
    ctx.font = '500 18px system-ui, sans-serif';
    ctx.fillText('Waiting for the facilitator…', w / 2, h / 2);
  }

  const rects = zoneRects(w, h);
  const chosen = cell || vote;
  rects.forEach((r, z) => {
    const mine = chosen && chosen.z === z;
    const pad = 6;
    ctx.beginPath();
    ctx.roundRect(r.x + pad, r.y + pad, r.w - 2 * pad, r.h - 2 * pad, 14);
    ctx.fillStyle = mine ? 'rgba(255, 140, 46, 0.18)' : '#1d1714';
    ctx.fill();
    ctx.lineWidth = mine ? 3 : 1.5;
    ctx.strokeStyle = mine ? '#ff8c2e' : '#3a2f2a';
    ctx.stroke();

    let size = Math.max(16, Math.min(28, r.w / 9));
    ctx.font = `600 ${size}px system-ui, sans-serif`;
    const space = r.w - 2 * pad - 36, width = ctx.measureText(room.zones[z]).width;
    if (width > space) size = Math.max(11, (size * space) / width); // shrink long names to fit the zone
    ctx.fillStyle = '#f6efe8';
    ctx.font = `600 ${size}px system-ui, sans-serif`;
    ctx.fillText(room.zones[z], r.x + r.w / 2, r.y + r.h / 2 - size * 0.6);
    ctx.fillStyle = '#b3a69c';
    ctx.font = `500 ${size * 0.6}px system-ui, sans-serif`;
    const count = room.counts[z] || 0;
    ctx.fillText(`${count} ${count === 1 ? 'vote' : 'votes'}`, r.x + r.w / 2, r.y + r.h / 2 + size * 0.6);
  });

  // The resting vote: a marker where the finger last was.
  if (!finger && vote && rects[vote.z]) {
    const r = rects[vote.z], G = room.grid;
    const x = r.x + ((vote.u + 0.5) / G) * r.w, y = r.y + ((vote.v + 0.5) / G) * r.h;
    ctx.beginPath();
    ctx.arc(x, y, 16, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 140, 46, 0.25)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ff8c2e';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#fff1b8';
    ctx.fill();
  }

  if (finger) {
    const glow = ctx.createRadialGradient(finger.x, finger.y, 0, finger.x, finger.y, 70);
    glow.addColorStop(0, 'rgba(255, 241, 184, 0.9)');
    glow.addColorStop(0.3, 'rgba(255, 140, 46, 0.6)');
    glow.addColorStop(1, 'rgba(232, 51, 58, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(finger.x, finger.y, 70, 0, Math.PI * 2);
    ctx.fill();
  }

  if (!stopped) requestAnimationFrame(draw);
}
