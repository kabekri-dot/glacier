// The cards on the paper before the browser asks for a permission (ADR 0008),
// and the start prompt when no note is open (#3). Each says what the
// permission is for and what it is never used for; the browser's prompt only
// appears after Allow, straight from that click.
import { PAGE_NOTE_HINT } from "../src/new-note-choices.mjs";

const NEVER = "Glacier never reads, saves or sends anything from the pages you visit.";

function paragraph(className, text) {
  const p = document.createElement("p");
  if (className) p.className = className;
  p.textContent = text;
  return p;
}

function cardButton(className, text, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = text;
  button.addEventListener("click", onClick);
  return button;
}

// A heading, why, the never line, what happens next, Allow and Not now.
function permissionCard({ heading, why, next, notNow, onAllow, onNotNow }) {
  const card = document.createElement("div");
  card.className = "perm-card";
  const title = document.createElement("h1");
  title.className = "card-heading";
  title.textContent = heading;
  const buttons = document.createElement("div");
  buttons.className = "perm-buttons";
  const allow = cardButton("card-button", "Allow", onAllow);
  buttons.append(allow, cardButton("perm-cancel", notNow, onNotNow));
  card.append(title, paragraph("", why), paragraph("perm-never", NEVER), paragraph("perm-next", next), buttons);
  return { card, allow };
}

// Seeing which page you're on, asked on the first "New note for this page".
export function pageCard({ onAllow, onDecline }) {
  return permissionCard({
    heading: "Let Glacier see the page you're on",
    why: "So your notes open with the page, and “New note for this page” can use the page's title and address.",
    next: "Your browser will ask to confirm. If you decline, you can still make notes by hand.",
    notNow: "Not now, new note by hand",
    onAllow,
    onNotNow: onDecline,
  }).card;
}

// Drawing settings beside the sidebar (#21), shown when settings first open.
// Esc closes it with settings. Returns the sheet over the note, with Allow
// focused once it is in the page.
export function panelsCard({ onAnswer, onEscape }) {
  const sheet = document.createElement("aside");
  sheet.className = "panels-card";
  sheet.setAttribute("aria-label", "Where settings open");
  const { card, allow } = permissionCard({
    heading: "Open settings beside the sidebar",
    why: "Settings can open next to the sidebar, over the edge of the page you're on. Your note keeps its full width and shows each change as you make it. For that, Glacier needs to draw on the pages you visit.",
    next: "Your browser will ask to confirm, in its own words about your data on all websites. If you decline, settings open inside the sidebar. You can change this later in settings, under Panels.",
    notNow: "Not now, open it inside",
    onAllow: () => onAnswer(true),
    onNotNow: () => onAnswer(false),
  });
  sheet.append(card);
  sheet.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onEscape();
    }
  });
  return { sheet, allow };
}

// The starting panel when no note is open and the permission hasn't been
// granted yet: one handwritten line and a quiet "+ New note for this page",
// so there's always a way in (#3).
export function startPrompt({ onNew }) {
  const wrap = document.createElement("div");
  wrap.className = "start-prompt";
  wrap.appendChild(paragraph("", "No note for this page yet."));
  const create = cardButton("start-link", "+ New note for this page", onNew);
  create.title = PAGE_NOTE_HINT;
  wrap.appendChild(create);
  return wrap;
}
