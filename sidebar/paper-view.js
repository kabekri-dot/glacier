// The paper (ADR 0006): the open note drawn as blocks, the line being edited
// as its editing surface (sidebar/focused-line.js), selecting and copying
// (sidebar/paper-selection.js), the `/` menu list, clicks on drawn lines and
// on the bare paper, sketches between the lines, and notes as pages with the
// ‹ 1 of 3 › bar and New page at the end (#108, #122, sidebar/page-view.js). What the note's lines are, and
// what each click and key means, is the Editor session's; this draws it.
//
//   createPaper({ noteEl, editor, screen, notebook, sketchView, pagesOn,
//                 endHidden, onHideEnd, settingsOpen, showIfLocked, openLink,
//                 hint, onTyped, showNotice, fitRows, afterDraw, onBreak })
//     noteEl          the paper element
//     editor          the Editor session
//     screen          the Screen (the open note, a fresh page)
//     notebook        for Links that exist and a sketch's shapes
//     sketchView      draws a sketch for its embed line
//     pagesOn()       whether notes show as pages
//     endHidden()     whether New page at the end of notes was hidden
//     onHideEnd()     the × on New page at the end was clicked
//     settingsOpen()  whether settings hold the focus
//     showIfLocked()  draw the passcode card for a locked note; true if it did
//     openLink(title) follow a Link
//     hint()          the quiet text on an empty line
//     onTyped()       after a key typed into the note
//     showNotice(text, ms)  a short message in the bottom corner
//     fitRows(blocks) keep the ruled rows in step with the text of these blocks
//     afterDraw(locked)  after each draw; locked when the passcode card shows
//     onBreak()       `/break` and Enter on an empty line: the hidden game (#128)
//   .render()                draw the paper from the session's lines and caret
//   .moveTo(line, col)       put the caret there and draw
//   .jumpToLine(line)        the caret at a line, scrolled near the top
//   .open()                  draw a note just shown: no page turn
//   .focusedEl()             the line being edited, or null
//   .shownPageSpan()         the lines of the page on screen, or null for all
//   .noteShown()             whether a note is drawn (not a card)
//   .selectWholeNote(), .extract()
//   .updatePageBar()         after a card replaced the note, or the end
//                            button was hidden or shown
//   .redrawPages()           the pages setting switched
//   .showSearchMatch(query)  a note opened from search: its first match's page
import {
  blockRanges,
  isFence,
  listNumbers,
  renderLineHtml,
  unchangedEnds,
} from "../src/editor-model.mjs";
import { isSketchLine } from "../src/sketch-file.mjs";
import { isShortcut } from "../src/keys.mjs";
import { pagesOf, pageOfLine, pageBreaks, lineOfSearch, pageControls } from "../src/pages.mjs";
import { createPageView } from "./page-view.js";
import { createFocusedLine } from "./focused-line.js";
import { createPaperSelection } from "./paper-selection.js";
import { removeQuestion } from "./cards.js";
import { renderedOffsetAt, placeCaret } from "./paper-text.js";

export function createPaper({
  noteEl,
  editor,
  screen,
  notebook,
  sketchView,
  pagesOn,
  endHidden,
  onHideEnd,
  settingsOpen,
  showIfLocked,
  openLink,
  hint,
  onTyped,
  showNotice,
  fitRows,
  afterDraw,
  onBreak,
}) {
  // Does a Link's target note already exist? A Link to a note that doesn't
  // (a Missing Link) renders red (#8).
  const linkExists = (title) => !notebook.isMissingLink(title);

  // Move the caret and redraw. The placement decision is the session's; this
  // only draws the result. Moving the caret is clicking elsewhere, so it
  // dismisses an open menu first; if that took out a `/` on its own line above
  // the target, the target shifts up by one line (#28).
  function moveTo(line, col) {
    const removed = editor.dismissMenu();
    if (removed !== -1 && removed < line) line -= 1;
    editor.moveTo(line, col);
    render();
  }

  // A click on the bare paper below the last line: the session adds empty lines
  // down to the ruled row that was clicked and puts the caret there (#35). Clicks
  // on a line itself are handled by that line, so only the paper itself counts.
  noteEl.addEventListener("mousedown", (event) => {
    if (event.target !== noteEl || !noteEl.lastElementChild) return;
    // On a fresh page a click only puts the caret on the first line: adding
    // lines down to the click would already make the note (#61).
    if (screen.freshPage()) {
      event.preventDefault();
      render();
      return;
    }
    if (!screen.note()) return;
    const below = event.clientY - noteEl.lastElementChild.getBoundingClientRect().bottom;
    if (below < 0) return;
    event.preventDefault();
    // Below a page that isn't the last, the caret goes to the page's end:
    // new lines are only added after the note's last line.
    const shown = shownPageSpan();
    if (shown && shown.end < editor.lines.length) {
      moveTo(shown.end - 1, editor.lines[shown.end - 1].length);
      return;
    }
    const rowHeight = parseFloat(getComputedStyle(noteEl).lineHeight);
    editor.dismissMenu();
    editor.clickPaper(Math.floor(below / rowHeight));
    render();
  });

  // The `/` command menu's list element while it is open, or null. All the menu
  // decisions — when it opens, what it shows, the highlight, picking, dismissing
  // and the + placement — live in the Editor session (#32); this element just
  // draws editor.menu, floating over the page near the current line.
  let menuEl = null;
  // The focused line's editing surface, kept so the menu can be positioned
  // against it after a re-render.
  let focusedEl = null;

  // Draw editor.menu (or remove the list when the session has closed it). The
  // menu floats just under the focused line, which keeps the caret, so
  // typing still filters and ↑/↓/Enter/Tab/Esc drive it.
  function drawMenu() {
    const state = editor.menu;
    if (!state || !focusedEl) {
      if (menuEl) {
        menuEl.remove();
        menuEl = null;
      }
      return;
    }
    if (!menuEl) {
      menuEl = document.createElement("ul");
      menuEl.className = "slash-menu";
      document.body.appendChild(menuEl);
    }
    menuEl.replaceChildren();
    state.commands.forEach((command, i) => {
      const item = document.createElement("li");
      item.className = i === state.selected ? "slash-item is-selected" : "slash-item";
      const label = document.createElement("span");
      label.className = "slash-label";
      label.textContent = command.label;
      // Each command shows the Markdown it inserts, so the syntax is learned by
      // using it (ADR 0006).
      const md = document.createElement("span");
      md.className = "slash-md";
      md.textContent = command.markdown ?? "";
      item.append(label, md);
      // Moving the mouse over a command selects it, so mouse and ↑/↓ share one
      // highlight. (mousemove, not hover: a menu that opens under a resting
      // pointer must not show a second highlight, which Firefox otherwise does.)
      item.addEventListener("mousemove", () => {
        if (!editor.menu || editor.menu.selected === i) return;
        editor.menuSelect(i);
        // A lightweight highlight move: don't rebuild the list (which would
        // reset its scroll and fight the resting pointer), just move the class.
        menuEl.querySelector(".is-selected")?.classList.remove("is-selected");
        item.classList.add("is-selected");
      });
      // mousedown (not click) keeps the caret in the line as we apply.
      item.addEventListener("mousedown", (event) => {
        event.preventDefault();
        editor.menuSelect(i);
        editor.pickMenu();
        render();
      });
      menuEl.appendChild(item);
    });
    const rect = focusedEl.getBoundingClientRect();
    menuEl.style.left = `${rect.left}px`;
    menuEl.style.top = `${rect.bottom}px`;
    // Keep the highlighted command in view when ↑/↓ move past the visible part
    // of the list. Scrolling only the menu itself never moves the page.
    const item = menuEl.children[state.selected];
    if (item) {
      const top = item.offsetTop;
      const bottom = top + item.offsetHeight;
      if (top < menuEl.scrollTop) menuEl.scrollTop = top;
      else if (bottom > menuEl.scrollTop + menuEl.clientHeight) {
        menuEl.scrollTop = bottom - menuEl.clientHeight;
      }
    }
  }

  // Dismiss the menu without picking (the session removes an untouched + `/`),
  // then redraw so the removal shows. Used by the terminal dismissals: Esc,
  // clicking outside the line, and scrolling away from the menu (#28).
  function dismissAndRedraw() {
    if (redrawing || !editor.menu) return;
    editor.dismissMenu();
    render();
  }

  // A floating menu would drift away from its line, so scrolling closes it.
  // Scrolling *inside* the menu (mouse wheel, or keeping the highlight in view)
  // is just browsing the list, so only scrolling anything else closes it.
  window.addEventListener(
    "scroll",
    (event) => {
      if (menuEl && menuEl.contains(event.target)) return;
      dismissAndRedraw();
    },
    true,
  );

  // A rendered block reacts to a plain click, not to the press, so a press
  // that drags selects across lines instead (#7). While the `/` menu is open
  // the press still acts at once and keeps the caret in its line: letting the
  // line lose focus would dismiss the menu and redraw the note mid-click.
  function onPlainClick(el, act) {
    el.addEventListener("mousedown", (event) => {
      if (!editor.menu) return;
      event.preventDefault();
      act(event);
    });
    el.addEventListener("click", (event) => {
      if (window.getSelection().isCollapsed) act(event);
    });
  }

  // Backspace on a picked sketch removes it, after Glacier's own question
  // under the sketch when it has shapes (#104, #116). Ctrl Z brings it back;
  // its data goes when the note is left.
  function removeSketchLine() {
    const line = editor.state.focus.line;
    const embed = editor.lines[line];
    const found = notebook.sketchForLine(embed);
    if (!(found?.sketch.shapes.length > 0)) {
      editor.removeSketchLine();
      render();
      return;
    }
    const { card, keep } = removeQuestion({
      text: "Remove this sketch and its shapes?",
      action: "Remove",
      onAction: () => {
        card.remove();
        if (editor.lines[line] !== embed) return;
        editor.moveTo(line, 0);
        editor.removeSketchLine();
        render();
      },
      onKeep: () => {
        card.remove();
        pickSketchOnRender = true;
        render();
      },
    });
    noteEl.querySelector(`.sketch-block[data-start="${line}"]`)?.after(card);
    keep.focus();
  }

  // Esc in a sketch: the caret goes to the next line, or the one before.
  function leaveSketch() {
    if (!editor.moveDown("", 0)) editor.moveUp("", 0);
    render();
  }

  // Set when Backspace has just landed the caret on a sketch, so it shows
  // as picked: the next Backspace removes it.
  let pickSketchOnRender = false;

  // How a block is drawn, so a block drawn the same way can stay on the
  // paper when the lines around it change (#120): its Markdown, Link colours,
  // number or page label are all in the key. The line being edited has none,
  // and a sketch is always drawn again.
  function blockKey(range, focusLine) {
    if (focusLine >= range.start && focusLine < range.end && !isSketchLine(editor.lines[focusLine])) return null;
    const line = editor.lines[range.start];
    if (isFence(line)) return `code:${editor.lines.slice(range.start, range.end).join("\n")}`;
    if (pageBreakSet.has(range.start)) return `break:${pageOfLine(editor.lines, range.start)}`;
    if (isSketchLine(line)) return `sketch:${line}`;
    return `line:${renderLineHtml(line, linkExists, itemNumbers[range.start] ?? undefined)}`;
  }

  // Build one rendered (non-focused) block. A kept block moves down or up
  // when lines are added or removed above it, so its clicks read its line
  // from data-start when they happen.
  function renderedBlock(range) {
    const blockLines = editor.lines.slice(range.start, range.end);
    const el = document.createElement("div");
    el.className = "block";
    el.dataset.start = range.start;
    const start = () => Number(el.dataset.start);

    if (isFence(blockLines[0])) {
      // A code block: show the code, fences hidden. Clicking drops the caret in
      // just after the opening fence so the raw block opens for editing.
      const closed =
        blockLines.length > 1 && isFence(blockLines[blockLines.length - 1]);
      const inner = blockLines.slice(1, closed ? -1 : undefined);
      const pre = document.createElement("pre");
      pre.className = "md-code";
      const code = document.createElement("span");
      code.textContent = inner.join("\n");
      pre.appendChild(code);
      el.appendChild(pre);
      el.dataset.code = "";
      onPlainClick(el, () => moveTo(start(), blockLines[0].length));
      return el;
    }

    const line = blockLines[0];
    // With all pages shown, a page break is a quiet dotted line (#108).
    if (pageBreakSet.has(range.start)) {
      el.classList.add("page-break");
      el.textContent = `page ${pageOfLine(editor.lines, range.start) + 1}`;
      onPlainClick(el, () => moveTo(start(), line.length));
      return el;
    }
    // A sketch's embed line shows the drawing instead (#101). Its raw line
    // only shows when the caret is moved onto it with the keys.
    const sketch = sketchView.draw(line, {
      selected: pickSketchOnRender && editor.state.focus.line === range.start,
      onPick: () => editor.moveTo(range.start, 0),
      onStep: (direction) => {
        if (direction < 0 ? editor.moveUp("", 0) : editor.moveDown("", 0)) render();
      },
      onEnter: () => {
        editor.enter("", 0, 0);
        render();
      },
      onRemove: removeSketchLine,
      onLeave: leaveSketch,
    });
    if (sketch) {
      sketch.dataset.start = range.start;
      return sketch;
    }
    el.innerHTML = renderLineHtml(line, linkExists, itemNumbers[range.start] ?? undefined);
    onPlainClick(el, (event) => {
      // A click on a checkbox's box ticks it and saves; the caret stays put.
      if (event.target.closest?.(".md-check-box")) {
        editor.toggleCheckbox(start());
        render();
        return;
      }
      // The sidebar finds which drawn character the click landed on; the Editor
      // session decides what it means from the one shared line description (#33).
      const rendered = renderedOffsetAt(el, event.clientX, event.clientY);
      const hit = editor.clickLine(start(), rendered);
      // A plain click on a Link follows it instead of dropping the caret: it
      // opens the linked note, or creates and opens a note for a Missing Link
      // (#8).
      if (hit.type === "link") {
        openLink(hit.title);
        return;
      }
      moveTo(hit.line, hit.col);
    });
    return el;
  }


  // --- The line being edited (#37): sidebar/focused-line.js ----------------
  const focusedBlock = createFocusedLine({
    editor,
    render: () => render(),
    drawMenu: () => drawMenu(),
    dismissMenu: () => dismissAndRedraw(),
    selectWholeNote: () => paperSelection.selectWholeNote(),
    focusedEl: () => focusedEl,
    hint,
    onTyped,
    pickSketch: (yes) => (pickSketchOnRender = yes),
    onBreak,
  });

  // --- Selecting, copying and Extract (#7, #99): sidebar/paper-selection.js --
  const paperSelection = createPaperSelection({
    noteEl,
    editor,
    focusedEl: () => focusedEl,
    dismissMenu: () => dismissAndRedraw(),
    render: () => render(),
    showNotice,
  });
  const noteShown = paperSelection.noteShown;

  // Rebuild the page from the current lines, with the focused block as the
  // styled editing surface and every other block rendered. The caret is
  // restored afterwards.
  // Taking the old focused line out of the page fires its blur, which would
  // dismiss a menu the + has just opened (the real click is lost, #88).
  let redrawing = false;
  // The page breaks of the note being drawn, so each block can ask (#108).
  let pageBreakSet = new Set();
  // The number each numbered item is drawn with (#110).
  let itemNumbers = [];
  // The key each drawn block was drawn with, and the paper's width when the
  // rows were last fitted, so a redraw can keep what didn't change (#120).
  const drawnKeys = new WeakMap();
  let fittedWidth = null;
  function render() {
    // A locked secret note shows the passcode card instead (#109).
    if (showIfLocked()) {
      afterDraw(true);
      updatePageBar();
      return;
    }
    // Keep the session's focused-block span in step with the caret before we
    // read it back to place the caret (#31).
    editor.relayout();
    // With notes as pages only the caret's page is drawn, and a page break
    // never holds the caret (#108). A new page turns the old one over.
    pageBreakSet = new Set(pageBreaks(editor.lines));
    itemNumbers = listNumbers(editor.lines);
    if (pagesOn() && pageBreakSet.has(editor.state.focus.line)) {
      const page = pagesOf(editor.lines)[pageOfLine(editor.lines, editor.state.focus.line)];
      editor.moveTo(page.start, 0);
    }
    const page = shownPageSpan();
    const turn = page ? pageView.turnFor(pageOfLine(editor.lines, page.start), pagesOf(editor.lines).length, noteEl) : null;
    focusedEl = null;
    const { lines, focus } = editor.state;
    const ranges = blockRanges(lines).filter((range) => !page || (range.start >= page.start && range.start < page.end));
    let focused = null;
    sketchView.unpickExcept(isSketchLine(lines[focus.line]) ? lines[focus.line] : null);
    // A new note's title follows its first line until the caret leaves it (#80).
    if (focus.line > 0) screen.leaveFirstLine();

    // Only the blocks between the unchanged start and end of the paper are
    // drawn again (#120); a page turn or another note changes them all.
    const keys = ranges.map((range) => blockKey(range, focus.line));
    const shownEls = [...noteEl.children];
    const { head, tail } = unchangedEnds(shownEls.map((el) => drawnKeys.get(el)), keys);
    const after = shownEls[shownEls.length - tail] ?? null;
    const fresh = [];
    redrawing = true;
    for (const el of shownEls.slice(head, shownEls.length - tail)) el.remove();
    ranges.forEach((range, i) => {
      if (i < head || i >= ranges.length - tail) {
        // The unchanged end is matched from the back, so count from there.
        const kept = i < head ? shownEls[i] : shownEls[shownEls.length - (ranges.length - i)];
        if (!keys[i].startsWith("sketch:")) {
          if (kept.dataset.start !== String(range.start)) kept.dataset.start = range.start;
          return;
        }
        const sketch = renderedBlock(range);
        drawnKeys.set(sketch, keys[i]);
        kept.replaceWith(sketch);
        fresh.push(sketch);
        return;
      }
      if (keys[i] === null) {
        const built = focusedBlock(range);
        // The + button opens the command menu from the left of the current
        // line; the session drops the `/` and opens the menu (#32).
        const plus = document.createElement("button");
        plus.type = "button";
        plus.className = "line-plus";
        plus.textContent = "+";
        plus.setAttribute("aria-label", "Open the command menu");
        // On a fresh page the + would already make the note, so it waits.
        plus.hidden = Boolean(screen.freshPage());
        plus.addEventListener("mousedown", (event) => {
          event.preventDefault();
          editor.openMenuFromPlus(built.start);
          render();
        });
        const row = document.createElement("div");
        row.className = "line-row";
        row.append(plus, built.el);
        noteEl.insertBefore(row, after);
        fresh.push(row);
        focused = built.el;
      } else {
        const el = renderedBlock(range);
        drawnKeys.set(el, keys[i]);
        noteEl.insertBefore(el, after);
        fresh.push(el);
      }
    });
    redrawing = false;

    pickSketchOnRender = false;
    // A kept block keeps its padding, unless the paper's width changed.
    const width = noteEl.clientWidth;
    fitRows(width === fittedWidth ? fresh : undefined);
    fittedWidth = width;
    // The caret on a sketch line sits in the drawing's area (#104).
    const sketchAt = isSketchLine(lines[focus.line]) ? noteEl.querySelector(`[data-start="${focus.line}"] .sketch-area`) : null;
    if (sketchAt && !settingsOpen()) sketchAt.focus();
    // With settings open the focus stays in them; closing puts it back here.
    if (focused) {
      focusedEl = focused;
      if (!settingsOpen()) {
        focused.focus();
        placeCaret(focused, editor.caretOffset());
      }
    }

    // Draw the `/` menu against the fresh line (the + button opens it just
    // before a render), or remove it when the session has closed it (#32).
    drawMenu();
    afterDraw(false);
    updatePageBar();
    if (turn) {
      if (focus.line === page.start) window.scrollTo(0, 0);
      turn.play(noteEl);
    }
  }

  // --- Notes as pages (#108, #122) --------------------------------------------
  //
  // Which lines are pages, and which page controls show, is src/pages.mjs;
  // the session steps ↑ and ↓ over the breaks. This draws the caret's page,
  // the ‹ 1 of 3 › bar under the top bar, New page at the end of the paper
  // and the pixel page turn (sidebar/page-view.js).
  const pageView = createPageView({
    onTurn: (step) => turnPage(step),
    onNewPage: () => {
      editor.dismissMenu();
      editor.newPage();
      render();
    },
    onDelete: () => {
      editor.dismissMenu();
      pageView.forget();
      if (editor.deletePage()) render();
    },
    onHideEnd,
  });
  noteEl.after(pageView.bar, pageView.end);
  // A wider or narrower sidebar moves the last line, and the end button with it.
  new ResizeObserver(() => updatePageBar()).observe(noteEl);

  // The line span of the page on screen, or null when all pages show.
  function shownPageSpan() {
    if (!pagesOn()) return null;
    return pagesOf(editor.lines)[pageOfLine(editor.lines, editor.state.focus.line)];
  }

  // A note's lines are on the paper (a picked sketch holds the caret
  // without a .line-row), not a card or the start prompt.
  const pagesDrawn = () => pagesOn() && noteEl.querySelector(".line-row, [data-start]") !== null;

  function updatePageBar() {
    const shown = pagesDrawn() && !screen.freshPage();
    const count = pagesOf(editor.lines).length;
    const controls = pageControls({ pagesOn: shown, count, endHidden: endHidden() });
    document.documentElement.toggleAttribute("data-pages", controls.strip);
    pageView.update(controls.strip ? { index: pageOfLine(editor.lines, editor.state.focus.line), count } : null);
    noteEl.classList.toggle("has-end", controls.endButton);
    pageView.showEnd(controls.endButton ? noteEl.lastElementChild : null, parseFloat(getComputedStyle(noteEl).lineHeight));
  }

  // ‹ and › and Ctrl PageUp / PageDown: the caret goes to the top of the
  // page before or after, which draws that page.
  function turnPage(step) {
    if (!pagesDrawn()) return;
    const pages = pagesOf(editor.lines);
    const target = pages[pageOfLine(editor.lines, editor.state.focus.line) + step];
    if (target) moveTo(target.start, 0);
  }

  // The setting switched: the caret's page, or every page, without a turn.
  function redrawPages() {
    if (!noteEl.querySelector(".line-row, [data-start]")) return;
    pageView.forget();
    render();
  }

  // A search inside notes opens on the page of the first match, without a
  // turn (it is a new note opening, not a page turned).
  function showSearchMatch(query) {
    const line = lineOfSearch(editor.lines, query);
    if (line === 0 || !noteShown()) return;
    pageView.forget();
    jumpToLine(line);
  }

  document.addEventListener("keydown", (event) => {
    const isTurn = isShortcut(event, "PageUp") || isShortcut(event, "PageDown");
    if (!isTurn || !pagesDrawn() || event.target.closest?.("input, textarea")) return;
    event.preventDefault();
    turnPage(event.key === "PageUp" ? -1 : 1);
  });

  // The caret at the start of a line, the paper scrolled so it sits near the
  // top: a heading from the contents, a search match.
  function jumpToLine(line) {
    moveTo(line, 0);
    const row = focusedEl?.closest(".line-row");
    if (!row) return;
    row.style.scrollMarginTop = "4rem";
    row.scrollIntoView({ block: "start" });
  }

  // A note just shown (opened, made, reloaded) draws without a page turn.
  function open() {
    pageView.forget();
    render();
  }

  return {
    render,
    moveTo,
    jumpToLine,
    open,
    focusedEl: () => focusedEl,
    shownPageSpan,
    noteShown,
    selectWholeNote: paperSelection.selectWholeNote,
    extract: paperSelection.extract,
    updatePageBar,
    redrawPages,
    showSearchMatch,
  };
}
