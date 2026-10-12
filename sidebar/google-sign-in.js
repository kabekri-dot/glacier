// Signing in with Google for the Google Drive Notes Home (#95, ADR 0011).
// The sidebar hands `getToken` to the Drive remote (src/drive-remote.mjs).
//
// Chrome, once its client ID is in the manifest's `oauth2`, signs in with
// its own `identity.getAuthToken`, which keeps the token fresh by itself.
// Edge and Firefox (and Chrome before that) open Google's sign-in window with
// `identity.launchWebAuthFlow` and get a token for about an hour; after that
// it is renewed without a window (`prompt=none`) while the person is still
// signed in to Google. Only when that fails does the sync box ask to sign in
// again. The token is kept in this browser's extension storage, so the
// sign-in survives a restart, and never goes into notes or files (ADR 0003).
//
// Every failure throws an Error with reason "unauthorized".
import { GOOGLE_CONFIG, DRIVE_SCOPE } from "../src/google-config.mjs";
import { googleReady } from "../src/notes-home.mjs";

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const REVOKE = "https://oauth2.googleapis.com/revoke";
// A token this close to its end is renewed before it is used.
const MARGIN = 5 * 60 * 1000;

function signInFailure(message, cause) {
  return Object.assign(new Error(message, { cause }), { reason: "unauthorized" });
}

export function createGoogleSignIn({ api, storage, fetch = globalThis.fetch }) {
  const chromeSignIn = Boolean(api.runtime.getManifest().oauth2?.client_id) && typeof api.identity?.getAuthToken === "function";
  let chromeToken = null;

  // Google refuses Firefox's own redirect address, so Firefox uses the
  // loopback address it also accepts (MDN, identity.launchWebAuthFlow).
  function redirectUrl() {
    const url = api.identity.getRedirectURL();
    const host = new URL(url).hostname;
    if (host.endsWith(".extensions.allizom.org")) return `http://127.0.0.1/mozoauth2/${host.split(".")[0]}`;
    return url;
  }

  async function fromChrome(interactive, renew) {
    if (renew && chromeToken) await api.identity.removeCachedAuthToken({ token: chromeToken });
    try {
      const answer = await api.identity.getAuthToken({ interactive, scopes: [DRIVE_SCOPE] });
      chromeToken = typeof answer === "string" ? answer : answer?.token;
    } catch (error) {
      throw signInFailure("Chrome didn't sign in to Google", error);
    }
    if (!chromeToken) throw signInFailure("Chrome gave no Google token");
    return chromeToken;
  }

  async function fromSignInWindow(interactive) {
    const params = new URLSearchParams({
      client_id: GOOGLE_CONFIG.webClientId,
      response_type: "token",
      redirect_uri: redirectUrl(),
      scope: DRIVE_SCOPE,
      ...(!interactive && { prompt: "none" }),
    });
    let answer;
    try {
      answer = await api.identity.launchWebAuthFlow({ url: `${AUTH}?${params}`, interactive });
    } catch (error) {
      throw signInFailure("Google's sign-in window didn't sign in", error);
    }
    const fields = new URLSearchParams(new URL(answer).hash.slice(1));
    const token = fields.get("access_token");
    if (!token) throw signInFailure(`Google answered ${fields.get("error") ?? "without a token"}`);
    const expires = Date.now() + Number(fields.get("expires_in") ?? 3600) * 1000;
    await storage.set({ googleToken: { token, expires } });
    return token;
  }

  async function getToken({ renew = false, interactive = false } = {}) {
    if (chromeSignIn) return fromChrome(interactive, renew);
    if (!renew && !interactive) {
      const { googleToken } = await storage.get("googleToken");
      if (googleToken && googleToken.expires - MARGIN > Date.now()) return googleToken.token;
    }
    try {
      return await fromSignInWindow(false);
    } catch (error) {
      if (!interactive) throw error;
      return fromSignInWindow(true);
    }
  }

  return {
    // Whether Glacier's sign-in is registered yet (src/google-config.mjs).
    ready: googleReady(GOOGLE_CONFIG),

    // A token for Drive, quietly. `renew` asks for a new one because Drive
    // refused the last; `interactive` may show Google's sign-in.
    getToken,

    // Sign in, showing Google's sign-in if it is needed.
    signIn: () => getToken({ interactive: true }),

    // Leaving Google Drive signs out: the token is forgotten here and
    // given back to Google. The files in Drive stay as they are.
    async signOut() {
      if (chromeSignIn && !chromeToken) await fromChrome(false, false).catch(() => null);
      const { googleToken } = await storage.get("googleToken");
      const token = chromeToken ?? googleToken?.token;
      await storage.remove("googleToken");
      if (chromeSignIn && chromeToken) await api.identity.removeCachedAuthToken({ token: chromeToken });
      chromeToken = null;
      if (!token) return;
      await fetch(`${REVOKE}?token=${encodeURIComponent(token)}`, { method: "POST" }).catch((error) => {
        console.warn("Glacier: could not give the Google token back", error);
      });
    },
  };
}
