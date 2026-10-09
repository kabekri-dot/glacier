import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

// Opening Glacier is configuration, not note logic, but a missing Chrome
// permission or a colliding shortcut silently breaks the toolbar button and
// the shortcut (issue #22), so the manifest and the background wiring are
// worth guarding.

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(
  readFileSync(fileURLToPath(new URL("manifest.json", root)), "utf8"),
);
const backgroundSource = readFileSync(
  fileURLToPath(new URL("background.js", root)),
  "utf8",
);

test("Chrome gets the sidePanel permission it needs for the side-panel API", () => {
  assert.ok(
    (manifest.permissions ?? []).includes("sidePanel"),
    "manifest must request the sidePanel permission",
  );
});

test("the default shortcut avoids Firefox's built-in Ctrl+Shift+Y", () => {
  const key = manifest.commands["open-glacier"].suggested_key.default;
  assert.notEqual(key, "Ctrl+Shift+Y");
});

// Runs background.js against a fake browser API and reports what it wired up.
function runBackground(api) {
  const context = {};
  if (api.isFirefox) context.browser = api.ext;
  else context.chrome = api.ext;
  vm.runInNewContext(backgroundSource, context);
}

function fakeExtension({ firefox }) {
  const calls = {
    setBehavior: [],
    toggles: 0,
    opens: [],
    clickListeners: [],
    commandListeners: [],
  };
  const ext = {
    commands: {
      onCommand: {
        addListener: (fn) => calls.commandListeners.push(fn),
      },
    },
    action: {
      onClicked: { addListener: (fn) => calls.clickListeners.push(fn) },
    },
  };
  if (firefox) {
    ext.sidebarAction = {
      toggle: () => {
        calls.toggles += 1;
      },
    };
  } else {
    ext.sidePanel = {
      setPanelBehavior: (opts) => {
        calls.setBehavior.push(opts);
        return Promise.resolve();
      },
      open: (opts) => {
        calls.opens.push(opts);
        return Promise.resolve();
      },
    };
  }
  return { ext, calls };
}

test("Firefox: the toolbar button toggles the sidebar", () => {
  const { ext, calls } = fakeExtension({ firefox: true });
  runBackground({ isFirefox: true, ext });

  assert.equal(calls.clickListeners.length, 1, "needs an onClicked handler");
  calls.clickListeners[0]();
  assert.equal(calls.toggles, 1);
});

test("Firefox: the shortcut toggles the sidebar", () => {
  const { ext, calls } = fakeExtension({ firefox: true });
  runBackground({ isFirefox: true, ext });

  calls.commandListeners[0]("open-glacier");
  assert.equal(calls.toggles, 1);
});

test("Chrome: clicking the toolbar opens the side panel, no stray onClicked", () => {
  const { ext, calls } = fakeExtension({ firefox: false });
  runBackground({ isFirefox: false, ext });

  assert.equal(calls.setBehavior.length, 1);
  assert.equal(calls.setBehavior[0].openPanelOnActionClick, true);
  // With openPanelOnActionClick set, Chrome never fires action.onClicked, so
  // no handler should be registered that could double-open the panel.
  assert.equal(calls.clickListeners.length, 0);
});

test("Chrome: the shortcut opens the side panel for the active window", () => {
  const { ext, calls } = fakeExtension({ firefox: false });
  runBackground({ isFirefox: false, ext });

  calls.commandListeners[0]("open-glacier", { windowId: 7 });
  assert.equal(calls.opens.length, 1);
  assert.equal(calls.opens[0].windowId, 7);
});
