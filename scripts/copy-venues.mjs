// Copy the single-source venue config into the functions bundle. A deployed Cloud Function
// can only read files inside its own directory (same reason the fonts are copied in), so
// functions/venues.json is a generated copy of the canonical src/data/venues.json.
//
// Used by: the firebase.json functions `predeploy` hook (node scripts/copy-venues.mjs) and
// functions/prep.mjs. Paths are resolved from THIS file's location, so it's cwd-independent.
import { copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function copyVenues() {
  const src = join(ROOT, "src", "data", "venues.json");
  const dest = join(ROOT, "functions", "venues.json");
  copyFileSync(src, dest);
  console.log("copied src/data/venues.json -> functions/venues.json");
}

// Run when invoked directly (predeploy / CLI); do nothing when imported (prep.mjs).
if (process.argv[1] === fileURLToPath(import.meta.url)) copyVenues();
