# Themes

A theme decides how the shared screen looks. Everything else — setup, polling, QR code, sidebar, ending a session — belongs to the host page and is the same for every theme.

## Adding a theme

1. Create a folder `web/themes/<id>/` with a `theme.js`. Put its CSS, images and sounds in the same folder.
2. Add one line to `registry.js`: `{ id, name, minZones, maxZones, phoneLayout }`.
   `phoneLayout` is `'fit'` (phones stack 3+ zones to suit a tall screen), `'match'` (phones copy the shared screen's arrangement) or `'row'` (all zones side by side in one row, for a left-to-right scale). Two zones are always side by side.
   Optional `defaults: { names, colors }` gives the theme its own starting labels and colours (e.g. a fixed scale).

The host page loads `theme.js` with a dynamic `import()` only when a session uses it.

## The contract

`theme.js` exports one function:

```js
export function mount(stage, kit) {
  // stage: an empty element filling the shared screen. The theme owns everything inside it.
  // kit:   helpers from the host page (below).
  return {
    update(state) {},  // after every poll
    frame(dt) {},      // every animation frame, dt in seconds
    destroy() {},      // session ended or theme switched: remove listeners and timers
  };
}
```

`state` is the room as the theme needs it, already unpacked from the wire format:

| Field | Meaning |
| --- | --- |
| `zones` | Zone names, 2–6 |
| `colors` | One hex colour per zone (Riso inks, chosen by the facilitator) |
| `counts` | Votes per zone |
| `n` | Players in the room |
| `grid` | Cells per zone each way (32) |
| `heat` | `Float32Array` of `zones × grid × grid`, 0–1, index `(z * grid + v) * grid + u` |
| `players` | `[{ id, z, u, v, down }]`: each vote; `down` = finger touching right now |

`kit` holds shared helpers so themes don't copy them:

| Helper | Use |
| --- | --- |
| `layout(n, w, h)` | Zone rectangles for a screen size |
| `fitCanvas(canvas)` | Sizes a canvas for the screen's pixel density, returns `{ ctx, w, h }` |
| `colorFor(id)` | A player's own colour, for themes that show each person |
| `withAlpha(hex, a)` | A zone colour as `rgba()` with transparency |
| `softField(ctx, rect, hex, stops)` | Paints an edgeless colour field over a zone, fading out at every edge |
| `loadCss(url)` | Adds the theme's stylesheet once, e.g. `kit.loadCss(new URL('theme.css', import.meta.url))` |

Rules of thumb: animate towards each new `state` instead of jumping (polls arrive 1–4 times a second), put text in HTML rather than on the canvas so it stays crisp, and keep assets inside the theme folder.
