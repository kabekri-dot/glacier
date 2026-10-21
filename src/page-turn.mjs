// The page turn (#108): the bottom right corner of the page curls up and
// over to the left, smoothly, like a real sheet of paper. Pure, so node
// --test can check it; the sidebar draws each moment with a clip-path and an
// SVG back (sidebar/page-view.js).
//
// The corner C is pulled to a point P that sweeps across the page and lifts
// a little on the way. The fold is the line halfway between C and P, square
// to the pull: what lies on C's side of it has folded over, and its back
// shows mirrored across the fold.

// Gently in and gently out: slow to lift, quick across, slow to settle.
export function easeTurn(t) {
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
}

// The part of an outline on one side of a line: `keep` is >= 0 for the points
// to keep. Where an edge crosses the line, the crossing point joins it.
function cut(points, keep) {
  const out = [];
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length];
    const ka = keep(a);
    const kb = keep(b);
    if (ka >= 0) out.push(a);
    if (ka * kb < 0) {
      const s = ka / (ka - kb);
      out.push([a[0] + s * (b[0] - a[0]), a[1] + s * (b[1] - a[1])]);
    }
  });
  return out;
}

// The turn of a page `width` by `height` at moment `t` (0 to 1, already
// eased): { sheet, back, fold }. `sheet` is the outline of the part still
// lying flat, `back` the outline of the folded corner's back (it may reach
// past the page's left edge, where nothing shows), both lists of points
// [x, y]. `fold` is { at, toward }: a point on the fold and the unit
// direction from it toward the turned corner, or null when nothing is folded.
export function curlAt(width, height, t) {
  const page = [[0, 0], [width, 0], [width, height], [0, height]];
  if (t <= 0) return { sheet: page, back: [], fold: null };
  if (t >= 1) return { sheet: [], back: [], fold: null };
  const pulled = [width - t * 2.05 * width, height - Math.sin(Math.PI * t) * height * 0.35];
  const pull = [width - pulled[0], height - pulled[1]];
  const length = Math.hypot(...pull);
  const toward = [pull[0] / length, pull[1] / length];
  const at = [(width + pulled[0]) / 2, (height + pulled[1]) / 2];
  const side = ([x, y]) => (x - at[0]) * toward[0] + (y - at[1]) * toward[1];
  const sheet = cut(page, (point) => -side(point));
  const back = cut(page, side).map((point) => {
    const d = side(point);
    return [point[0] - 2 * d * toward[0], point[1] - 2 * d * toward[1]];
  });
  return { sheet, back, fold: { at, toward } };
}
