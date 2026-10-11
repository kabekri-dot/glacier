// Where settings open (#21, ADR 0008): beside the sidebar, over the edge of
// the web page, or inside the sidebar. The Shortcuts panel lives inside the
// sidebar on its right edge and is not placed here (#76). Beside needs
// the optional "all websites" permission, asked for behind Glacier's own
// explanation card the first time settings open.
//
// The Panel placement owns that whole decision (#66). panel.js tells it what
// is wanted (settings open at a section) and draws what it shows. The browser is plugged in as a port, so tests use
// a fake one (src/browser-panels.mjs is the real one):
//   browser.activeTab()          -> { id, url } of the tab behind the sidebar, or null
//   browser.hasPermission()      -> whether the "all websites" permission is granted
//   browser.requestPermission()  -> asks for it; must be called straight from a click
//   browser.drawFrames(tabId, { settings })
//                                -> draws the settings frame in that tab's page, or
//                                   with null takes it away; false when the
//                                   browser refuses. `settings` is { section }.
//   browser.onTabChange(fn)      -> calls fn when another tab shows or the page loads again
//
// `show(view)` draws one of these, where `settings` says where they are drawn
// ("beside", "inside", or null for closed):
//   { card, open, settings, section, explain }
// `card` is the explanation card, `open` whether settings or the card are
// open (for the glacier button), `explain` whether settings inside the
// sidebar show the "page doesn't allow" line (#60).
// `keepChoice(place)` keeps "beside" or "inside" for this browser.

// The permission the settings frame needs to draw Glacier's own frames on the page.
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

// Beside only with the permission, unless inside was chosen, and only on a
// page the browser lets Glacier draw on.
function wantsBeside({ choice, granted, url }) {
  return choice !== "inside" && granted && canDrawBeside(url);
}

// Settings inside the sidebar say why when the permission is granted and
// inside wasn't chosen, but this page can't be drawn on, or the browser
// `refused` when Glacier tried. A declined permission or a choice of inside
// needs no explanation.
function explainsInside({ choice, granted, url, refused }) {
  return choice !== "inside" && granted && (refused || !canDrawBeside(url));
}

export function createPanelPlacement({ browser, show, keepChoice = () => {}, choice = "ask" }) {
  let panelPlace = readPanelPlace(choice);
  let settingsWanted = false;
  let settingsSection = null;
  // The section settings open at once the card is answered, while it shows.
  let card = null;

  // The tab whose page holds the frames now, if any.
  let besideTabId = null;
  let latestPlacing = 0;
  let placed = { beside: false, explain: false };

  function report() {
    show({
      card: card !== null,
      open: card !== null || settingsWanted,
      settings: settingsWanted ? (placed.beside ? "beside" : "inside") : null,
      section: settingsSection,
      explain: placed.explain,
    });
  }

  // Put settings where they belong now: beside the sidebar in the page
  // you're on, or inside the sidebar. Run again whenever the page, settings or
  // the choice change; the latest run wins.
  async function place() {
    const run = (latestPlacing += 1);
    const tab = await browser.activeTab();
    const granted = await browser.hasPermission();
    if (run !== latestPlacing) return;

    const url = tab?.url;
    const besideWanted = wantsBeside({ choice: panelPlace, granted, url }) && settingsWanted;
    if (besideTabId !== null && (!besideWanted || besideTabId !== tab.id)) {
      browser.drawFrames(besideTabId, { settings: null });
      besideTabId = null;
    }
    let beside = false;
    if (besideWanted) {
      beside = await browser.drawFrames(tab.id, {
        settings: { section: settingsSection },
      });
      if (beside) besideTabId = tab.id;
      if (run !== latestPlacing) return;
    }

    const refused = besideWanted && !beside;
    placed = { beside, explain: !beside && explainsInside({ choice: panelPlace, granted, url, refused }) };
    report();
  }

  function choose(chosen) {
    panelPlace = readPanelPlace(chosen);
    keepChoice(panelPlace);
  }

  // The first time, Glacier's own card shows instead (ADR 0008).
  function openSettings(section) {
    if (panelPlace === "ask") {
      card = { section: section ?? null };
      report();
      return Promise.resolve();
    }
    card = null;
    settingsWanted = true;
    settingsSection = section ?? null;
    return place();
  }

  return {
    // Follows you to another tab while settings are open.
    start() {
      browser.onTabChange(() => (settingsWanted ? place() : undefined));
      return place();
    },

    choice: () => panelPlace,

    // Settings or the card, for the glacier button.
    isOpen: () => card !== null || settingsWanted,

    settingsOpen: () => settingsWanted,

    openSettings,

    // Closes the card or settings; true when settings were open.
    closeSettings() {
      if (card !== null) {
        card = null;
        report();
      }
      if (!settingsWanted) return false;
      settingsWanted = false;
      settingsSection = null;
      place();
      return true;
    },

    // Allow on the card asks the browser, so it must come straight from the
    // click. Either answer opens settings, beside or inside.
    async answerCard(allow) {
      const section = card?.section ?? null;
      const granted = allow && (await browser.requestPermission());
      card = null;
      choose(granted ? "beside" : "inside");
      return openSettings(section);
    },

    // The choice under Panels in settings. Choosing beside asks the browser
    // first, straight from the change.
    async choosePlace(wanted) {
      const granted = wanted === "beside" && (await browser.requestPermission());
      choose(granted ? "beside" : "inside");
      place();
      return panelPlace;
    },

    // A choice made beside the sidebar, or in another window.
    setChoice(saved) {
      panelPlace = readPanelPlace(saved);
      return place();
    },
  };
}
