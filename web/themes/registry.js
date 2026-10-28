// Available themes. Each lives in its own folder (web/themes/<id>/) and is loaded only when a session uses it.
// To add a theme: create the folder with a theme.js (see README.md) and add one line here.
// phoneLayout: 'fit' lets phones stack 3+ zones to suit a tall screen; 'match' copies the shared screen;
// 'row' puts all zones in one left-to-right row (a scale).
// Two zones are always side by side.
// defaults (optional): the theme's own starting labels and colours, e.g. for a fixed scale.
export const THEMES = [
  { id: 'heatmap', name: 'Heatmap', minZones: 2, maxZones: 6, phoneLayout: 'match' },
  { id: 'tugofwar', name: 'Tug of war', minZones: 2, maxZones: 2, phoneLayout: 'match' },
  {
    id: 'ourhouse', name: 'Our house', minZones: 4, maxZones: 4, phoneLayout: 'row',
    defaults: {
      names: ['Falling apart', 'Wobbly', 'Pretty sturdy', 'Solid as brick'],
      colors: ['#f15060', '#ffb511', '#67b346', '#00a95c'],
    },
  },
];

export const DEFAULT_THEME = 'heatmap';

export const findTheme = (id) => THEMES.find((t) => t.id === id) || THEMES.find((t) => t.id === DEFAULT_THEME);

export async function loadTheme(id) {
  const meta = findTheme(id);
  return { meta, module: await import(`./${meta.id}/theme.js`) };
}
