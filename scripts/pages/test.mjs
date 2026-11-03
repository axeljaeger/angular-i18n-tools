import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(new URL("../../apps/sample-angular/package.json", import.meta.url));
const { chromium } = require("playwright");
const staticDir = resolve(root, "dist/pages");
const screenshots = resolve(root, "dist/pages-check");
const basePath = process.env.PAGES_BASE_PATH ?? "/angular-i18n-tools/";
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    assert.ok(url.pathname.startsWith(basePath));
    let path = resolve(staticDir, decodeURIComponent(url.pathname.slice(basePath.length)) || ".");
    assert.ok(path === staticDir || path.startsWith(staticDir + sep));
    if ((await stat(path)).isDirectory()) {
      if (!url.pathname.endsWith("/")) {
        response.writeHead(301, { Location: url.pathname + "/" + url.search });
        response.end();
        return;
      }
      path = resolve(path, "index.html");
    }
    const data = await readFile(path);
    response.writeHead(200, { "Content-Type": types[extname(path)] ?? "application/octet-stream" });
    response.end(data);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const url = origin + basePath;
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin });
  await page.goto(url);
  await page.getByRole("heading", { name: "Tools for Angular localization." }).waitFor();
  assert.equal(await page.getByRole("link", { name: "View on GitHub" }).getAttribute("href"), "https://github.com/axeljaeger/angular-i18n-tools");
  const products = page.getByRole("region", { name: "Our products" });
  assert.deepEqual(await products.getByRole("heading", { level: 2 }).allTextContents(), [
    "Angular setup generator", "Storybook language switcher", "VS Code extension", "Catalog checks →"
  ]);
  assert.equal(await products.locator(".button").count(), 2);
  assert.ok((await products.getByRole("link", { name: "Try the demo" }).getAttribute("href")).includes("/storybook/"));
  const vscodeProduct = page.locator("#vscode-product");
  assert.equal(await vscodeProduct.getByRole("link", { name: "Install VSIX" }).getAttribute("href"), "https://github.com/axeljaeger/angular-i18n-tools/releases/download/vscode-v0.0.1/angular-i18n-tools.vsix");
  const codespaceUrl = new URL(await vscodeProduct.getByRole("link", { name: "Try in Codespaces" }).getAttribute("href"));
  assert.equal(codespaceUrl.hostname, "codespaces.new");
  const demoConfig = JSON.parse(await readFile(resolve(root, codespaceUrl.searchParams.get("devcontainer_path")), "utf8"));
  assert.ok(demoConfig.workspaceFolder.endsWith("/apps/sample-angular"), "Codespace must open one sample catalog");
  assert.ok(demoConfig.postAttachCommand.endsWith("demo/install.sh"), "Codespace must install the demo extension");
  assert.ok((await vscodeProduct.getByRole("link", { name: "Docs" }).getAttribute("href")).includes("/packages/vscode-extension/README.md"));
  const commands = {
    "setup-command": "npx @angular-i18n-tools/ng-generator@0.0.8",
    "storybook-command": "npx @angular-i18n-tools/ng-generator@0.0.8 storybook"
  };
  for (const [id, command] of Object.entries(commands)) {
    const button = page.locator(`[data-copy="${id}"]`);
    await button.click();
    await button.filter({ hasText: "Copied" }).waitFor();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), command);
  }
  const docStyles = await page.locator(".product-card .docs-link").evaluateAll(links => links.map(link => {
    const style = getComputedStyle(link);
    return [style.fontSize, style.fontWeight, style.color, style.textDecorationLine];
  }));
  assert.equal(docStyles.length, 2);
  assert.deepEqual(docStyles[0], docStyles[1], "Product documentation links must share their appearance");
  // Follow every local destination, including language-selected apps and Storybook links.
  const links = await page.locator("a[href]").evaluateAll(links => links.map(link => link.href));
  for (const href of new Set(links.filter(href => href.startsWith(origin)))) {
    const response = await page.request.get(href);
    assert.equal(response.status(), 200, href);
  }
  await mkdir(screenshots, { recursive: true });
  for (const [width, height] of [[1280, 720], [360, 800], [390, 844]]) {
    await page.setViewportSize({ width, height });
    const contentHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    assert.ok(contentHeight <= height, `Landing page is ${contentHeight}px tall at ${width}x${height}`);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.screenshot({ path: resolve(screenshots, "landing-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Mobile horizontal overflow");
  await page.screenshot({ path: resolve(screenshots, "landing-mobile.png"), fullPage: true });
  for (const demo of ["angular", "nx"]) {
    for (const [locale, heading] of [["en-US", "Settings"], ["de", "Einstellungen"], ["fr", "Parametres"]]) {
      await page.goto(`${url}${demo}/?locale=${locale}`);
      await page.getByRole("heading", { name: heading, exact: true }).waitFor();
      assert.equal(await page.locator("html").getAttribute("lang"), locale);
    }
  }
  await page.goto(`${url}?path=/story/sample-settings-dialog--default&globals=locale:de#preview`);
  await page.waitForURL(`${url}angular/storybook/?path=/story/sample-settings-dialog--default&globals=locale:de#preview`);
  await page.frameLocator("#storybook-preview-iframe").getByRole("heading", { name: "Einstellungen", exact: true }).waitFor();
  await page.goto(`${url}iframe.html?id=sample-settings-dialog--default&viewMode=story&globals=locale:fr`);
  await page.getByRole("heading", { name: "Parametres", exact: true }).waitFor();
  assert.ok(page.url().startsWith(`${url}angular/storybook/iframe.html?`));
  assert.deepEqual(errors, [], "Missing staged assets or browser errors");
  console.log("Pages passed: landing links, mobile layout, both apps in three locales, and legacy Storybook redirects.");
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
for (const [app, destination] of [["sample-angular", "angular"], ["sample-angular-nx", "nx"]]) {
  const result = await promisify(execFile)(process.execPath, [resolve(root, `apps/${app}/scripts/test-storybook-static.mjs`)], {
    cwd: root,
    env: { ...process.env, STORYBOOK_STATIC_DIR: resolve(staticDir, destination, "storybook"), STORYBOOK_BASE_PATH: `${basePath}${destination}/storybook/` }
  });
  process.stdout.write(`${destination}: ${result.stdout}`);
}
