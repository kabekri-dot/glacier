// The editor model: pure functions on one note's Markdown text, with no DOM.
// Live-preview editing (ADR 0006) treats the note as a list of blocks — one per
// line, except a fenced ``` code block which stays together — renders every
// block except the one holding the cursor, and joins the lines back exactly.
//
// The panel wires these functions to the DOM; everything that can be reasoned
// about without a browser lives here and is covered by `node --test`.

export function splitIntoLines(text) {
  return text.split("\n");
}

export function linesToText(lines) {
  return lines.join("\n");
}

// Turn what the editable note holds into the body we save. The panel reads the
// surface with `innerText`, which keeps the line breaks Enter creates (`<div>`
// in Chrome, `<br>` in Firefox) that `textContent` would drop (issue #24).
// Platform line endings are folded to a plain `\n`, so the body is identical
// across browsers and matches the Markdown on disk (ADR 0005); empty lines are
// left untouched.
export function editorTextToBody(text) {
  return text.replace(/\r\n?/g, "\n");
}

// A fence opens or closes a code block. We only need the common ``` form;
// the whole run of lines from the opening fence to the next one (or the end
// of the note) is a single block (ADR 0006).
export function isFence(line) {
  return /^```/.test(line);
}

// The line span of each block, as {start, end} with end exclusive. Most blocks
// are a single line; a fenced code block spans from its opening fence to the
// closing fence (included) or the end of the note if it is never closed.
export function blockRanges(lines) {
  const ranges = [];
  let i = 0;
  while (i < lines.length) {
    if (isFence(lines[i])) {
      const start = i;
      i += 1;
      while (i < lines.length && !isFence(lines[i])) {
        i += 1;
      }
      if (i < lines.length) {
        i += 1; // include the closing fence in the block
      }
      ranges.push({ start, end: i });
    } else {
      ranges.push({ start: i, end: i + 1 });
      i += 1;
    }
  }
  return ranges;
}

// The note split into blocks (raw text). A single-line block is that line; a
// code block is its lines joined with `\n`, so it stays one editable unit.
export function splitIntoBlocks(text) {
  const lines = splitIntoLines(text);
  return blockRanges(lines).map(({ start, end }) =>
    lines.slice(start, end).join("\n"),
  );
}

export function blocksToText(blocks) {
  return blocks.join("\n");
}

// A bullet line: optional indent, a `-`, at least one space, then its content
// (which may be empty for a fresh, still-empty bullet).
const BULLET = /^(\s*)-(\s+)(.*)$/;

// A Link is `[[Title]]` somewhere in the text (CONTEXT.md). The title is the
// run between the brackets with no bracket inside, so `[[A]] [[B]]` are two
// Links. findLinks returns each title and the raw span it occupies, so the
// notebook can list a note's outgoing Links and a rename can rewrite them.
const LINK_PATTERN = /\[\[([^[\]]+)\]\]/g;

export function findLinks(text) {
  const links = [];
  for (const match of text.matchAll(LINK_PATTERN)) {
    links.push({
      title: match[1],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return links;
}

// Enter at (line, col): split the current line. In a bullet the new line keeps
// the marker so the list continues; an empty bullet instead ends the list,
// leaving a blank line where the marker was. Returns the new lines and caret.
export function pressEnter(lines, line, col) {
  const current = lines[line];
  const before = current.slice(0, col);
  const after = current.slice(col);
  const bullet = BULLET.exec(current);

  if (bullet && bullet[3] === "") {
    // An empty bullet: Enter removes the marker and ends the list.
    const next = lines.slice();
    next[line] = "";
    return { lines: next, line, col: 0 };
  }

  if (bullet) {
    // Continue the list: the new line starts with the same indent and marker.
    const marker = `${bullet[1]}-${bullet[2]}`;
    const next = lines.slice();
    next[line] = before;
    next.splice(line + 1, 0, marker + after);
    return { lines: next, line: line + 1, col: marker.length };
  }

  const next = lines.slice();
  next[line] = before;
  next.splice(line + 1, 0, after);
  return { lines: next, line: line + 1, col: 0 };
}

// Backspace at (line, col): at the start of a line, join it with the line
// above (the caret lands where the join happened); otherwise delete the one
// character before the caret. At the very start of the note, nothing happens.
export function pressBackspace(lines, line, col) {
  if (col > 0) {
    const current = lines[line];
    const next = lines.slice();
    next[line] = current.slice(0, col - 1) + current.slice(col);
    return { lines: next, line, col: col - 1 };
  }
  if (line > 0) {
    const prev = lines[line - 1];
    const next = lines.slice();
    next.splice(line - 1, 2, prev + lines[line]);
    return { lines: next, line: line - 1, col: prev.length };
  }
  return { lines, line, col };
}

// Insert text at (line, col), as a paste does: a single line goes in inline;
// several lines split the current line so each pasted line stays its own line.
export function insertText(lines, line, col, text) {
  const current = lines[line];
  const before = current.slice(0, col);
  const after = current.slice(col);
  const pasted = splitIntoLines(text);

  if (pasted.length === 1) {
    const next = lines.slice();
    next[line] = before + pasted[0] + after;
    return { lines: next, line, col: before.length + pasted[0].length };
  }

  const last = pasted[pasted.length - 1];
  const block = [
    before + pasted[0],
    ...pasted.slice(1, -1),
    last + after,
  ];
  const next = lines.slice();
  next.splice(line, 1, ...block);
  return {
    lines: next,
    line: line + pasted.length - 1,
    col: last.length,
  };
}

// Split a Markdown line into segments that map a run of raw characters to the
// text the reader sees. Marker segments (the `#`, `-`, `**`, backticks that
// turn into formatting) render to nothing, so a caret in the rendered text can
// be mapped back to the raw Markdown.
function inlineSegments(content) {
  const segs = [];
  let i = 0;
  let plain = "";
  const flushPlain = () => {
    if (plain !== "") {
      segs.push({ raw: plain, text: plain, kind: "plain" });
      plain = "";
    }
  };

  while (i < content.length) {
    if (content.startsWith("[[", i)) {
      const end = content.indexOf("]]", i + 2);
      if (end > i + 2) {
        flushPlain();
        const inner = content.slice(i + 2, end);
        // Like bold, the brackets are their own zero-width marker segments, so
        // a caret in the rendered title maps back past the `[[` (renderedToRaw).
        segs.push({ raw: "[[", text: "", kind: "marker" });
        segs.push({ raw: inner, text: inner, kind: "link", title: inner });
        segs.push({ raw: "]]", text: "", kind: "marker" });
        i = end + 2;
        continue;
      }
    }
    if (content.startsWith("**", i)) {
      const end = content.indexOf("**", i + 2);
      if (end !== -1) {
        flushPlain();
        const inner = content.slice(i + 2, end);
        segs.push({ raw: "**", text: "", kind: "marker" });
        segs.push({ raw: inner, text: inner, kind: "bold" });
        segs.push({ raw: "**", text: "", kind: "marker" });
        i = end + 2;
        continue;
      }
    }
    if (content[i] === "`") {
      const end = content.indexOf("`", i + 1);
      if (end !== -1) {
        flushPlain();
        const inner = content.slice(i + 1, end);
        segs.push({ raw: "`", text: "", kind: "marker" });
        segs.push({ raw: inner, text: inner, kind: "code" });
        segs.push({ raw: "`", text: "", kind: "marker" });
        i = end + 1;
        continue;
      }
    }
    plain += content[i];
    i += 1;
  }
  flushPlain();
  return segs;
}

// A whole line as segments: a leading heading or bullet marker (rendered to
// nothing) followed by its inline content.
function lineSegments(line) {
  const heading = /^(#{1,3}\s+)(.*)$/.exec(line);
  if (heading) {
    return [
      { raw: heading[1], text: "", kind: "marker" },
      ...inlineSegments(heading[2]),
    ];
  }
  const bullet = /^(\s*-\s+)(.*)$/.exec(line);
  if (bullet) {
    return [
      { raw: bullet[1], text: "", kind: "marker" },
      ...inlineSegments(bullet[2]),
    ];
  }
  return inlineSegments(line);
}

// Map a caret offset in the rendered text of a line back to the offset in the
// raw Markdown. A caret at a boundary lands after any preceding markers (e.g.
// just inside the bold text rather than before its `**`), and a caret past the
// end clamps to the end of the raw line.
export function renderedToRaw(line, renderedOffset) {
  let rawPos = 0;
  let renderedPos = 0;
  for (const seg of lineSegments(line)) {
    if (seg.text.length > 0 && renderedOffset < renderedPos + seg.text.length) {
      return rawPos + (renderedOffset - renderedPos);
    }
    renderedPos += seg.text.length;
    rawPos += seg.raw.length;
  }
  return rawPos;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/"/g, "&quot;");
}

// `linkExists` (optional) answers whether a Link's target note already exists.
// A Link to a note that doesn't exist yet is a Missing Link and renders red
// (CONTEXT.md); when no predicate is given, Links render as normal targets.
function inlineHtml(content, linkExists) {
  let html = "";
  for (const seg of inlineSegments(content)) {
    if (seg.kind === "bold") {
      html += `<strong>${escapeHtml(seg.text)}</strong>`;
    } else if (seg.kind === "code") {
      html += `<code>${escapeHtml(seg.text)}</code>`;
    } else if (seg.kind === "link") {
      const missing = linkExists ? !linkExists(seg.title) : false;
      const cls = missing ? "md-link md-link-missing" : "md-link";
      html += `<a class="${cls}" data-link-title="${escapeAttr(seg.title)}">${escapeHtml(seg.text)}</a>`;
    } else if (seg.kind === "plain") {
      html += escapeHtml(seg.text);
    }
    // marker segments render to nothing
  }
  return html;
}

// Render one Markdown line as the HTML shown when it is not the current line.
// Headings lose their `#`, bullets get a dot, bold and inline code become
// `<strong>`/`<code>`, Links become click targets; everything else is escaped
// text. An empty line keeps its height with a `<br>`. `linkExists` lets the
// caller mark Missing Links (see inlineHtml).
export function renderLineHtml(line, linkExists) {
  const heading = /^(#{1,3})\s+(.*)$/.exec(line);
  if (heading) {
    const level = heading[1].length;
    return `<span class="md-h md-h${level}">${inlineHtml(heading[2], linkExists)}</span>`;
  }
  const bullet = /^(\s*)-\s+(.*)$/.exec(line);
  if (bullet) {
    return `<span class="md-bullet"><span class="md-bullet-dot">•</span>${inlineHtml(bullet[2], linkExists)}</span>`;
  }
  if (line === "") {
    return "<br>";
  }
  return inlineHtml(line, linkExists);
}
