// Glacier's version number, "major.minor.fix" like 1.1.0 (README, Making a
// release). `tools/new-version.mjs` raises it for every test version and
// release; pure, so it can be tested with node --test.
const STEPS = { fix: 2, feature: 1, big: 0 };

export function nextVersion(current, kind) {
  if (!(kind in STEPS)) throw new Error(`Say fix, feature or big, not "${kind}"`);
  if (!/^\d+\.\d+\.\d+$/.test(current)) throw new Error(`A version is three numbers like 1.1.0, not "${current}"`);
  const parts = current.split(".").map(Number);
  const at = STEPS[kind];
  return parts.map((part, i) => (i < at ? part : i === at ? part + 1 : 0)).join(".");
}
