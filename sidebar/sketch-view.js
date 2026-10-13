// A sketch block on the paper (#101, #102, ADR 0007): the drawing area
// between the lines of a note, as wide as the text and a few ruled rows
// high. While it is picked, a small toolbar floats above it: the four
// shapes, line, arrow, text, select and delete. A drag draws the chosen
// shape, then the new shape is picked so a drag moves it, its corners
// resize it (Shift keeps its proportions) and a line's ends can be dragged
// onto a shape to stick there. The text tool places a text where you click;
// a double click changes it. Delete removes the picked shape. The handle at
// the bottom makes the area taller or lower, in whole rows. A sketch shows its drawing
// even with the caret on its line; it is picked (frames and toolbar) only
// while you draw in it (#104). An empty one says "Click to draw".
//
// The drawing rules live in src/sketch-model.mjs and the sketch itself in
// the Notebook core; this file only turns the mouse into calls to them and
// draws the result.
import {
  SKETCH_TOOLS,
  addShape,
  bounds,
  handleAt,
  handlePoints,
  isLine,
  moveLineEnd,
  moveShapeIn,
  removeShape,
  resizeShapeIn,
  resizedHeight,
  shapeAt,
  shapeFromDrag,
  shapesSvg,
  textShape,
  textSize,
  withText,
} from "../src/sketch-model.mjs";

const SVG = "http://www.w3.org/2000/svg";

// Small pictures for the toolbar's buttons, drawn on a 16 by 16 grid.
const TOOL_ICONS = {
  rectangle: '<rect x="1.5" y="4" width="13" height="8"/>',
  square: '<rect x="3" y="3" width="10" height="10"/>',
  circle: '<circle cx="8" cy="8" r="5.5"/>',
  triangle: '<polygon points="8,2.5 14,13.5 2,13.5"/>',
  line: '<path d="M3 13 L13 3"/>',
  arrow: '<path d="M3 13 L13 3 M7.5 3 H13 V8.5"/>',
  text: '<path d="M3.5 4 H12.5 M8 4 V13 M6 13 H10"/>',
  select: '<path d="M4 2.5 L4 13 L7 10 L9.5 14 L11 13.2 L8.6 9.3 L12.5 9.3 Z"/>',
  delete: '<path d="M3 4.5 H13 M6.5 4.5 V3 H9.5 V4.5 M4.5 4.5 L5.3 13.5 H10.7 L11.5 4.5"/>',
};

function icon(id) {
  return (
    '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" ' +
    `stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${TOOL_ICONS[id]}</svg>`
  );
}

// The mouse cursor over each handle of a picked shape.
const HANDLE_CURSORS = { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", 1: "move", 2: "move" };

// How wide a text is in the given font, measured off screen.
const measurer = document.createElement("canvas").getContext("2d");
function textWidth(text, size, fontFamily) {
  measurer.font = `${size}px ${fontFamily}`;
  return Math.ceil(measurer.measureText(text).width) + 2;
}

// The dashed frame around a picked box and a small square on each handle.
function pickSvg(shape) {
  const marks = handlePoints(shape)
    .map(({ x, y }) => `<rect class="sketch-handle" x="${x - 3}" y="${y - 3}" width="6" height="6"/>`)
    .join("");
  if (isLine(shape)) return marks;
  return `<rect x="${shape.x - 3}" y="${shape.y - 3}" width="${shape.w + 6}" height="${shape.h + 6}"/>${marks}`;
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

  // Let go of the picked sketch unless `line` is its embed line.
  function unpickExcept(line) {
    const found = notebook.sketchForLine(line);
    if (picked && (!found || picked !== `${found.title}/${found.n}`)) unpick();
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
  // sketch that is here. `selected` picks it at once. The caller's `hooks`
  // are told what the user does: onPick (a press picked it), onStep(-1 or 1)
  // for the arrow keys, onEnter, onRemove (Backspace on a picked sketch
  // without a picked shape) and onLeave (Esc).
  function draw(line, { selected = false, ...hooks } = {}) {
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
    const hint = document.createElement("div");
    hint.className = "sketch-hint";
    hint.textContent = "Click to draw";
    // The box a text is typed into, over the area while it is open.
    const textInput = document.createElement("input");
    textInput.className = "sketch-text";
    textInput.type = "text";
    textInput.setAttribute("aria-label", "Text in the sketch");
    textInput.hidden = true;
    area.append(svg, hint, textInput, handle);
    block.append(toolbar, area);

    // The text being typed: where it goes, and which shape it changes (-1
    // for a new one). Null while no text is open.
    let typing = null;

    function save(next) {
      const right = Math.max(0, ...next.shapes.map((shape) => bounds(shape).x + bounds(shape).w));
      sketch = { ...next, width: Math.round(Math.max(area.clientWidth, right)) };
      notebook.saveSketch(title, n, sketch);
      onSaved();
    }

    // The shapes as they are, plus the picked one's frame and handles. A
    // text being changed is left out while its box is open.
    function drawShapes(shapes = sketch.shapes, preview = null) {
      area.style.height = `${sketch.height}px`;
      block.classList.toggle("is-empty", sketch.shapes.length === 0 && !preview && !typing);
      svg.setAttribute("height", sketch.height);
      const shown = shapes.filter((_, i) => i !== typing?.index);
      shapesEl.innerHTML = shapesSvg(preview ? [...shown, preview] : shown);
      const shape = picked === key && !typing ? shapes[pickedShape] : undefined;
      pickEl.innerHTML = shape ? pickSvg(shape) : "";
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

    function pick({ notify = true } = {}) {
      if (picked === key) return;
      unpick();
      picked = key;
      pickedEl = block;
      pickedShape = -1;
      tool = "select";
      block.classList.add("is-picked");
      if (notify) hooks.onPick?.();
    }

    function removePicked() {
      if (pickedShape === -1) return;
      const shapes = removeShape(sketch.shapes, pickedShape);
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

    // Open the text box on a new text at the point, or on the text at
    // `index`, in the note's handwriting font at the text's size.
    function openText(point, index = -1) {
      const shape = index === -1 ? textShape(point, "", 0) : sketch.shapes[index];
      typing = { point, index };
      Object.assign(textInput.style, {
        left: `${shape.x}px`,
        top: `${shape.y}px`,
        height: `${shape.h}px`,
        fontSize: `${textSize(shape)}px`,
      });
      textInput.value = shape.text;
      textInput.hidden = false;
      fitText();
      redraw();
      textInput.focus();
      textInput.select();
    }

    function fitText() {
      const size = parseFloat(textInput.style.fontSize);
      textInput.style.width = `${Math.max(textWidth(textInput.value, size, getComputedStyle(area).fontFamily), 2 * size)}px`;
    }

    // Close the text box, keeping what was typed unless `keep` is false. An
    // emptied text is removed.
    function closeText(keep) {
      if (!typing) return;
      const { point, index } = typing;
      typing = null;
      textInput.hidden = true;
      const text = textInput.value;
      if (keep) {
        const fontFamily = getComputedStyle(area).fontFamily;
        if (index !== -1) {
          const width = textWidth(text, textSize(sketch.shapes[index]), fontFamily);
          if (text !== sketch.shapes[index].text) save({ ...sketch, shapes: withText(sketch.shapes, index, text, width) });
          if (!text.trim()) pickedShape = -1;
        } else if (text.trim()) {
          const shape = textShape(point, text, 0);
          shape.w = textWidth(text, textSize(shape), fontFamily);
          save({ ...sketch, shapes: addShape(sketch.shapes, shape) });
          pickedShape = sketch.shapes.length - 1;
          tool = "select";
        }
      }
      redraw();
    }

    textInput.addEventListener("input", fitText);
    textInput.addEventListener("blur", () => closeText(true));
    // Keys typed into the text stay there, away from the sketch and the note.
    textInput.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if ((event.key === "Enter" && !event.isComposing) || event.key === "Escape") {
        event.preventDefault();
        closeText(event.key === "Enter");
        area.focus();
      }
    });

    // The text tool places a text on a click, or opens the text clicked on.
    area.addEventListener("click", (event) => {
      if (tool !== "text" || typing || event.target === textInput) return;
      const point = pointIn(event);
      const index = shapeAt(sketch.shapes, point);
      openText(point, sketch.shapes[index]?.kind === "text" ? index : -1);
    });

    // A double click on a text changes it.
    area.addEventListener("dblclick", (event) => {
      if (event.target === textInput) return;
      const index = shapeAt(sketch.shapes, pointIn(event));
      if (sketch.shapes[index]?.kind !== "text") return;
      pickedShape = index;
      openText(pointIn(event), index);
    });

    // Over a picked shape's handle, the cursor shows what a drag does.
    area.addEventListener("pointermove", (event) => {
      const shape = picked === key && tool === "select" ? sketch.shapes[pickedShape] : undefined;
      const grabbed = shape && event.buttons === 0 ? handleAt(shape, pointIn(event)) : null;
      if (grabbed !== null) area.style.cursor = HANDLE_CURSORS[grabbed];
      else area.style.cursor = tool === "text" ? "text" : "";
    });

    area.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target === textInput) return;
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

      if (tool === "text") return;

      const box = () => ({ width: area.clientWidth, height: sketch.height });
      const current = tool === "select" ? sketch.shapes[pickedShape] : undefined;
      const grabbed = current ? handleAt(current, from) : null;
      if (grabbed !== null) {
        // A corner resizes a box, an end moves a line's end.
        let shapes = sketch.shapes;
        startDrag(
          event,
          (moved) => {
            const to = pointIn(moved);
            shapes =
              typeof grabbed === "number"
                ? moveLineEnd(sketch.shapes, pickedShape, grabbed, to)
                : resizeShapeIn(sketch.shapes, pickedShape, grabbed, to, moved.shiftKey);
            drawShapes(shapes);
          },
          () => {
            if (shapes !== sketch.shapes) save({ ...sketch, shapes });
            drawShapes();
          },
        );
        return;
      }

      if (tool === "select") {
        pickedShape = shapeAt(sketch.shapes, from);
        redraw();
        if (pickedShape === -1) return;
        let shapes = sketch.shapes;
        startDrag(
          event,
          (moved) => {
            const to = pointIn(moved);
            shapes = moveShapeIn(sketch.shapes, pickedShape, { x: to.x - from.x, y: to.y - from.y }, box());
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
            save({ ...sketch, shapes: addShape(sketch.shapes, shape) });
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
        if (pickedShape !== -1) removePicked();
        else if (picked === key) hooks.onRemove?.();
        else {
          pick({ notify: false });
          redraw();
        }
      } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        hooks.onStep?.(event.key === "ArrowUp" ? -1 : 1);
      } else if (event.key === "Enter") {
        event.preventDefault();
        hooks.onEnter?.();
      } else if (event.key === "Escape") {
        event.preventDefault();
        hooks.onLeave?.();
      }
    });

    if (selected) pick({ notify: false });
    else if (picked === key) {
      pickedEl = block;
      block.classList.add("is-picked");
    }
    redraw();
    return block;
  }

  return { draw, unpick, unpickExcept };
}
