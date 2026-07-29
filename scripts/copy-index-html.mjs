// Copy the built app shell into the functions bundle so the /v/ share function serves the
// EXACT index.html shipped in the same deploy (fingerprinted bundle ref included). A deployed
// Cloud Function can't read ../dist at runtime, so functions/index.html is a generated copy —
// the same pattern as functions/venues.json.
//
// GUARD: fail the deploy if dist/index.html is missing, or OLDER than the newest file in src/.
// Without this, `firebase deploy --only functions` after a src edit (no rebuild) would ship an
// index.html pointing at a bundle the current build has replaced — silently reintroducing the
// /v/ blank-page bug. Paths resolve from THIS file's location, so it's cwd-independent.
import { copyFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function newestMtimeMs(dir) {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) newest = Math.max(newest, newestMtimeMs(full));
    else if (entry.isFile()) newest = Math.max(newest, statSync(full).mtimeMs);
  }
  return newest;
}

export function copyIndexHtml() {
  const src = join(ROOT, "dist", "index.html");
  const dest = join(ROOT, "functions", "index.html");

  if (!existsSync(src)) {
    console.error(
      "\n✖ dist/index.html is missing — the share function would ship a stale shell.\n" +
      "  Run `npm run build` before deploying.\n",
    );
    process.exit(1);
  }

  const builtAt = statSync(src).mtimeMs;
  const srcNewest = newestMtimeMs(join(ROOT, "src"));
  if (builtAt < srcNewest) {
    console.error(
      "\n✖ dist/index.html is OLDER than your latest src/ change.\n" +
      "  The share page would ship a stale bundle reference (the /v/ blank-page bug).\n" +
      "  Run `npm run build` before deploying.\n",
    );
    process.exit(1);
  }

  copyFileSync(src, dest);
  console.log("copied dist/index.html -> functions/index.html");
}

// Run when invoked directly (predeploy / CLI); do nothing when imported.
if (process.argv[1] === fileURLToPath(import.meta.url)) copyIndexHtml();
