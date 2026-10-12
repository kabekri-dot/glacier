// Glacier's sign-in with Google (#95), filled in by the Google registration
// ticket. Until `webClientId` is set, the Google Drive choice in Settings
// shows "Not set up yet".
//
//   webClientId     The "Web application" OAuth client, used by Edge and
//                   Firefox (and by Chrome when chromeClientId is empty)
//                   through the browser's sign-in window. Its allowed
//                   redirects are https://<extension id>.chromiumapp.org/
//                   and Firefox's http://127.0.0.1/mozoauth2/<id>.
//   chromeClientId  The "Chrome extension" OAuth client, used by Chrome's
//                   own sign-in. Chrome reads it from manifest.json, so it
//                   goes into the manifest's `oauth2.client_id` too (a test
//                   checks the two match).
//
// Client IDs are not secrets. The only scope is drive.file: Glacier sees
// only the files it made.
export const GOOGLE_CONFIG = {
  webClientId: "",
  chromeClientId: "",
};

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
