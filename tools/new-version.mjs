// Make a new test version or release of Glacier in one step:
//
//   node tools/new-version.mjs fix       small fixes      1.1.0 -> 1.1.1
//   node tools/new-version.mjs feature   new features     1.1.0 -> 1.2.0
//   node tools/new-version.mjs big       a big new one    1.1.0 -> 2.0.0
//
// It raises the version in manifest.json, commits that change, and builds
// the zip from the committed extension files only (no tests, docs or robot
// files) into the "Glacier for testing" folder next to the project, as
// Glacier-<version>.zip. Push and tag yourself when it is a release.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { nextVersion } from "../src/version.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

const kind = process.argv[2];
if (git("status", "--porcelain")) {
  console.error("Commit or put away your changes first, so the zip holds exactly what is committed.");
  process.exit(1);
}

const manifestPath = join(root, "manifest.json");
const text = readFileSync(manifestPath, "utf8");
const current = JSON.parse(text).version;
let next;
try {
  next = nextVersion(current, kind);
} catch (error) {
  console.error(`${error.message}. Use: node tools/new-version.mjs fix | feature | big`);
  process.exit(1);
}
writeFileSync(manifestPath, text.replace(`"version": "${current}"`, `"version": "${next}"`));
git("commit", "-q", "-am", `Version ${next}`);

const out = join(root, "..", "Glacier for testing");
mkdirSync(out, { recursive: true });
const zip = join(out, `Glacier-${next}.zip`);
git("archive", "--format=zip", "-o", zip, "HEAD", "manifest.json", "background.js", "sidebar", "src", "art", "fonts", "icons");
console.log(`Glacier ${current} -> ${next}\nZip: ${zip}`);
