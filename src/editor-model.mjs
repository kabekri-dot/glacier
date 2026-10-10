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

// The `/` command menu (ADR 0006, #6). Typing `/` at the start of a line opens
// a menu of commands, each shown next to the Markdown it inserts, so the syntax
// is learned by using it. `insert` is the Markdown dropped in when the command
// is applied, and `caret` is where the caret lands inside it (a `\n` in
// `insert` becomes a real line break, so Code block opens on its empty line).
export const SLASH_COMMANDS = [
  { id: "h1", label: "Heading 1", markdown: "#", insert: "# ", caret: 2 },
  { id: "h2", label: "Heading 2", markdown: "##", insert: "## ", caret: 3 },
  { id: "h3", label: "Heading 3", markdown: "###", insert: "### ", caret: 4 },
  { id: "bullet", label: "Bullet list", markdown: "-", insert: "- ", caret: 2 },
  { id: "link", label: "Link to a note", markdown: "[[ ]]", insert: "[[]]", caret: 2 },
  { id: "bold", label: "Bold", markdown: "**bold**", insert: "****", caret: 2 },
  { id: "code", label: "Inline code", markdown: "`code`", insert: "``", caret: 1 },
  { id: "codeblock", label: "Code block", markdown: "```", insert: "```\n\n```", caret: 4 },
];

// The command query a caret is in, or null when the menu should stay closed.
// The menu opens only when a line starts with `/`, so a `/` in the middle of a
// line does nothing; the query is the run of non-space characters after it, up
// to the caret (what has been typed to filter the list).
export function slashQuery(line, col) {
  const before = line.slice(0, col);
  const match = /^\/(\S*)$/.exec(before);
  return match ? match[1] : null;
}

// The commands whose name contains the query, case-insensitively. An empty
// query (just `/`) lists every command; "he" lists the three headings.
export function filterCommands(query) {
  const needle = query.toLowerCase();
  return SLASH_COMMANDS.filter((command) =>
    command.label.toLowerCase().includes(needle),
  );
}

// Apply a command at (line, col): replace the `/query` typed so far (everything
// before the caret on this line) with the command's Markdown, keeping any text
// after the caret, and land the caret where the command points. Returns the new
// lines and caret, like the other editing functions.
export function applySlashCommand(lines, line, col, command) {
  const after = lines[line].slice(col);
  // A multi-line command (Code block) puts the text after the caret inside the
  // block, on the caret's line. Appended at the end it would sit on the closing
  // fence line, where the rendered view hides it.
  const text = command.insert.includes("\n")
    ? command.insert.slice(0, command.caret) + after + command.insert.slice(command.caret)
    : command.insert + after;
  const inserted = splitIntoLines(text);
  const next = lines.slice();
  next.splice(line, 1, ...inserted);
  const caretLines = splitIntoLines(command.insert.slice(0, command.caret));
  return {
    lines: next,
    line: line + caretLines.length - 1,
    col: caretLines[caretLines.length - 1].length,
  };
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
    // Never merge a line into a ``` fence (#27): joining text and a fence would
    // either destroy the fence (`"abc" + "```"`) or turn a line into a new
    // opening fence (`"```" + "text"`), breaking the code block or swallowing
    // the text below it. At the start of a code block, or on the line right
    // after a closing fence, just move the caret to the end of the line above,
    // leaving the Markdown untouched.
    if (isFence(lines[line]) || isFence(lines[line - 1])) {
      return { lines, line: line - 1, col: lines[line - 1].length };
    }
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

// A whole line as segments: the one shared description of a line (#33). Both
// drawing the line (renderLineHtml) and mapping a drawn position back to the
// Markdown (renderedToRaw, linkAtRendered) read it, so the two can never
// disagree. Each segment carries its raw Markdown (`raw`) and the text actually
// drawn for it (`text`); a marker's `text` is what the reader sees in its place
// — nothing for a heading's `#` or bold's `**`, but the drawn "•" for a bullet,
// which therefore counts as one drawn character on both sides of the mapping
// (the heart of the #30 fix).
function lineSegments(line) {
  const heading = /^(#{1,3})(\s+)(.*)$/.exec(line);
  if (heading) {
    return [
      {
        raw: heading[1] + heading[2],
        text: "",
        kind: "marker",
        marker: "heading",
        level: heading[1].length,
      },
      ...inlineSegments(heading[3]),
    ];
  }
  const bullet = /^(\s*-\s+)(.*)$/.exec(line);
  if (bullet) {
    return [
      { raw: bullet[1], text: "•", kind: "marker", marker: "bullet" },
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
      // A drawn position inside a visible marker (the bullet "•") belongs to
      // the marker, not to a character of the raw Markdown: it lands at the
      // marker's end — the start of the content — so clicking the dot puts the
      // caret where the text begins (#30), never one character into it.
      if (seg.kind === "marker") return rawPos + seg.raw.length;
      return rawPos + (renderedOffset - renderedPos);
    }
    renderedPos += seg.text.length;
    rawPos += seg.raw.length;
  }
  return rawPos;
}

// The title of the Link a drawn position falls on, or null when the position
// is not on a Link. Read from the same shared line description as the drawing,
// so a click the sidebar located in the drawn line reports the Link under it
// (#33) without a second, separate parse of the Markdown.
export function linkAtRendered(line, renderedOffset) {
  let renderedPos = 0;
  for (const seg of lineSegments(line)) {
    if (
      seg.kind === "link" &&
      renderedOffset >= renderedPos &&
      renderedOffset < renderedPos + seg.text.length
    ) {
      return seg.title;
    }
    renderedPos += seg.text.length;
  }
  return null;
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

// The HTML for a run of inline segments. `linkExists` (optional) answers
// whether a Link's target note already exists: a Link to a note that doesn't
// exist yet is a Missing Link and renders red (CONTEXT.md); when no predicate
// is given, Links render as normal targets.
function inlineHtml(segments, linkExists) {
  let html = "";
  for (const seg of segments) {
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
    // marker segments render to nothing (the bullet "•" is drawn by the wrapper)
  }
  return html;
}

// Render one Markdown line as the HTML shown when it is not the current line,
// built from the same shared line description that maps a click back (#33), so
// what is drawn and what a click maps to can never drift apart. Headings lose
// their `#`, bullets get a dot, bold and inline code become `<strong>`/`<code>`,
// Links become click targets; everything else is escaped text. An empty line
// keeps its height with a `<br>`. `linkExists` lets the caller mark Missing
// Links (see inlineHtml).
export function renderLineHtml(line, linkExists) {
  if (line === "") {
    return "<br>";
  }
  const segments = lineSegments(line);
  const first = segments[0];
  if (first && first.marker === "heading") {
    return `<span class="md-h md-h${first.level}">${inlineHtml(segments.slice(1), linkExists)}</span>`;
  }
  if (first && first.marker === "bullet") {
    return `<span class="md-bullet"><span class="md-bullet-dot">•</span>${inlineHtml(segments.slice(1), linkExists)}</span>`;
  }
  return inlineHtml(segments, linkExists);
}
