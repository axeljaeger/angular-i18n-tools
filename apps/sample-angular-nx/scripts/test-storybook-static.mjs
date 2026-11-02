import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const staticDir = process.env.STORYBOOK_STATIC_DIR ? resolve(process.env.STORYBOOK_STATIC_DIR) : fileURLToPath(new URL("../../../dist/storybook/sample-angular-nx/", import.meta.url));
const screenshotDir = fileURLToPath(new URL("../storybook-demo/", import.meta.url));
// Serve under a project path, as GitHub Pages does, without an SPA fallback.
const basePath = process.env.STORYBOOK_BASE_PATH ?? "/angular-i18n-tools/nx/storybook/";
const contentTypes = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2"
};
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    assert.ok(pathname.startsWith(basePath));
    const filePath = resolve(staticDir, pathname.slice(basePath.length) || "index.html");
    assert.ok(filePath.startsWith(resolve(staticDir) + sep));
    const content = await readFile(filePath);
    response.writeHead(200, { "Content-Type": contentTypes[extname(filePath)] ?? "application/octet-stream" });
    response.end(content);
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
const errors = [];
const consoleErrors = [];
try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    // Storybook can log channel diagnostics while a locale reload replaces the iframe.
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}${basePath}`;
  await mkdir(screenshotDir, { recursive: true });

  await page.goto(`${baseUrl}?path=/story/sample-settings-dialog--default`);
  await expectStory("Settings", "en");
  await selectLocale("Deutsch");
  await expectStory("Einstellungen", "de");
  await page.screenshot({ path: resolve(screenshotDir, "static-settings-german.png"), fullPage: true });
  await selectLocale("Français");
  await expectStory("Parametres", "fr");
  await selectLocale("English");
  await expectStory("Settings", "en");

  await page.goto(`${baseUrl}?path=/story/sample-settings-dialog--default&globals=locale:de`);
  await expectStory("Einstellungen", "de");
  await page.goto(`${baseUrl}?path=/story/sample-user-profile--default&globals=locale:fr`);
  await expectStory("Profil utilisateur", "fr");
  await page.screenshot({ path: resolve(screenshotDir, "static-profile-french.png"), fullPage: true });
  await selectLocale("English");
  await expectStory("User profile", "en");
  assert.deepEqual(errors, [], "Browser errors or missing static assets");
  console.log("Static Storybook passed: both stories, locale switching, URL globals, and project-path assets.");

  async function expectStory(heading, locale) {
    const frame = page.frameLocator("#storybook-preview-iframe");
    await frame.getByText("Angular application in NX workspace", { exact: true }).waitFor();
    try {
      await frame.getByRole("heading", { name: heading, exact: true }).waitFor({ timeout: 15000 });
      assert.equal(await frame.locator("html").getAttribute("lang"), locale);
      assert.equal(await frame.locator("html").evaluate(() => typeof window.Zone), "undefined", "Zone.js must not be loaded");
    } catch (error) {
      const body = await frame.locator("body").innerText().catch(() => "Preview unavailable");
      throw new Error(`${error.message}\n${body}\n${[...errors, ...consoleErrors].join("\n")}`, { cause: error });
    }
  }

  async function selectLocale(label) {
    await page.getByRole("button", { name: /Locale used when the Storybook preview is loaded/ }).click();
    await page.getByRole("option", { name: label, exact: true }).click();
  }
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
