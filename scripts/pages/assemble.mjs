import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
const output = new URL("dist/pages/", root);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(new URL("site/", root), output, { recursive: true });
for (const [source, destination] of [
  ["apps/sample-angular/dist/sample-angular/browser/", "angular/"],
  ["dist/sample-angular-nx/browser/", "nx/"],
  ["apps/sample-angular/storybook-static/", "angular/storybook/"],
  ["dist/storybook/sample-angular-nx/", "nx/storybook/"]
]) {
  await cp(new URL(source, root), new URL(destination, output), { recursive: true });
}
await writeFile(new URL(".nojekyll", output), "");
await writeFile(new URL("iframe.html", output), `<!doctype html>
<html lang="en"><meta charset="utf-8"><title>Storybook preview</title>
<script>location.replace("angular/storybook/iframe.html" + location.search + location.hash);</script>
<a href="angular/storybook/iframe.html">Open Storybook preview</a></html>\n`);
console.log(`Pages site assembled at ${fileURLToPath(output)}`);
