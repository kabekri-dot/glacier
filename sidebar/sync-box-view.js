// The sync dot in the pill and the small box under it (#70, #75). The dot
// shows the state by its colour; hovering it says what the state means. A
// click opens the box: the status in words, when it last synced, Sync now
// and a line for notes with several versions. What it says comes from
// syncBox and syncResultText (src/auto-sync.mjs); this draws it, keeps "last
// synced" fresh while open and shows the Sync now result in the button for a
// few seconds. Esc or a click anywhere else closes it.
//
// The sidebar (panel.js) plugs in the dot and the box, auto-sync and these:
//   openSettings(section), showConflicts() (opens the ▾ menu at the top),
//   signInAgain() (signs in with Google and syncs, #95), reconnectFolder()
//   (asks Chrome again for the notes folder and syncs, #97) and
//   beforeOpen(), which closes whatever else is open.
// The pixel cloud reminder (#98) opens the box with showReminder(text, keep).
import { syncDotText, syncStatusText, syncBox, syncResultText, needsFolderOk, JUST_SYNCED } from "../src/auto-sync.mjs";
import { KEEP_THEM_SAFE, NOT_NOW } from "../src/cloud-reminder.mjs";
import { justSyncedLine, menuButton } from "./settings-view.js";

export function createSyncBoxView({ dotEl, boxEl, autoSync, signInAgain, reconnectFolder, openSettings, showConflicts, beforeOpen }) {
  let boxTimer = null;
  let resultShown = null;
  let justSynced = false;
  let justSyncedWritten = false;
  let resultTimer = null;
  let syncing = false;
  let reminder = null;

  function isOpen() {
    return !boxEl.hidden;
  }

  function close() {
    reminder = null;
    boxEl.hidden = true;
    boxEl.replaceChildren();
    dotEl.setAttribute("aria-expanded", "false");
    clearInterval(boxTimer);
    boxTimer = null;
  }

  function goToSettings() {
    close();
    openSettings("notes-home");
  }

  async function syncNow(run = () => autoSync.syncNow()) {
    if (syncing) return;
    syncing = true;
    drawBox();
    const result = await run();
    syncing = false;
    resultShown = syncResultText(result);
    justSynced = resultShown === JUST_SYNCED;
    justSyncedWritten = false;
    clearTimeout(resultTimer);
    resultTimer = setTimeout(() => {
      resultShown = null;
      justSynced = false;
      if (isOpen()) drawBox();
    }, 4000);
    if (isOpen()) drawBox();
  }

  // The reminder (#98): a small pixel cloud, one sentence, two buttons.
  function drawReminder() {
    const cloud = Object.assign(document.createElement("img"), { className: "sync-box-cloud", src: "../art/icon-cloud.svg", alt: "" });
    const text = document.createElement("p");
    text.className = "sync-box-status";
    text.textContent = reminder.text;
    const keep = menuButton(KEEP_THEM_SAFE, "Choose where your notes live", () => {
      close();
      openSettings("notes-home");
    });
    const notNow = menuButton(NOT_NOW, "Ask me again later", close);
    const message = Object.assign(document.createElement("div"), { className: "sync-box-reminder" });
    message.append(cloud, text);
    const buttons = Object.assign(document.createElement("div"), { className: "sync-box-choices" });
    buttons.append(keep, notNow);
    boxEl.replaceChildren(message, buttons);
  }

  function drawBox() {
    boxEl.classList.toggle("is-reminder", Boolean(reminder));
    if (reminder) return drawReminder();
    const status = autoSync.status();
    const box = syncBox(status);
    const lines = [];
    const addLine = (className, text) => {
      const line = document.createElement("p");
      line.className = className;
      line.textContent = text;
      lines.push(line);
    };
    if (justSynced) lines.push(justSyncedLine(justSyncedWritten, "sync-box-status"));
    else addLine("sync-box-status", box.status);
    if (box.last) addLine("sync-box-last", box.last);

    const hint =
      status.state === "off" ? "Choose where your notes live"
      : box.signIn ? "Sign in with Google again, then sync"
      : box.reconnect ? "Let Glacier write to your notes folder again, then sync"
      : "Pull and push your notes right away";
    const press = () => {
      if (status.state === "off") return goToSettings();
      if (box.signIn) return syncNow(signInAgain);
      if (box.reconnect) return syncNow(reconnectFolder);
      return syncNow();
    };
    const button = menuButton(
      syncing ? "Syncing…" : (justSynced ? box.action : (resultShown ?? box.action)),
      hint,
      press,
    );
    justSyncedWritten = justSynced;
    const parts = [...lines, button];
    if (box.conflicts) {
      parts.push(menuButton(box.conflicts, "See each note next to its second version", () => {
        close();
        showConflicts();
      }));
    }
    if (status.state !== "off") {
      const settings = document.createElement("button");
      settings.type = "button";
      settings.className = "sync-box-link";
      settings.textContent = "Where your notes live";
      settings.title = "Change where your notes live";
      settings.addEventListener("click", goToSettings);
      parts.push(settings);
    }
    boxEl.replaceChildren(...parts);
  }

  // `withReminder` is set only after the other popups closed, since closing
  // this box (one of them) forgets the reminder.
  function open(withReminder = null) {
    beforeOpen();
    reminder = withReminder;
    drawBox();
    boxEl.hidden = false;
    dotEl.setAttribute("aria-expanded", "true");
    boxTimer = setInterval(drawBox, 15000);
  }

  dotEl.addEventListener("click", () => {
    if (isOpen()) close();
    else open();
  });
  document.addEventListener("click", (event) => {
    // A button the box redrew is no longer in the page; that click was inside the box.
    if (isOpen() && event.target.isConnected && !event.target.closest(".sync-box, .sync-dot")) close();
  });
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || !isOpen()) return;
      event.preventDefault();
      event.stopPropagation();
      close();
    },
    true,
  );

  return {
    close,

    // Open the box by itself with the reminder, unless it is already open.
    showReminder(text) {
      if (isOpen()) return false;
      open({ text });
      return true;
    },

    // Draw the dot for a sync status, and the box again while it is open.
    drawStatus(status) {
      if (isOpen()) drawBox();
      const { label } = syncStatusText(status);
      dotEl.dataset.state = status.state;
      // A small pixel folder while Chrome needs its OK for the folder (#97), a
      // tiny pixel cloud while no place is chosen (#98).
      if (needsFolderOk(status)) dotEl.dataset.needs = "folder";
      else if (status.state === "off") dotEl.dataset.needs = "cloud";
      else delete dotEl.dataset.needs;
      dotEl.title = syncDotText(status);
      dotEl.setAttribute("aria-label", label);
    },
  };
}
