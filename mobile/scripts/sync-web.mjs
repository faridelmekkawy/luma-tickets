import { cp, rm, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const rootDir = resolve(import.meta.dirname, "..", "..");
const webDir = resolve(import.meta.dirname, "..", "www");
const sources = ["usher", "assets", "index.html"]; // include root index if needed

await rm(webDir, { recursive: true, force: true });
await mkdir(webDir, { recursive: true });

for (const entry of sources) {
  const src = resolve(rootDir, entry);
  const dest = resolve(webDir, entry);
  await cp(src, dest, { recursive: true });
}

console.log("Synced web assets to", webDir);
