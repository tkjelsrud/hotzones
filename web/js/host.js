// Facilitator screen: set up a room, show the QR code and poll the room.
// How the room is drawn is up to the session's theme (web/themes/), loaded on demand.
// A session is a sequence of up to four pages, each with its own question, theme, zones and colours.
// "Next" saves the page's votes and starts the next page; after the last one the shared screen shows the results.
// The setup form always edits a template: a set of pages kept in this browser, so it can be prepared ahead.
import { PALETTE, RISO, call, fitCanvas, layout, showSplash, softField, withAlpha, zoneColors } from './common.js';
import { DEFAULT_THEME, THEMES, findTheme, loadTheme } from '../themes/registry.js';

const $ = (id) => document.getElementById(id);
// Yes/no wordings for two-zone sessions, from data/wordings.json; one is picked at random as the default.
// Colour palettes come from the shared palette collection; without it the built-in Riso inks are the only choice.
const PALETTES_URL = 'https://tkjelsrud.github.io/color/palettes/sketch-palettes.json';
const [PRO_CON, PALETTES] = await Promise.all([
  fetch('data/wordings.json')
    .then((r) => r.json())
    .then((list) => list.map((w) => [w.yes, w.no]))
    .catch(() => []),
  fetch(PALETTES_URL, { signal: AbortSignal.timeout(3000) })
    .then((r) => r.json())
    .then((data) => data.palettes
      .map((p) => ({
        id: p.id,
        name: p.name,
        family: p.family,
        paper: p.paper,
        ink: p.ink,
        inks: p.fills.filter((hex) => /^#[0-9a-f]{6}$/i.test(hex)).map((hex) => ({ name: hex.toLowerCase(), hex: hex.toLowerCase() })),
      }))
      .filter((p) => p.id && p.inks.length >= 2))
    .catch(() => []),
]);
const pair = PRO_CON.length ? PRO_CON[Math.floor(Math.random() * PRO_CON.length)] : ['Agree', 'Disagree'];

const themeDefaults = () => findTheme($('theme').value).defaults;

// A theme's own labels if it has them; otherwise the random pair for the first two zones and "Option 3", "Option 4", ...
const defaultNames = (n) =>
  themeDefaults()?.names.slice(0, n) || [...pair, ...Array.from({ length: n - 2 }, (_, i) => `Option ${i + 3}`)];

// A name the host hasn't typed themselves, so it can be replaced when the theme or zone count changes.
const isDefaultName = (name) =>
  PRO_CON.some((p) => p.includes(name)) || /^Option \d$/.test(name) || THEMES.some((t) => t.defaults?.names.includes(name));
const SESSION_KEY = 'hz-host';
const MAX_PAGES = 4;

const hideSplash = showSplash();

// --- setup ---------------------------------------------------------------------

for (const t of THEMES) $('theme').append(new Option(t.name, t.id));
$('theme').value = DEFAULT_THEME;

// Palettes grouped by family; the first option keeps the theme's own colours and the Riso inks.
const families = new Map();
for (const p of PALETTES) {
  if (!families.has(p.family)) families.set(p.family, Object.assign(document.createElement('optgroup'), { label: p.family || 'other' }));
  families.get(p.family).append(new Option(p.name, p.id));
}
$('palette').append(...families.values());
$('palette').closest('label').hidden = !PALETTES.length;
const chosenPalette = () => PALETTES.find((p) => p.id === $('palette').value);
const inks = () => chosenPalette()?.inks || RISO;

function renderZoneCounts(count) {
  const { minZones, maxZones } = findTheme($('theme').value);
  const current = count || Number($('zone-count').value) || minZones;
  $('zone-count').innerHTML = '';
  for (let n = minZones; n <= maxZones; n++) $('zone-count').append(new Option(n, n));
  $('zone-count').value = Math.max(minZones, Math.min(maxZones, current));
  $('zone-count').closest('label').hidden = minZones === maxZones; // a fixed zone count needs no choice
  renderNameInputs();
}

// One colour per zone. With a palette chosen: its colours in order. Otherwise the theme's own colours if it
// has them, or Green and Bright Red for the first two and a random unused Riso ink for the rest.
// Switching theme or palette starts the colours over.
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
    const palette = chosenPalette()?.inks;
    colors.push(palette ? palette[i % palette.length].hex : themeDefaults()?.colors[i] || (i < 2 ? RISO[i].hex : randomFreeColor()));
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
  for (const ink of inks()) {
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
$('theme').addEventListener('change', () => renderZoneCounts());
$('zone-count').addEventListener('change', renderNameInputs);
$('palette').addEventListener('change', () => { colors = []; renderNameInputs(); });
$('rate').addEventListener('input', () => { $('rate-out').textContent = `${$('rate').value} Hz`; });

// --- pages: the form above edits one page at a time; the tabs switch between them ------

let pages = [null], active = 0; // null = a new page with the defaults

function readEditor() {
  return {
    question: $('question').value.trim(),
    theme: $('theme').value,
    palette: $('palette').value,
    paper: chosenPalette()?.paper || '', // the palette's background and text colour; empty with the default colours
    ink: chosenPalette()?.ink || '',
    names: [...$('zone-names').querySelectorAll('input')].map((i) => i.value),
    colors: [...colors],
  };
}

function loadEditor(page) {
  closePalette();
  $('question').value = page?.question || '';
  $('theme').value = page?.theme || DEFAULT_THEME;
  if (page) $('palette').value = page.palette || ''; // a new page keeps the palette of the page before it
  colors = page ? [...page.colors] : [];
  $('zone-names').innerHTML = ''; // don't carry the last page's labels over
  renderZoneCounts(page?.names.length);
  if (page) $('zone-names').querySelectorAll('input').forEach((input, i) => { input.value = page.names[i]; });
}

function showPage(i) {
  pages[active] = readEditor();
  active = i;
  loadEditor(pages[i]);
  renderTabs();
}

function renderTabs() {
  $('pages').innerHTML = '';
  pages.forEach((_, i) => {
    const tab = Object.assign(document.createElement('button'), { type: 'button', className: `tab${i === active ? ' active' : ''}`, textContent: `Page ${i + 1}` });
    tab.addEventListener('click', () => showPage(i));
    $('pages').append(tab);
  });
  if (pages.length < MAX_PAGES) {
    const add = Object.assign(document.createElement('button'), { type: 'button', className: 'tab', textContent: '+ Add page' });
    add.addEventListener('click', () => {
      pages.push(null);
      showPage(pages.length - 1);
    });
    $('pages').append(add);
  }
  $('remove-page').hidden = pages.length === 1;
  $('start').textContent = pages.length > 1 ? `Start session (${pages.length} pages)` : 'Start session';
}

$('remove-page').addEventListener('click', () => {
  pages.splice(active, 1);
  active = Math.max(0, active - 1);
  loadEditor(pages[active]);
  renderTabs();
});

// --- templates: sets of pages kept in this browser; every edit is saved as it is made ------

const TEMPLATES_KEY = 'hz-templates', TEMPLATE_KEY = 'hz-template';
const HOUSE = findTheme('ourhouse').defaults;
const [GREEN, RED, , , SUNFLOWER, , BLUE, TEAL, , PURPLE] = RISO.map((ink) => ink.hex);
const examplePage = (question, theme, names, colors) => ({ question, theme, palette: '', paper: '', ink: '', names, colors });
const TEMPLATES = [
  { id: 'blank', name: 'Blank', pages: [null] },
  {
    id: 'retro',
    name: 'Sprint retro',
    pages: [
      examplePage('How was this sprint?', 'heatmap', ['Great', 'OK', 'Rough'], [GREEN, SUNFLOWER, RED]),
      examplePage('Did we reach the sprint goal?', 'tugofwar', ['Yes', 'No'], [GREEN, RED]),
      examplePage('How solid is what we shipped?', 'ourhouse', [...HOUSE.names], [...HOUSE.colors]),
    ],
  },
  {
    id: 'checkin',
    name: 'Team check-in',
    pages: [
      examplePage('How is your energy today?', 'heatmap', ['Full', 'Good', 'Low', 'Empty'], [GREEN, TEAL, SUNFLOWER, RED]),
      examplePage('Is the workload sustainable?', 'tugofwar', ['Yes', 'No'], [GREEN, RED]),
      examplePage('How solid is our teamwork?', 'ourtown', [...HOUSE.names], [...HOUSE.colors]),
    ],
  },
  {
    id: 'decision',
    name: 'Decision',
    pages: [
      examplePage('Should we go ahead?', 'tugofwar', ['Go', 'Wait'], [GREEN, RED]),
      examplePage('How confident are you?', 'heatmap', ['Very', 'Somewhat', 'Not really'], [GREEN, SUNFLOWER, RED]),
      examplePage('What matters most?', 'heatmap', ['Speed', 'Quality', 'Cost', 'Learning'], [BLUE, GREEN, SUNFLOWER, PURPLE]),
    ],
  },
];

function storedTemplates() {
  try { return JSON.parse(localStorage.getItem(TEMPLATES_KEY)) || {}; } catch { return {}; }
}

const validPage = (p) =>
  p === null || (Array.isArray(p?.names) && p.names.length >= 2 && p.names.length <= 6 && Array.isArray(p.colors) && p.colors.length === p.names.length);

// The template as it was last edited here, or the original.
function templatePages(id) {
  const kept = storedTemplates()[id];
  if (Array.isArray(kept) && kept.length >= 1 && kept.length <= MAX_PAGES && kept.every(validPage)) return kept;
  return structuredClone(TEMPLATES.find((t) => t.id === id).pages);
}

let template = 'blank';
try {
  const last = localStorage.getItem(TEMPLATE_KEY);
  if (TEMPLATES.some((t) => t.id === last)) template = last;
} catch { /* start blank */ }

function saveTemplate() {
  pages[active] = readEditor();
  try {
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify({ ...storedTemplates(), [template]: pages }));
    localStorage.setItem(TEMPLATE_KEY, template);
  } catch { /* edits last until the page is closed */ }
}

function openTemplate(id) {
  template = id;
  pages = templatePages(id);
  active = 0;
  loadEditor(pages[0]);
  renderTabs();
  renderTemplates();
}

function renderTemplates() {
  $('templates').innerHTML = '';
  for (const t of TEMPLATES) {
    const tab = Object.assign(document.createElement('button'), { type: 'button', className: `tab${t.id === template ? ' active' : ''}`, textContent: t.name });
    tab.addEventListener('click', () => {
      saveTemplate();
      openTemplate(t.id);
    });
    $('templates').append(tab);
  }
}

$('reset-template').addEventListener('click', () => {
  if (!confirm('Put this template back to how it started?')) return;
  const kept = storedTemplates();
  delete kept[template];
  try { localStorage.setItem(TEMPLATES_KEY, JSON.stringify(kept)); } catch { /* nothing kept */ }
  openTemplate(template);
});

// Typing, choosing and every button in the form (colours, pages) end up here, after their own handlers.
for (const type of ['input', 'change', 'click']) $('setup').addEventListener(type, saveTemplate);

openTemplate(template);

$('start').addEventListener('click', async () => {
  $('start').disabled = true;
  $('setup-error').textContent = '';
  const { status, body } = await call('/rooms', {});
  if (status !== 200) {
    $('setup-error').textContent = status ? body.error || 'Could not start a session.' : 'Could not reach the server.';
    $('start').disabled = false;
    return;
  }
  pages[active] = readEditor();
  const plan = pages.map((p) => ({ ...p, names: p.names.map((name, n) => name.trim() || `Zone ${n + 1}`) }));
  const session = { code: body.code, token: body.token, pages: plan, page: 0, results: [], finished: false };
  save(session);
  const scene = await command(session, sceneFor(plan[0]));
  if (scene.status !== 200) { // e.g. a server older than these pages
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* nothing saved */ }
    $('setup-error').textContent = 'The server did not accept the first page, so the session was not started.';
    $('start').disabled = false;
    return;
  }
  await command(session, { t: 'config', hz: Number($('rate').value) });
  goLive(session);
});

function command(session, msg) {
  return call(`/rooms/${session.code}/host`, { token: session.token, ...msg });
}

const sceneFor = (page) => ({
  t: 'scene', zones: page.names, colors: page.colors, paper: page.paper, ink: page.ink, theme: page.theme, question: page.question,
});

// The session survives a reload, including where in the sequence it is and the votes saved so far.
function save(session) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* reload loses the session */ }
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
  const { paper, ink } = state;
  return { zones: state.zones, colors, paper: paper && ink ? paper : null, ink: paper && ink ? ink : null, counts: state.counts, n: state.n, grid: state.grid, heat, players };
}

// --- live ----------------------------------------------------------------------

let polling = true, rate = 2;
let counts = []; // the current page's latest votes, saved when the host moves on

function goLive(session) {
  session.pages ||= []; // a session saved before pages existed
  session.results ||= [];
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

  $('reset').addEventListener('click', () => command(session, { t: 'reset' }));
  $('next').addEventListener('click', () => next(session));
  $('end').addEventListener('click', async () => {
    if (!confirm('End the session for everyone?')) return;
    const { status, body } = await command(session, { t: 'close' });
    ended(session, status === 200 ? body : null);
  });

  showProgress(session);
  if (session.finished) showResults(session);
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
      if (!session.finished) {
        if (body.theme !== themeId) await useTheme(body.theme);
        theme?.update(unpack(body));
        const page = session.pages[session.page];
        if (!page || body.zones.join('\n') === page.names.join('\n')) counts = body.counts; // not a view from before the last scene change
      }
      showStats(body);
      if (first) { hideSplash(); first = false; }
    } else if (status === 404 || status === 410 || status === 403) {
      ended(session, null, status === 410 ? 'The session was closed.' : 'This session no longer exists.');
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
}

// --- pages ---------------------------------------------------------------------

function showProgress(session) {
  const many = session.pages.length > 1, page = session.pages[session.page];
  $('progress').hidden = !many;
  $('progress').textContent = session.finished ? 'Results' : `Page ${session.page + 1} of ${session.pages.length}`;
  $('next').hidden = !many || session.finished;
  $('next').textContent = session.page + 1 < session.pages.length ? `Next: page ${session.page + 2}` : 'Show results';
  $('reset').hidden = session.finished;
  const title = session.finished ? 'Results' : page?.question;
  $('live-question').textContent = title || '';
  $('live-question').hidden = !title;
}

// Save this page's votes, then start the next page (which clears the votes) or show the results.
async function next(session) {
  $('next').disabled = true;
  const page = session.pages[session.page];
  session.results.push({ question: page.question, zones: page.names, colors: page.colors, counts: page.names.map((_, z) => counts[z] || 0) });
  counts = [];
  session.page += 1;
  if (session.page < session.pages.length) {
    await command(session, sceneFor(session.pages[session.page]));
  } else {
    session.finished = true;
    await command(session, { t: 'finish' });
    showResults(session);
  }
  save(session);
  showProgress(session);
  setTimeout(() => { $('next').disabled = false; }, 1000); // no double clicks past a page
}

function showResults(session) {
  theme?.destroy();
  theme = null;
  themeId = null;
  const view = document.createElement('div');
  view.className = 'results-view';
  view.append(resultsTable(session.results));
  $('stage').replaceChildren(view);
}

// One row per question: the question and its vote total, a bar split by the votes, and each option's count.
function resultsTable(results) {
  const table = document.createElement('table');
  table.className = 'results';
  results.forEach((page, i) => {
    const total = page.counts.reduce((a, b) => a + b, 0), top = Math.max(...page.counts);
    const colors = zoneColors(page.zones, page.colors);
    const row = table.insertRow();
    const q = row.insertCell();
    q.className = 'q';
    q.textContent = `${i + 1}. ${page.question || `Page ${i + 1}`}`;
    q.append(Object.assign(document.createElement('small'), { textContent: `${total} ${total === 1 ? 'vote' : 'votes'}` }));
    const cell = row.insertCell();
    const bar = Object.assign(document.createElement('div'), { className: 'bar' });
    const options = Object.assign(document.createElement('div'), { className: 'options' });
    page.zones.forEach((name, z) => {
      const share = total ? page.counts[z] / total : 0;
      const part = document.createElement('span');
      part.style.cssText = `width: ${share * 100}%; background: ${colors[z]}`;
      bar.append(part);
      const option = Object.assign(document.createElement('span'), { className: `option${top > 0 && page.counts[z] === top ? ' lead' : ''}` });
      option.style.setProperty('--zone', colors[z]);
      option.append(Object.assign(document.createElement('span'), { className: 'dot' }), name);
      option.append(Object.assign(document.createElement('b'), { textContent: `${page.counts[z]}` }));
      if (total) option.append(`${Math.round(share * 100)}%`);
      options.append(option);
    });
    cell.append(bar, options);
  });
  return table;
}

let last = performance.now();

function frame(t) {
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  theme?.frame(dt);
  if (polling) requestAnimationFrame(frame);
}

// --- end -----------------------------------------------------------------------

function ended(session, summary, text = 'Thanks for facilitating.') {
  polling = false;
  theme?.destroy();
  theme = null;
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* nothing saved */ }
  history.replaceState(null, '', location.pathname);
  $('setup').hidden = $('live').hidden = true;
  $('ended').hidden = false;
  hideSplash();
  $('ended-text').textContent = text;
  // Ended before the results: the page on screen counts too, with the room's final votes.
  const page = session.pages[session.page];
  if (summary && page && !session.finished) {
    session.results.push({ question: page.question, zones: page.names, colors: page.colors, counts: summary.zones.map((z) => z.votes) });
  }
  if (session.results.length) $('summary').replaceChildren(resultsTable(session.results));
  if (!summary) return;

  const minutes = Math.round(summary.durationSeconds / 60);
  $('ended-text').textContent = `${summary.peakPlayers} ${summary.peakPlayers === 1 ? 'player' : 'players'} at most, ${minutes} min.`;
  const link = $('download');
  const data = { ...summary, pages: session.results };
  link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  link.download = `hotzones-${summary.startedAt.slice(0, 10)}.json`;
  link.hidden = false;
}

// --- resume --------------------------------------------------------------------

// Last, once everything above is set up: a reload with ?room=CODE picks the running session back up.
const resumeCode = new URLSearchParams(location.search).get('room');
let saved = null;
try { saved = JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { /* no saved session */ }
if (resumeCode && saved?.code === resumeCode) goLive(saved);
else hideSplash();
