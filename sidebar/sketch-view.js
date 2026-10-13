// A sketch block on the paper (#101, ADR 0007): the drawing area between the
// lines of a note, as wide as the text and a few ruled rows high. While it is
// picked, a small toolbar floats above it: the four shapes, select and
// delete. A drag draws the chosen shape, then the new shape is picked so a
// drag moves it; Delete removes the picked shape. The handle at the bottom
// makes the area taller or lower, in whole rows.
//
// The drawing rules live in src/sketch-model.mjs and the sketch itself in
// the Notebook core; this file only turns the mouse into calls to them and
// draws the result.
import { SKETCH_TOOLS, moveShape, resizedHeight, shapeAt, shapeFromDrag, shapesSvg } from "../src/sketch-model.mjs";

const SVG = "http://www.w3.org/2000/svg";

// Small pictures for the toolbar's buttons, drawn on a 16 by 16 grid.
const TOOL_ICONS = {
  rectangle: '<rect x="1.5" y="4" width="13" height="8"/>',
  square: '<rect x="3" y="3" width="10" height="10"/>',
  circle: '<circle cx="8" cy="8" r="5.5"/>',
  triangle: '<polygon points="8,2.5 14,13.5 2,13.5"/>',
  select: '<path d="M4 2.5 L4 13 L7 10 L9.5 14 L11 13.2 L8.6 9.3 L12.5 9.3 Z"/>',
  delete: '<path d="M3 4.5 H13 M6.5 4.5 V3 H9.5 V4.5 M4.5 4.5 L5.3 13.5 H10.7 L11.5 4.5"/>',
};

function icon(id) {
  return (
    '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" ' +
    `stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${TOOL_ICONS[id]}</svg>`
  );
}

export function createSketchView({ notebook, rowHeight, onSaved }) {
  // The picked sketch ("title/n"), the tool in hand and the picked shape.
  // Kept here so they survive the note being drawn again.
  let picked = null;
  let tool = "select";
  let pickedShape = -1;
  // The picked sketch's block on the page, to let go of it when the paper
  // is clicked elsewhere.
  let pickedEl = null;

  function unpick() {
    if (!pickedEl) {
      picked = null;
      return;
    }
    const el = pickedEl;
    picked = null;
    pickedEl = null;
    pickedShape = -1;
    el.classList.remove("is-picked");
    el.redraw();
  }

  // A press anywhere outside the picked sketch lets go of it.
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (pickedEl && !pickedEl.contains(event.target)) unpick();
    },
    true,
  );

  // The sketch block for an embed line, or null when the line shows no
  // sketch that is here.
  function draw(line) {
    const found = notebook.sketchForLine(line);
    if (!found) return null;
    const { title, n } = found;
    const key = `${title}/${n}`;
    let sketch = found.sketch;

    const block = document.createElement("div");
    block.className = "block sketch-block";
    const toolbar = document.createElement("div");
    toolbar.className = "sketch-toolbar";
    const area = document.createElement("div");
    area.className = "sketch-area";
    area.tabIndex = 0;
    area.setAttribute("role", "img");
    area.setAttribute("aria-label", "Sketch");
    const svg = document.createElementNS(SVG, "svg");
    svg.classList.add("sketch-svg");
    const shapesEl = document.createElementNS(SVG, "g");
    shapesEl.classList.add("sketch-shapes");
    const pickEl = document.createElementNS(SVG, "g");
    pickEl.classList.add("sketch-pick");
    svg.append(shapesEl, pickEl);
    const handle = document.createElement("div");
    handle.className = "sketch-resize";
    handle.title = "Drag to make the sketch taller or lower";
    area.append(svg, handle);
    block.append(toolbar, area);

    function save(next) {
      const right = Math.max(0, ...next.shapes.map((shape) => shape.x + shape.w));
      sketch = { ...next, width: Math.round(Math.max(area.clientWidth, right)) };
      notebook.saveSketch(title, n, sketch);
      onSaved();
    }

    // The shapes as they are, plus a dashed box around the picked one.
    function drawShapes(shapes = sketch.shapes, preview = null) {
      area.style.height = `${sketch.height}px`;
      svg.setAttribute("height", sketch.height);
      shapesEl.innerHTML = shapesSvg(preview ? [...shapes, preview] : shapes);
      const shape = picked === key ? shapes[pickedShape] : undefined;
      pickEl.innerHTML = shape
        ? `<rect x="${shape.x - 3}" y="${shape.y - 3}" width="${shape.w + 6}" height="${shape.h + 6}"/>`
        : "";
    }

    function drawToolbar() {
      toolbar.replaceChildren(
        ...SKETCH_TOOLS.map(({ id, label }) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = id === tool ? "sketch-tool is-chosen" : "sketch-tool";
          button.title = label;
          button.setAttribute("aria-label", label);
          button.innerHTML = icon(id);
          if (id === "delete") button.disabled = pickedShape === -1;
          // The focus stays on the area, so Delete still works after.
          button.addEventListener("mousedown", (event) => event.preventDefault());
          button.addEventListener("click", () => {
            if (id === "delete") removePicked();
            else tool = id;
            drawToolbar();
          });
          return button;
        }),
      );
    }

    function redraw() {
      drawShapes();
      drawToolbar();
    }
    block.redraw = redraw;

    function pick() {
      if (picked === key) return;
      unpick();
      picked = key;
      pickedEl = block;
      pickedShape = -1;
      tool = "select";
      block.classList.add("is-picked");
    }

    function removePicked() {
      if (pickedShape === -1) return;
      const shapes = sketch.shapes.filter((_, i) => i !== pickedShape);
      pickedShape = -1;
      save({ ...sketch, shapes });
      redraw();
    }

    // Where the pointer is, in the area's own pixels.
    function pointIn(event) {
      const box = area.getBoundingClientRect();
      return { x: Math.round(event.clientX - box.left), y: Math.round(event.clientY - box.top) };
    }

    // One drag at a time: drawing a new shape, moving the picked one, or
    // resizing the area.
    function startDrag(event, onMove, onEnd) {
      event.preventDefault();
      area.setPointerCapture(event.pointerId);
      const end = (ended) => {
        area.removeEventListener("pointermove", onMove);
        area.removeEventListener("pointerup", end);
        area.removeEventListener("pointercancel", end);
        onEnd(ended);
      };
      area.addEventListener("pointermove", onMove);
      area.addEventListener("pointerup", end);
      area.addEventListener("pointercancel", end);
    }

    area.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      pick();
      area.focus();
      const from = pointIn(event);

      if (event.target === handle) {
        const startHeight = sketch.height;
        startDrag(
          event,
          (moved) => {
            sketch = { ...sketch, height: resizedHeight(startHeight + moved.clientY - event.clientY, rowHeight()) };
            drawShapes();
          },
          () => save(sketch),
        );
        redraw();
        return;
      }

      if (tool === "select") {
        pickedShape = shapeAt(sketch.shapes, from);
        redraw();
        if (pickedShape === -1) return;
        const start = sketch.shapes[pickedShape];
        let shapes = sketch.shapes;
        startDrag(
          event,
          (moved) => {
            const to = pointIn(moved);
            const box = { width: area.clientWidth, height: sketch.height };
            shapes = sketch.shapes.map((shape, i) =>
              i === pickedShape ? moveShape(start, { x: to.x - from.x, y: to.y - from.y }, box) : shape,
            );
            drawShapes(shapes);
          },
          () => {
            if (shapes !== sketch.shapes) save({ ...sketch, shapes });
            drawShapes();
          },
        );
        return;
      }

      let shape = null;
      startDrag(
        event,
        (moved) => {
          shape = shapeFromDrag(tool, from, pointIn(moved));
          drawShapes(sketch.shapes, shape);
        },
        () => {
          if (shape) {
            save({ ...sketch, shapes: [...sketch.shapes, shape] });
            pickedShape = sketch.shapes.length - 1;
            tool = "select";
          }
          redraw();
        },
      );
    });

    area.addEventListener("keydown", (event) => {
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        removePicked();
      } else if (event.key === "Escape") {
        event.preventDefault();
        unpick();
      }
    });

    if (picked === key) {
      pickedEl = block;
      block.classList.add("is-picked");
    }
    redraw();
    return block;
  }

  return { draw, unpick };
}
