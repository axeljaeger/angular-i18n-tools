import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(
  new URL("../../apps/sample-angular/package.json", import.meta.url),
);
const { chromium } = require("playwright");
const staticDir = resolve(root, "dist/pages");
const screenshots = resolve(root, "dist/pages-check");
const basePath = process.env.PAGES_BASE_PATH ?? "/angular-i18n-tools/";
const types = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    assert.ok(url.pathname.startsWith(basePath));
    let path = resolve(
      staticDir,
      decodeURIComponent(url.pathname.slice(basePath.length)) || ".",
    );
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
    response.writeHead(200, {
      "Content-Type": types[extname(path)] ?? "application/octet-stream",
    });
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
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400)
      errors.push(`${response.status()} ${response.url()}`);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const url = origin + basePath;
  await page
    .context()
    .grantPermissions(["clipboard-read", "clipboard-write"], { origin });
  await page.goto(url);
  await page
    .getByRole("heading", { name: "Make Angular feel at home. Everywhere." })
    .waitFor();
  assert.equal(
    await page.getByRole("link", { name: "GitHub" }).getAttribute("href"),
    "https://github.com/axeljaeger/angular-i18n-tools",
  );
  const products = page.getByRole("region", { name: "Our four products" });
  const titles = [
    "Angular setup generator",
    "VS Code extension",
    "Storybook language switcher",
    "Catalog checks",
  ];
  assert.deepEqual(
    await products.getByRole("heading", { level: 2 }).allTextContents(),
    titles,
  );
  const cards = products.locator(".product");
  const dots = page.locator(".page-dot");
  assert.equal(await cards.count(), 4);
  assert.equal(await dots.count(), 4);
  for (const card of await cards.all()) {
    assert.equal(await card.locator(".actions > *").count(), 2);
    assert.equal(await card.locator(".card-heading .docs-link").count(), 1);
    assert.equal(await card.locator(".actions .demo-link").count(), 1);
    assert.equal(await card.locator(".actions .install-link").count(), 1);
  }
  assert.equal(
    await page.locator("#preview-setup .demo-link").getAttribute("href"),
    "angular/?locale=de",
  );
  assert.equal(
    await page.locator("#preview-storybook .demo-link").getAttribute("href"),
    "angular/storybook/?path=/story/sample-settings-dialog--default",
  );
  const codespaceUrl = new URL(
    await page.locator("#preview-vscode .demo-link").getAttribute("href"),
  );
  assert.equal(codespaceUrl.hostname, "codespaces.new");
  const demoConfig = JSON.parse(
    await readFile(
      resolve(root, codespaceUrl.searchParams.get("devcontainer_path")),
      "utf8",
    ),
  );
  assert.ok(demoConfig.workspaceFolder.endsWith("/apps/sample-angular"));
  assert.ok(demoConfig.postAttachCommand.endsWith("demo/install.sh"));
  assert.equal(
    await page.locator("#preview-catalog .demo-link").getAttribute("href"),
    "https://github.com/axeljaeger/angular-i18n-tools/pull/33",
  );
  assert.ok(
    (
      await page.locator("#preview-catalog .install-link").getAttribute("href")
    ).endsWith("/.github/workflows/catalog-checks.yml"),
  );

  async function goToCard(index) {
    await dots.nth(index).click();
    await page.waitForFunction((index) => {
      const rail = document.querySelector(".rail");
      const card = rail
        .querySelectorAll(".product")
        [index].getBoundingClientRect();
      const center = rail.getBoundingClientRect().left + rail.clientWidth / 2;
      return (
        Math.abs(card.left + card.width / 2 - center) < 1 &&
        !rail.style.scrollSnapType
      );
    }, index);
    assert.equal(await dots.nth(index).getAttribute("aria-current"), "true");
  }

  await mkdir(screenshots, { recursive: true });
  for (const [width, height] of [
    [1280, 900],
    [390, 844],
    [320, 800],
  ]) {
    await page.setViewportSize({ width, height });
    for (let index = 0; index < 4; index++) await goToCard(index);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Horizontal overflow at ${width}px`,
    );
    const buttonTops = await page
      .locator(".demo-link")
      .evaluateAll((buttons) =>
        buttons.map((button) => button.getBoundingClientRect().top),
      );
    assert.ok(
      buttonTops.every((top) => Math.abs(top - buttonTops[0]) < 1),
      "Subgrid must align primary actions",
    );
    const codeFits = await page
      .locator(".example-file")
      .evaluateAll((files) =>
        files.every((file) => file.scrollWidth <= file.clientWidth),
      );
    assert.ok(codeFits, "Code examples must wrap at mobile widths");
    if (width < 600) {
      await goToCard(1);
      assert.ok(
        await cards
          .nth(1)
          .evaluate(
            (card) => card.getBoundingClientRect().width < innerWidth * 0.9,
          ),
        "Mobile must show neighboring edges",
      );
    }
    // Open via keyboard. Native popovers must dismiss and return focus on Escape.
    await goToCard(1);
    const install = page.locator("#extension-install-button");
    const popup = page.locator("#extension-install-options");
    await install.focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      () =>
        document
          .querySelector("#extension-install-options")
          .matches(":popover-open") &&
        document
          .querySelector("#extension-install-button")
          .getAttribute("aria-expanded") === "true",
    );
    assert.equal(await popup.locator("button:disabled").count(), 2);
    assert.equal(
      await popup
        .locator('a[href^="cursor:"], a[href*="open-vsx.org"]')
        .count(),
      0,
    );
    assert.equal(
      await popup
        .getByRole("link", { name: "Add to VS Code", exact: true })
        .getAttribute("href"),
      "vscode:extension/axeljaeger.angular-i18n-tools-vscode",
    );
    assert.equal(
      await popup
        .getByRole("link", { name: "View in VS Code Marketplace" })
        .getAttribute("href"),
      "https://marketplace.visualstudio.com/items?itemName=axeljaeger.angular-i18n-tools-vscode",
    );
    assert.ok(
      await popup.evaluate((el) => el.scrollWidth <= el.clientWidth),
      "Install popup must not overflow horizontally",
    );
    assert.ok(
      await popup.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return (
          r.left >= 0 &&
          r.right <= innerWidth &&
          r.top >= 0 &&
          r.bottom <= innerHeight
        );
      }),
    );
    await page.keyboard.press("Escape");
    await popup.waitFor({ state: "hidden" });
    await install.click();
    await popup.waitFor({ state: "visible" });
    await page.mouse.click(2, 2);
    await popup.waitFor({ state: "hidden" });
    await goToCard(0);
    await page.screenshot({
      path: resolve(screenshots, `landing-${width}.png`),
      fullPage: true,
    });
  }

  // Updating the marker must not wait for scrollend or native snap events.
  await page.evaluate(() => {
    const rail = document.querySelector(".rail");
    rail.style.scrollSnapType = "none";
    rail.scrollLeft +=
      document.querySelectorAll(".product")[1].getBoundingClientRect().left -
      document.querySelector(".product").getBoundingClientRect().left;
  });
  await page.waitForFunction(() =>
    document.querySelectorAll(".page-dot")[1].hasAttribute("data-active"),
  );
  await page.evaluate(() =>
    document.querySelector(".rail").style.removeProperty("scroll-snap-type"),
  );

  for (const [index, command] of [
    [0, "npx @angular-i18n-tools/ng-generator@0.0.8"],
    [2, "npx @angular-i18n-tools/ng-generator@0.0.8 storybook"],
  ]) {
    await goToCard(index);
    const button = cards.nth(index).locator(".copy-command");
    assert.equal(await button.getAttribute("data-command"), command);
    await button.focus();
    await page.keyboard.press("Space");
    await button.filter({ hasText: "Copied!" }).waitFor();
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      command,
    );
    assert.equal(await button.locator(".command-peek").textContent(), command);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await goToCard(0);
  await cards.first().locator(".media").hover();
  assert.equal(
    await cards
      .first()
      .locator(".visual")
      .evaluate((el) => getComputedStyle(el).animationName),
    "none",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.mouse.move(0, 0);
  await cards.first().locator(".media").hover();
  assert.equal(
    await cards
      .first()
      .locator(".visual")
      .evaluate((el) => getComputedStyle(el).animationName),
    "i18n-demo",
  );
  assert.equal(
    await page.locator('button:has-text("Preview motion")').count(),
    0,
  );

  const masks = await page
    .locator(".icon")
    .evaluateAll((icons) => [
      ...new Set(icons.map((icon) => getComputedStyle(icon).maskImage)),
    ]);
  assert.ok(
    masks.length >= 5 && masks.every((mask) => mask.startsWith('url("')),
    "Icons must use local assets without the canvas runtime",
  );
  for (const mask of masks) {
    const assetUrl = mask.slice(5, -2);
    assert.ok(assetUrl.startsWith(origin));
    assert.equal((await page.request.get(assetUrl)).status(), 200);
  }
  const jsonExample = JSON.parse(
    await page.locator(".example-file").nth(1).locator("code").textContent(),
  );
  assert.equal(
    jsonExample.translations["settingsDialog.applyButton"],
    "Anwenden",
  );
  assert.equal(await page.locator(".angular-resources a").count(), 3);
  const links = await page
    .locator("a[href]")
    .evaluateAll((links) => links.map((link) => link.href));
  for (const href of new Set(links.filter((href) => href.startsWith(origin)))) {
    assert.equal((await page.request.get(href)).status(), 200, href);
  }
  for (const demo of ["angular", "nx"]) {
    for (const [locale, heading] of [
      ["en-US", "Settings"],
      ["de", "Einstellungen"],
      ["fr", "Parametres"],
    ]) {
      await page.goto(`${url}${demo}/?locale=${locale}`);
      await page.getByRole("heading", { name: heading, exact: true }).waitFor();
      assert.equal(await page.locator("html").getAttribute("lang"), locale);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${url}angular/?example=kept&locale=en#section`);
  const languages = page.getByRole("navigation", { name: "Language" });
  assert.equal(await languages.getByRole("link", { name: "English" }).getAttribute("aria-current"), "page");
  await languages.getByRole("link", { name: "Deutsch" }).click();
  await page.getByRole("heading", { name: "Einstellungen", exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("example"), "kept");
  assert.equal(new URL(page.url()).hash, "#section");
  assert.equal(await page.getByRole("navigation", { name: "Sprache" }).getByRole("link", { name: "Deutsch" }).getAttribute("aria-current"), "page");
  await page.getByRole("link", { name: "Français" }).click();
  await page.getByRole("heading", { name: "Parametres", exact: true }).waitFor();
  await page.getByRole("link", { name: "English" }).click();
  await page.getByRole("heading", { name: "Settings", exact: true }).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "App mobile horizontal overflow");
  await page.goto(
    `${url}?path=/story/sample-settings-dialog--default&globals=locale:de#preview`,
  );
  await page.waitForURL(
    `${url}angular/storybook/?path=/story/sample-settings-dialog--default&globals=locale:de#preview`,
  );
  await page
    .frameLocator("#storybook-preview-iframe")
    .getByRole("heading", { name: "Einstellungen", exact: true })
    .waitFor();
  await page.goto(
    `${url}iframe.html?id=sample-settings-dialog--default&viewMode=story&globals=locale:fr`,
  );
  await page
    .getByRole("heading", { name: "Parametres", exact: true })
    .waitFor();
  assert.ok(page.url().startsWith(`${url}angular/storybook/iframe.html?`));
  assert.deepEqual(errors, [], "Missing staged assets or browser errors");
  console.log(
    "Pages passed: landing links, mobile layout, both apps in three locales, and legacy Storybook redirects.",
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
for (const [app, destination] of [
  ["sample-angular", "angular"],
  ["sample-angular-nx", "nx"],
]) {
  const result = await promisify(execFile)(
    process.execPath,
    [resolve(root, `apps/${app}/scripts/test-storybook-static.mjs`)],
    {
      cwd: root,
      env: {
        ...process.env,
        STORYBOOK_STATIC_DIR: resolve(staticDir, destination, "storybook"),
        STORYBOOK_BASE_PATH: `${basePath}${destination}/storybook/`,
      },
    },
  );
  process.stdout.write(`${destination}: ${result.stdout}`);
}
