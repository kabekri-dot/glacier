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
  { id: "italic", label: "Italic", markdown: "*italic*", insert: "**", caret: 1 },
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

// `[[` autocomplete (#9). The text typed after an unclosed `[[` before the
// caret, or null when the caret is not inside a Link being written.
export function linkQuery(line, col) {
  const match = /\[\[([^\[\]]*)$/.exec(line.slice(0, col));
  return match ? match[1] : null;
}

// The titles that contain the query, case-insensitively, in their given order.
export function filterTitles(titles, query) {
  const needle = query.toLowerCase();
  return titles.filter((title) => title.toLowerCase().includes(needle));
}

// Complete the Link being written at (line, col) with the exact `title`: the
// `[[query` before the caret, and any `]]` already right after it, become
// `[[Title]]`. Returns the new lines and the caret just after the Link.
export function applyLinkTitle(lines, line, col, title) {
  const current = lines[line];
  const open = current.slice(0, col).lastIndexOf("[[");
  const rest = current.slice(col).replace(/^\]\]/, "");
  const head = `${current.slice(0, open)}[[${title}]]`;
  const next = lines.slice();
  next[line] = head + rest;
  return { lines: next, line, col: head.length };
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

// Where the italic run opened by the `*` or `_` at `start` closes, or -1 when
// it is not italic. A marker inside a word (`snake_case`, `2*3`) stays plain
// text: an opener must not follow a letter or digit or precede a space, and a
// closer must follow a non-space (and, for `_`, must not precede a letter or
// digit). Doubled markers belong to bold, so they are skipped.
function italicEnd(content, start) {
  const mark = content[start];
  const isWord = (c) => c !== undefined && /[\p{L}\p{N}]/u.test(c);
  if (isWord(content[start - 1])) return -1;
  const first = content[start + 1];
  if (first === undefined || /\s/.test(first) || first === mark) return -1;
  for (let j = start + 2; j < content.length; j++) {
    if (content[j] !== mark) continue;
    if (content[j + 1] === mark) {
      j += 1;
      continue;
    }
    if (/\s/.test(content[j - 1])) continue;
    if (mark === "_" && isWord(content[j + 1])) continue;
    return j;
  }
  return -1;
}

// Bold and italic text between its two zero-width marker segments; the inside
// is parsed again so `**bold _and italic_**` nests. Each pair of markers says
// which one opens and which closes, and what formatting it makes (`makes`), so
// the formatting shortcuts can read where a run starts and ends (#44).
function pushStyled(segs, marker, inner, style, makes) {
  segs.push({ raw: marker, text: "", kind: "marker", role: "open", makes });
  segs.push(...inlineSegments(inner, style));
  segs.push({ raw: marker, text: "", kind: "marker", role: "close", makes });
}

// Split a Markdown line into segments that map a run of raw characters to the
// text the reader sees. Marker segments (the `#`, `-`, `**`, backticks that
// turn into formatting) render to nothing, so a caret in the rendered text can
// be mapped back to the raw Markdown.
function inlineSegments(content, style = {}) {
  const segs = [];
  let i = 0;
  let plain = "";
  const flushPlain = () => {
    if (plain !== "") {
      segs.push({ raw: plain, text: plain, kind: "plain", ...style });
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
        segs.push({ raw: "[[", text: "", kind: "marker", role: "open", makes: ["link"] });
        segs.push({ raw: inner, text: inner, kind: "link", title: inner });
        segs.push({ raw: "]]", text: "", kind: "marker", role: "close", makes: ["link"] });
        i = end + 2;
        continue;
      }
    }
    // A web link `[text](address)`: its brackets and `(address)` are marker
    // segments, so only the text is drawn.
    const webLink = /^\[([^[\]]+)\]\(([^()\s]+)\)/.exec(content.slice(i));
    if (webLink) {
      flushPlain();
      const [whole, text, url] = webLink;
      segs.push({ raw: "[", text: "", kind: "marker", role: "open", makes: ["url"] });
      segs.push({ raw: text, text, kind: "url", url });
      segs.push({ raw: `](${url})`, text: "", kind: "marker", role: "close", makes: ["url"] });
      i += whole.length;
      continue;
    }
    if (content.startsWith("***", i)) {
      const end = content.indexOf("***", i + 3);
      if (end > i + 3) {
        flushPlain();
        pushStyled(segs, "***", content.slice(i + 3, end), { ...style, bold: true, italic: true }, ["bold", "italic"]);
        i = end + 3;
        continue;
      }
    }
    if (content.startsWith("**", i)) {
      const end = content.indexOf("**", i + 2);
      if (end !== -1) {
        flushPlain();
        pushStyled(segs, "**", content.slice(i + 2, end), { ...style, bold: true }, ["bold"]);
        i = end + 2;
        continue;
      }
    }
    if (content[i] === "*" || content[i] === "_") {
      const end = italicEnd(content, i);
      if (end !== -1) {
        flushPlain();
        pushStyled(segs, content[i], content.slice(i + 1, end), { ...style, italic: true }, ["italic"]);
        i = end + 1;
        continue;
      }
    }
    if (content[i] === "`") {
      const end = content.indexOf("`", i + 1);
      if (end !== -1) {
        flushPlain();
        const inner = content.slice(i + 1, end);
        segs.push({ raw: "`", text: "", kind: "marker", role: "open", makes: ["code"] });
        segs.push({ raw: inner, text: inner, kind: "code" });
        segs.push({ raw: "`", text: "", kind: "marker", role: "close", makes: ["code"] });
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

// --- Selecting and copying as Markdown (#7) ---------------------------------

// Map an edge of a selection in a drawn line back to the raw Markdown, so the
// copy keeps the marks around what was selected. An edge between drawn
// characters lands after the closing marks before it (`**`, `]]`) and before
// the opening marks after it (`## `, `- `, `**`, `[[`): a selection then takes
// in the marks of everything it covers whole, and none of its neighbours'.
// Past the end it clamps to the end of the line.
export function renderedEdgeToRaw(line, renderedOffset) {
  let rawPos = 0;
  let renderedPos = 0;
  for (const seg of lineSegments(line)) {
    if (renderedOffset === renderedPos) {
      if (seg.role !== "close") return rawPos;
    } else if (renderedOffset < renderedPos + seg.text.length) {
      return rawPos + (renderedOffset - renderedPos);
    }
    renderedPos += seg.text.length;
    rawPos += seg.raw.length;
  }
  return rawPos;
}

// The Markdown between two raw positions { line, col }, start before end.
export function markdownSlice(lines, from, to) {
  if (from.line === to.line) return lines[from.line].slice(from.col, to.col);
  return [
    lines[from.line].slice(from.col),
    ...lines.slice(from.line + 1, to.line),
    lines[to.line].slice(0, to.col),
  ].join("\n");
}

// The short confirmation shown after a copy.
export function copiedMessage(count) {
  return count === 1 ? "Copied 1 line" : `Copied ${count} lines`;
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
    if (seg.kind === "code") {
      html += `<code>${escapeHtml(seg.text)}</code>`;
    } else if (seg.kind === "link") {
      const missing = linkExists ? !linkExists(seg.title) : false;
      const cls = missing ? "md-link md-link-missing" : "md-link";
      html += `<a class="${cls}" data-link-title="${escapeAttr(seg.title)}">${escapeHtml(seg.text)}</a>`;
    } else if (seg.kind === "url") {
      html += `<span class="md-url" title="${escapeAttr(seg.url)}">${escapeHtml(seg.text)}</span>`;
    } else if (seg.kind === "plain") {
      let text = escapeHtml(seg.text);
      if (seg.italic) text = `<em>${text}</em>`;
      if (seg.bold) text = `<strong>${text}</strong>`;
      html += text;
    }
    // marker segments render to nothing (the bullet "•" is drawn by the wrapper)
  }
  return html;
}

// Render one Markdown line as the HTML shown when it is not the current line,
// built from the same shared line description that maps a click back (#33), so
// what is drawn and what a click maps to can never drift apart. Headings lose
// their `#`, bullets get a dot, bold, italic and inline code become `<strong>`/`<em>`/`<code>`,
// Links become click targets, a web link `[text](url)` shows just its text;
// everything else is escaped text. An empty line
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

// The line you're on, split for drawing while you type (ADR 0006 addition,
// #37, #38). Unlike the other lines, its Markdown marks stay visible — faded —
// so the drawn text is exactly the raw line and a caret offset in it is a raw
// offset. Returns the line's kind (heading, list, quote, fence or plain), the
// heading level, and its parts: "mark" for the Markdown that makes the
// formatting, "text" for the rest. A text part may be `bold`, `italic`,
// `code`, a Link (`link`) or a web link (`url`). A mark counts only once it is
// complete (`## `, `**word**`), so half-typed formatting stays plain. Inline
// formatting is read by the same inlineSegments as the rendered lines.
export function focusedLineSpans(line) {
  const withMark = (kind, mark, extra = {}) => {
    const rest = line.slice(mark.length);
    const inline = kind === "fence" ? textParts(rest) : inlineParts(rest);
    return { kind, ...extra, parts: [{ type: "mark", text: mark }, ...inline] };
  };
  const start = lineStart(line);
  if (start) return withMark(start.kind, start.mark, start.level ? { level: start.level } : {});
  if (isFence(line)) return withMark("fence", "```");
  return { kind: "plain", parts: inlineParts(line) };
}

// A line's start — the `## `, `- `, `1. ` or `> ` that makes it a heading, a
// list item or a quote — as { kind, mark, level }, or null for a plain line.
// Inline formatting only ever applies after it.
function lineStart(line) {
  const heading = /^(#{1,3})\s+/.exec(line);
  if (heading) return { kind: "heading", mark: heading[0], level: heading[1].length };
  const list = /^\s*(-|\d+\.)\s+/.exec(line);
  if (list) return { kind: "list", mark: list[0] };
  const quote = /^>\s+/.exec(line);
  if (quote) return { kind: "quote", mark: quote[0] };
  return null;
}

function textParts(text) {
  return text === "" ? [] : [{ type: "text", text }];
}

// Inline segments as focused-line parts: every marker keeps its raw Markdown
// as a visible mark, and the rest keeps its styling.
function inlineParts(content) {
  return inlineSegments(content).map((seg) => {
    if (seg.kind === "marker") return { type: "mark", text: seg.raw };
    const part = { type: "text", text: seg.raw };
    if (seg.bold) part.bold = true;
    if (seg.italic) part.italic = true;
    if (seg.kind === "code") part.code = true;
    if (seg.kind === "link") part.link = true;
    if (seg.kind === "url") part.url = seg.url;
    return part;
  });
}

// --- Formatting shortcuts (#44, ADR 0006 addition) -------------------------
//
// Ctrl+B, Ctrl+I and Ctrl+E turn bold, italic or inline code on or off for a
// selection, or for what is typed next when nothing is selected. What counts
// as formatted is read from inlineSegments, the same parser that draws the
// lines, so a shortcut and the renderer always agree.

const MARKS = { bold: "**", italic: "*", code: "`" };

const isBlank = (token) => !token.atom && /\s/.test(token.text);

// The text after a line's start as formatting tokens: one per character, or
// one per Link or web link, which are kept whole. Each says whether it is
// bold, italic or code. Also returns the top-level runs (opening mark to
// closing mark, as raw spans), every closing mark, and the inside of each
// inline code span.
function formatTokens(content) {
  const tokens = [];
  const runs = [];
  const closes = [];
  const codeSpans = [];
  const open = [];
  let pos = 0;
  let runStart = 0;
  let atom = null;
  const has = (kind) => open.some((marker) => marker.makes.includes(kind));
  const flags = () => ({ bold: has("bold"), italic: has("italic"), code: has("code") });

  for (const seg of inlineSegments(content)) {
    const end = pos + seg.raw.length;
    const whole = seg.makes && (seg.makes.includes("link") || seg.makes.includes("url"));
    if (seg.role === "open") {
      if (open.length === 0) runStart = pos;
      if (whole) atom = { start: pos, ...flags() };
      open.push({ makes: seg.makes, end });
    } else if (seg.role === "close") {
      const opener = open.pop();
      closes.push({ start: pos, end, makes: seg.makes });
      if (seg.makes.includes("code")) codeSpans.push({ start: opener.end, end: pos });
      if (whole) {
        tokens.push({ ...atom, text: content.slice(atom.start, end), end, atom: true });
        atom = null;
      }
      if (open.length === 0) runs.push({ start: runStart, end });
    } else if (!atom) {
      for (let k = 0; k < seg.raw.length; k += 1) {
        tokens.push({ text: seg.raw[k], start: pos + k, end: pos + k + 1, ...flags() });
      }
    }
    pos = end;
  }
  return { tokens, runs, closes, codeSpans };
}

// Consecutive tokens that agree on one kind of formatting.
function groupBy(tokens, kind) {
  const groups = [];
  for (const token of tokens) {
    const last = groups[groups.length - 1];
    if (last && Boolean(last[0][kind]) === Boolean(token[kind])) last.push(token);
    else groups.push([token]);
  }
  return groups;
}

// Write tokens back as Markdown, bold outermost, then italic, then code, with
// spaces at a run's edges kept outside its marks. Text that is both bold and
// italic throughout becomes `***text***`. Returns pieces of text, each token's
// own piece pointing back to it so the selection can follow the words.
function writeTokens(tokens, levels = ["bold", "italic", "code"]) {
  if (levels.length === 0) return tokens.map((token) => ({ text: token.text, token }));
  const [kind, ...rest] = levels;
  const pieces = [];
  for (const group of groupBy(tokens, kind)) {
    if (!group[0][kind]) {
      pieces.push(...writeTokens(group, rest));
      continue;
    }
    let a = 0;
    let b = group.length;
    while (a < b && isBlank(group[a])) a += 1;
    while (b > a && isBlank(group[b - 1])) b -= 1;
    const core = group.slice(a, b);
    pieces.push(...writeTokens(group.slice(0, a), rest));
    if (core.length > 0) {
      const both = kind === "bold" && core.every((token) => token.italic);
      const mark = both ? "***" : MARKS[kind];
      pieces.push({ text: mark }, ...writeTokens(core, both ? ["code"] : rest), { text: mark });
    }
    pieces.push(...writeTokens(group.slice(b), rest));
  }
  return pieces;
}

// One line's part in a shortcut: its start (`- `, `## `…), the text after it
// as tokens, and the selected tokens between raw columns from and to, without
// spaces at the selection's edges.
function linePlan(line, from, to) {
  const prefix = lineStart(line)?.mark.length ?? 0;
  const content = line.slice(prefix);
  const parsed = formatTokens(content);
  const s = from - prefix;
  const e = to - prefix;
  const selected = parsed.tokens.filter((token) => token.start < e && token.end > s);
  while (selected.length > 0 && isBlank(selected[0])) selected.shift();
  while (selected.length > 0 && isBlank(selected[selected.length - 1])) selected.pop();
  return { start: line.slice(0, prefix), content, ...parsed, selected };
}

// Code can't hold bold or italic, and a Link can't go inside code.
function canTake(token, kind) {
  return kind === "code" ? !token.atom : !token.code;
}

// Turn `kind` on or off for a line's selected tokens. The rewritten stretch
// grows over every run it overlaps or touches, so old marks inside are tidied
// away instead of piling up. Returns the new line and the selected words'
// new columns.
function applyPlan(plan, kind, on) {
  const { start, content, tokens, runs, selected } = plan;
  let from = selected[0].start;
  let to = selected[selected.length - 1].end;
  let grown = true;
  while (grown) {
    grown = false;
    for (const run of runs) {
      if (run.start <= to && run.end >= from && (run.start < from || run.end > to)) {
        from = Math.min(from, run.start);
        to = Math.max(to, run.end);
        grown = true;
      }
    }
  }
  const stretch = tokens
    .filter((token) => token.start >= from && token.end <= to)
    .map((token) => {
      const changes = selected.includes(token) && canTake(token, kind);
      return { ...token, [kind]: changes ? on : token[kind], original: token };
    });
  let text = "";
  const placed = new Map();
  for (const piece of writeTokens(stretch)) {
    if (piece.token) placed.set(piece.token.original, start.length + from + text.length);
    text += piece.text;
  }
  const first = selected[0];
  const last = selected[selected.length - 1];
  return {
    line: start + content.slice(0, from) + text + content.slice(to),
    from: placed.get(first),
    to: placed.get(last) + last.text.length,
  };
}

// The lines inside fenced code blocks, fences included: shortcuts skip them.
function codeLines(lines) {
  const inCode = new Set();
  for (const range of blockRanges(lines)) {
    if (!isFence(lines[range.start])) continue;
    for (let l = range.start; l < range.end; l += 1) inCode.add(l);
  }
  return inCode;
}

// `*|*`: the caret between an empty italic pair (one the renderer doesn't
// count as italic yet), not part of a longer run of `*`.
function inEmptyItalic(content, c) {
  return (
    content[c - 1] === "*" &&
    content[c] === "*" &&
    content[c - 2] !== "*" &&
    content[c + 1] !== "*"
  );
}

// A shortcut with nothing selected: just before the closing marks of that
// formatting it steps past them, so typing carries on plain; otherwise it
// inserts the empty pair with the caret inside. In code it does nothing.
function formatAtCaret(lines, caret, kind) {
  const unchanged = { lines, start: caret, end: caret };
  if (codeLines(lines).has(caret.line)) return unchanged;
  const line = lines[caret.line];
  const prefix = lineStart(line)?.mark.length ?? 0;
  const col = Math.max(caret.col, prefix);
  const content = line.slice(prefix);
  const c = col - prefix;
  const { closes, codeSpans } = formatTokens(content);
  const close = closes.find((mark) => mark.start === c && mark.makes.includes(kind));
  const stepTo = (to) => ({ lines, start: { line: caret.line, col: to }, end: { line: caret.line, col: to } });
  if (close) return stepTo(prefix + close.end);
  if (kind === "italic" && inEmptyItalic(content, c)) return stepTo(col + 1);
  if (codeSpans.some((span) => span.start <= c && c <= span.end)) return unchanged;
  const mark = MARKS[kind];
  const next = lines.slice();
  next[caret.line] = line.slice(0, col) + mark + mark + line.slice(col);
  const inside = { line: caret.line, col: col + mark.length };
  return { lines: next, start: inside, end: inside };
}

// Ctrl+B / Ctrl+I / Ctrl+E (`kind` is "bold", "italic" or "code") on the
// selection from `start` to `end`, each a { line, col }. If all of the
// selection already has the formatting it is removed; otherwise all of it gets
// it. Each line gets its own pair of marks after its start, empty lines and
// code blocks are skipped, and code inside the selection is left alone by bold
// and italic. Returns the new lines and the selection over the same words.
export function toggleFormat(lines, start, end, kind) {
  if (start.line === end.line && start.col === end.col) {
    return formatAtCaret(lines, start, kind);
  }
  const inCode = codeLines(lines);
  const plans = new Map();
  for (let l = start.line; l <= end.line; l += 1) {
    if (inCode.has(l)) continue;
    const from = l === start.line ? start.col : 0;
    const to = l === end.line ? end.col : lines[l].length;
    const plan = linePlan(lines[l], from, to);
    if (plan.selected.some((token) => canTake(token, kind))) plans.set(l, plan);
  }
  if (plans.size === 0) return { lines, start, end };

  const on = ![...plans.values()].every((plan) =>
    plan.selected.every((token) => !canTake(token, kind) || token[kind]),
  );
  const next = lines.slice();
  let newStart = start;
  let newEnd = end;
  for (const [l, plan] of plans) {
    const done = applyPlan(plan, kind, on);
    next[l] = done.line;
    if (l === start.line) newStart = { line: l, col: done.from };
    if (l === end.line) newEnd = { line: l, col: done.to };
  }
  return { lines: next, start: newStart, end: newEnd };
}

// --- Enter and Shift+Enter inside formatting (#45) --------------------------

// The bold, italic and code pairs the caret sits inside (between a pair's
// opening and closing marks), outermost first, as raw columns of the line.
// Read from inlineSegments like the renderer, so they always agree. Fenced
// code lines have none.
function pairsAround(lines, caret) {
  if (codeLines(lines).has(caret.line)) return [];
  const line = lines[caret.line];
  const prefix = lineStart(line)?.mark.length ?? 0;
  const c = caret.col - prefix;
  const pairs = [];
  const open = [];
  let pos = 0;
  for (const seg of inlineSegments(line.slice(prefix))) {
    const end = pos + seg.raw.length;
    if (seg.role === "open") {
      open.push({ start: pos, openEnd: end, mark: seg.raw, makes: seg.makes });
    } else if (seg.role === "close") {
      const pair = open.pop();
      const styled = pair.makes.some((kind) => kind in MARKS);
      if (styled && pair.openEnd <= c && c <= pos) {
        pairs.push({ mark: pair.mark, closeEnd: end + prefix });
      }
    }
    pos = end;
  }
  return pairs.reverse();
}

// Enter inside formatting leaves it: the column just past the outermost
// closing marks, or null when the caret is not inside any formatting.
export function columnAfterFormatting(lines, line, col) {
  const pairs = pairsAround(lines, { line, col });
  if (pairs.length === 0) return null;
  return Math.max(...pairs.map((pair) => pair.closeEnd));
}

// Shift+Enter inside formatting carries it to a new line: the open marks are
// closed at the end of the first line and reopened at the start of the second,
// where the caret lands. Null when the caret is not inside any formatting.
export function breakInsideFormatting(lines, line, col) {
  const pairs = pairsAround(lines, { line, col });
  if (pairs.length === 0) return null;
  const closing = pairs.map((pair) => pair.mark).reverse().join("");
  const opening = pairs.map((pair) => pair.mark).join("");
  const next = lines.slice();
  next[line] = lines[line].slice(0, col) + closing;
  next.splice(line + 1, 0, opening + lines[line].slice(col));
  return { lines: next, line: line + 1, col: opening.length };
}
