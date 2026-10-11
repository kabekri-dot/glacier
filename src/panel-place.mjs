// Where settings and the Shortcuts panel open (#21, ADR 0008): beside the
// sidebar, over the edge of the web page, or inside the sidebar. Beside needs
// the optional "all websites" permission, asked for behind Glacier's own
// explanation card the first time a panel opens. Pure, so it can be tested
// with node --test; the panel keeps the choice per browser, next to the look.

// The permission the panels need to draw Glacier's own frames on the page.
// The scripting permission itself is required, as it shows no warning and
// does nothing without this one.
export const BESIDE_PERMISSION = { origins: ["<all_urls>"] };

// "ask" until the card has been answered, then "beside" or "inside".
export function readPanelPlace(saved) {
  return ["beside", "inside"].includes(saved) ? saved : "ask";
}

// Pages no extension may draw on: browser pages, PDFs and the extension stores.
const STORE_PAGES = [/^https:\/\/chromewebstore\.google\.com\//i, /^https:\/\/chrome\.google\.com\/webstore/i, /^https:\/\/addons\.mozilla\.org\//i];

function canDrawBeside(url) {
  if (!url || !/^https?:/i.test(url)) return false;
  if (/\.pdf$/i.test(url.replace(/[?#].*$/, ""))) return false;
  return !STORE_PAGES.some((page) => page.test(url));
}

// "card" shows the explanation card, then the panels open "beside" or "inside".
// `granted` is whether the browser holds the permission now, `url` the page
// behind the sidebar (undefined when it can't be read).
export function decidePanelPlace({ choice, granted, url }) {
  if (choice === "ask" && !granted) return "card";
  if (choice === "inside" || !granted) return "inside";
  return canDrawBeside(url) ? "beside" : "inside";
}

// Whether a panel that opens inside the sidebar says why (#60): the permission
// is granted and inside wasn't chosen, but this page can't be drawn on, or the
// browser `refused` when Glacier tried. A declined permission or a choice of
// inside needs no explanation.
export function explainsInside({ choice, granted, url, refused = false }) {
  return choice !== "inside" && granted && (refused || !canDrawBeside(url));
}
