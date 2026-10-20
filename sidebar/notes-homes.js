// Where your notes live (#14, #94, #95, #97): the places a Notebook can sync
// with, each in one entry below: how it connects, what it needs before a
// switch to it (signing in, the folder picked), what it keeps once the switch
// worked, and what leaving it does. A new place is one more entry. Which
// place is chosen is kept in this browser's Notebook; GitHub's repo name and
// token only in this browser's extension storage, never in the Notebook or
// the Notes Repo (ADR 0003). What the places are called and their error
// sentences are src/notes-home.mjs.
//
//   createNotesHomes({ notebook, extensionStorage, googleSignIn, folderAccess })
//   .load()      resolves to { home, repo, token }: the place chosen
//   .connect()   resolves to { remote, repo, home } for auto-sync, or null
//                while the notes live only in this browser
//   .switchTo(home, { repo, token, onProgress })
//                combine the notes with that place and make it the one in
//                use; resolves to the Notebook's result. Throws as the
//                place's remote does; nothing is kept then.
import { chosenNotesHome } from "../src/notes-home.mjs";
import { githubRemote } from "../src/github-remote.mjs";
import { driveRemote } from "../src/drive-remote.mjs";
import { folderRemote } from "../src/folder-remote.mjs";

export function createNotesHomes({ notebook, extensionStorage, googleSignIn, folderAccess }) {
  const PLACES = {
    github: {
      ready: ({ repo, token }) => Boolean(repo && token),
      remote: ({ repo, token }) => githubRemote({ repo, token }),
      // The repo and token are saved only once GitHub has accepted them.
      keep: ({ repo, token }) => extensionStorage.set({ notesRepo: repo, githubToken: token }),
    },
    // Switching to Google Drive signs in first, and leaving it signs out,
    // leaving the files in Drive as they are (#95).
    "google-drive": {
      remote: () => driveRemote({ getToken: googleSignIn.getToken }),
      before: () => googleSignIn.signIn(),
      leave: () => googleSignIn.signOut(),
    },
    // A folder is picked before the switch (from the click, in Settings),
    // and kept once it worked; leaving it forgets it here (#97).
    folder: {
      remote: () => folderRemote({ getFolder: folderAccess.folder }),
      switchRemote: () => folderRemote({ getFolder: folderAccess.pickedFolder }),
      keep: () => folderAccess.keepPicked(),
      leave: () => folderAccess.forget(),
    },
    browser: {},
  };

  async function load() {
    const { notesRepo, githubToken } = await extensionStorage.get(["notesRepo", "githubToken"]);
    const github = { repo: notesRepo ?? "", token: githubToken ?? "" };
    return { home: chosenNotesHome(notebook.notesHome(), github), ...github };
  }

  async function connect() {
    const { home, repo, token } = await load();
    const place = PLACES[home];
    if (!place?.remote || (place.ready && !place.ready({ repo, token }))) return null;
    return { remote: place.remote({ repo, token }), repo: home === "github" ? repo : "", home };
  }

  // The files stay where they are; only this browser lets go of the place.
  async function leave(home) {
    try {
      await PLACES[home]?.leave?.();
    } catch (error) {
      console.warn(`Glacier: could not leave ${home}`, error);
    }
  }

  async function switchTo(home, { repo = "", token = "", onProgress } = {}) {
    const leaving = (await load()).home;
    const place = PLACES[home];
    let result = { notes: 0 };
    if (home === "browser") await notebook.switchNotesHome("browser");
    else {
      await place.before?.();
      const remote = (place.switchRemote ?? place.remote)({ repo, token });
      result = await notebook.switchNotesHome(home, remote, onProgress);
      await place.keep?.({ repo, token });
    }
    if (leaving !== home) await leave(leaving);
    return result;
  }

  return { load, connect, switchTo };
}
