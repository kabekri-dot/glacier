// A sketch block on the paper (#101, #102, ADR 0007): the drawing area
// between the lines of a note, as wide as the text and a few ruled rows
// high. While it is picked, a toolbar one ruled row high sits under it, so
// it covers no text: the four shapes, line, arrow, text, select and delete,
// the colours and the look. A drag draws the chosen
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
// draws the result. Ctrl Z and Ctrl Y undo and redo in the picked sketch;
// the arrow keys nudge the picked shape; Esc lets go of the shape, then of
// the sketch.
import {
  SKETCH_COLORS,
  SKETCH_LOOKS,
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
  shapeStyle,
  shapesSvg,
  sketchHistory,
  sketchLook,
  styleShapeIn,
  textShape,
  textSize,
  withStyle,
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

// The look switch's two pictures: a wavy pen line for hand-drawn, a
// straight one with ruler ticks for clean.
const LOOK_ICONS = {
  fill: '<rect x="2.5" y="2.5" width="11" height="11"/><path d="M8 2.5 H13.5 V13.5 H8 Z" fill="currentColor" stroke="none"/>',
  hand: '<path d="M2 10c2-3 3-3 4 0s2 3 4 0 3-3 4 0"/>',
  clean: '<path d="M2 11h12M4 11v-2M8 11v-3M12 11v-2"/>',
};

function icon(id) {
  return (
    '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" ' +
    `stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${TOOL_ICONS[id] ?? LOOK_ICONS[id]}</svg>`
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
  // The colour and fill for the next shape drawn; with a shape picked, the
  // toolbar shows that shape's instead.
  let nextStyle = { color: "ink", fill: false };
  // The picked sketch's block on the page, to let go of it when the paper
  // is clicked elsewhere.
  let pickedEl = null;
  // Each sketch's undo and redo steps, by "title/n", for as long as the
  // sidebar is open: the block is drawn anew with the note, its history isn't.
  const histories = new Map();

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
    // The sketch as last saved, the "before" of the next undo step.
    let saved = sketch;
    if (!histories.has(key)) histories.set(key, sketchHistory());
    const history = histories.get(key);

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
    block.append(area, toolbar);

    // The text being typed: where it goes, and which shape it changes (-1
    // for a new one). Null while no text is open.
    let typing = null;

    function save(next) {
      const right = Math.max(0, ...next.shapes.map((shape) => bounds(shape).x + bounds(shape).w));
      sketch = { ...next, width: Math.round(Math.max(area.clientWidth, right)) };
      history.record(saved, sketch);
      keep();
    }

    function keep() {
      saved = sketch;
      notebook.saveSketch(title, n, sketch);
      onSaved();
    }

    // Ctrl Z / Ctrl Y: go one step back or forward. Returns false when there
    // is no step.
    function step(back) {
      const other = back ? history.undo(saved) : history.redo(saved);
      if (!other) return false;
      sketch = other;
      pickedShape = -1;
      keep();
      redraw();
      return true;
    }

    // An arrow key moves the picked shape a pixel, ten with Shift.
    function nudge(arrow, far) {
      const by = far ? 10 : 1;
      const [x, y] = { ArrowLeft: [-by, 0], ArrowRight: [by, 0], ArrowUp: [0, -by], ArrowDown: [0, by] }[arrow];
      const box = { width: area.clientWidth, height: sketch.height };
      save({ ...sketch, shapes: moveShapeIn(sketch.shapes, pickedShape, { x, y }, box) });
      drawShapes();
    }

    // The shapes as they are, plus the picked one's frame and handles. A
    // text being changed is left out while its box is open.
    function drawShapes(shapes = sketch.shapes, preview = null) {
      area.style.height = `${sketch.height}px`;
      block.classList.toggle("is-empty", sketch.shapes.length === 0 && !preview && !typing);
      svg.setAttribute("height", sketch.height);
      const shown = shapes.filter((_, i) => i !== typing?.index);
      shapesEl.innerHTML = shapesSvg(preview ? [...shown, preview] : shown, sketchLook(sketch), document.documentElement.hasAttribute("data-dark"));
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
            // A drawing tool lets go of the picked shape, so a colour chosen
            // next is for the new shape, not the last one drawn.
            if (id !== "delete" && id !== "select" && pickedShape !== -1) {
              pickedShape = -1;
              redraw();
              return;
            }
            drawToolbar();
          });
          return button;
        }),
        colourControls(),
        lookSwitch(),
      );
    }

    // The colour and fill now: the picked shape's, or the next shape's.
    function styleNow() {
      const shape = picked === key ? sketch.shapes[pickedShape] : undefined;
      return shape ? shapeStyle(shape) : nextStyle;
    }

    // Choose a colour or fill: it is used for the next shape and, with a
    // shape picked, changes that shape.
    function chooseStyle(change) {
      nextStyle = { ...styleNow(), ...change };
      if (picked === key && sketch.shapes[pickedShape]) {
        save({ ...sketch, shapes: styleShapeIn(sketch.shapes, pickedShape, change) });
      }
      redraw();
      area.focus();
    }

    function toolbarButton(className, label) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = className;
      button.title = label;
      button.setAttribute("aria-label", label);
      button.addEventListener("mousedown", (event) => event.preventDefault());
      return button;
    }

    // The six ink dots and the Fill switch. In a narrow sidebar the dots
    // hide behind one colour button (the stylesheet decides).
    function colourControls() {
      const now = styleNow();
      const dark = document.documentElement.hasAttribute("data-dark");
      const group = document.createElement("span");
      group.className = "sketch-colours";
      const dots = document.createElement("span");
      dots.className = "sketch-dots";
      const shade = (colour) => (colour.id === "ink" ? "var(--ink)" : colour[dark ? "dark" : "light"]);
      for (const colour of SKETCH_COLORS) {
        const dot = toolbarButton(colour.id === now.color ? "sketch-dot is-chosen" : "sketch-dot", colour.label);
        dot.style.setProperty("--dot", shade(colour));
        dot.addEventListener("click", () => chooseStyle({ color: colour.id }));
        dots.append(dot);
      }
      const opener = toolbarButton("sketch-tool sketch-colour-button", "Colour");
      opener.style.setProperty("--dot", shade(SKETCH_COLORS.find(({ id }) => id === now.color)));
      opener.innerHTML = '<span class="sketch-dot is-chosen"></span>';
      opener.addEventListener("click", () => group.classList.toggle("is-open"));
      const fill = toolbarButton(now.fill ? "sketch-tool sketch-fill is-chosen" : "sketch-tool sketch-fill", "Fill. Give boxes, circles and triangles a light wash of their colour");
      fill.setAttribute("aria-pressed", String(now.fill));
      fill.innerHTML = icon("fill");
      fill.addEventListener("click", () => chooseStyle({ fill: !now.fill }));
      group.append(opener, dots, fill);
      return group;
    }

    // The Hand-drawn / Clean switch, saved with the sketch: one small icon
    // like the tools, showing the look now; a click changes to the other.
    function lookSwitch() {
      const now = sketchLook(sketch);
      const other = SKETCH_LOOKS.find(({ id }) => id !== now);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "sketch-tool sketch-look";
      const hint = `${SKETCH_LOOKS.find(({ id }) => id === now).label} look. Click for ${other.label.toLowerCase()}`;
      button.title = hint;
      button.setAttribute("aria-label", hint);
      button.innerHTML = icon(now);
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => {
        const { look, ...rest } = sketch;
        save(other.id === "clean" ? { ...rest, look: "clean" } : rest);
        redraw();
        area.focus();
      });
      return button;
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
          const shape = withStyle(textShape(point, text, 0), nextStyle);
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
            save({ ...sketch, shapes: addShape(sketch.shapes, withStyle(shape, nextStyle)) });
            pickedShape = sketch.shapes.length - 1;
            tool = "select";
          }
          redraw();
        },
      );
    });

    area.addEventListener("keydown", (event) => {
      const ctrl = (event.ctrlKey || event.metaKey) && !event.altKey;
      const letter = event.key.toLowerCase();
      if (ctrl && (letter === "z" || letter === "y")) {
        event.preventDefault();
        step(letter === "z" && !event.shiftKey);
        return;
      }
      const shapePicked = picked === key && sketch.shapes[pickedShape];
      if (shapePicked && event.key.startsWith("Arrow")) {
        event.preventDefault();
        nudge(event.key, event.shiftKey);
        return;
      }
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
        if (shapePicked) {
          pickedShape = -1;
          redraw();
        } else hooks.onLeave?.();
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
