// Drawing in a sketch block (#101, ADR 0007): pure functions on a sketch's
// shapes, with no DOM. A shape is `{ kind, x, y, w, h }`, its box in the
// drawing area's own pixels. The sidebar turns mouse drags into calls here
// and draws what comes back; the Notebook core keeps the shapes and writes
// them into the sketch's svg file.

// The toolbar above a picked sketch, in order: the four shapes, then select
// (and move) and delete.
export const SKETCH_TOOLS = [
  { id: "rectangle", label: "Rectangle" },
  { id: "square", label: "Square" },
  { id: "circle", label: "Circle" },
  { id: "triangle", label: "Triangle" },
  { id: "select", label: "Select and move" },
  { id: "delete", label: "Delete the picked shape" },
];

const SHAPE_KINDS = new Set(["rectangle", "square", "circle", "triangle"]);
// A drag shorter than this is a click, which draws nothing.
const SMALLEST = 4;
// The drawing area is never lower than this many ruled rows.
const FEWEST_ROWS = 3;

// The shape a drag from `from` to `to` draws, or null for a mere click. A
// square and a circle keep equal sides, as long as the longer drag, growing
// from where the drag started.
export function shapeFromDrag(kind, from, to) {
  let w = Math.abs(to.x - from.x);
  let h = Math.abs(to.y - from.y);
  if (Math.max(w, h) < SMALLEST) return null;
  if (kind === "square" || kind === "circle") {
    w = h = Math.max(w, h);
  }
  const x = to.x < from.x ? from.x - w : from.x;
  const y = to.y < from.y ? from.y - h : from.y;
  return { kind, x, y, w, h };
}

// The index of the topmost shape whose box holds the point, or -1.
export function shapeAt(shapes, point) {
  for (let i = shapes.length - 1; i >= 0; i -= 1) {
    const { x, y, w, h } = shapes[i];
    if (point.x >= x && point.x <= x + w && point.y >= y && point.y <= y + h) return i;
  }
  return -1;
}

// The shape moved by `by`, kept inside the drawing area.
export function moveShape(shape, by, area) {
  const clamp = (value, most) => Math.min(Math.max(value, 0), Math.max(most, 0));
  return {
    ...shape,
    x: clamp(shape.x + by.x, area.width - shape.w),
    y: clamp(shape.y + by.y, area.height - shape.h),
  };
}

// A dragged height for the drawing area, snapped to whole ruled rows so the
// text below still sits on the lines.
export function resizedHeight(height, rowHeight) {
  return Math.max(FEWEST_ROWS, Math.round(height / rowHeight)) * rowHeight;
}

// Shapes from a file, keeping only the kinds Glacier draws with plain
// numbers, so nothing else from a file ever reaches the page.
export function readShapes(shapes) {
  if (!Array.isArray(shapes)) return [];
  return shapes
    .filter(
      (shape) =>
        shape && SHAPE_KINDS.has(shape.kind) && ["x", "y", "w", "h"].every((key) => Number.isFinite(shape[key])),
    )
    .map(({ kind, x, y, w, h }) => ({ kind, x, y, w, h }));
}

// One shape as an svg element, drawn clean (the hand-drawn look comes later).
function shapeSvg({ kind, x, y, w, h }) {
  if (kind === "circle") {
    return `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}"/>`;
  }
  if (kind === "triangle") {
    return `<polygon points="${x + w / 2},${y} ${x + w},${y + h} ${x},${y + h}"/>`;
  }
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`;
}

// The shapes as svg elements, one per line, for the file and the screen.
export function shapesSvg(shapes) {
  return shapes.map((shape) => `${shapeSvg(shape)}\n`).join("");
}
