import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

// Run against the user's requested, locally inspected upstream checkout/archive.
const source = path.resolve(process.argv[2] || ".local/references/ai-town");
const destination = path.resolve("public/assets/ai-town");
const files = [
  "public/assets/gentle-obj.png", "public/assets/rpg-tileset.png",
  "public/assets/magecity.png", "public/assets/32x32folk.png",
  "public/assets/spritesheets/windmill.png", "public/assets/spritesheets/campfire.png",
  "public/assets/spritesheets/gentlewaterfall32.png",
  "data/animations/windmill.json", "data/animations/campfire.json",
  "data/animations/gentlewaterfall.json", "data/animations/gentlesplash.json",
];
await mkdir(destination, { recursive: true });
const manifest = {};
for (const file of files) {
  const contents = await readFile(path.join(source, file));
  const name = path.basename(file);
  await writeFile(path.join(destination, name), contents);
  manifest[name] = { upstream: file, sha256: createHash("sha256").update(contents).digest("hex"), bytes: contents.length };
}
await copyFile(path.join(source, "LICENSE"), path.join(destination, "AI-TOWN-CODE-LICENSE.txt"));
await writeFile(path.join(destination, "manifest.json"), JSON.stringify({
  repository: "https://github.com/a16z-infra/ai-town",
  commit: "8e05997f2409275669c8344b84a51692e83f3f33",
  acquisition: "Official codeload archive; git HTTPS transport failed in this environment.",
  files: manifest,
}, null, 2) + "\n");
console.log(`Imported ${files.length} AI Town assets into ${destination}`);
