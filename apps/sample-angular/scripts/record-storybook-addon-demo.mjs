import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const storybookUrl = process.env.STORYBOOK_URL ?? "http://localhost:6006";
const outputDir = resolve("storybook-demo");
const videoDir = resolve(outputDir, "video");
const storyPath = "/?path=/story/sample-settings-dialog--default";

await rm(outputDir, { recursive: true, force: true });
await mkdir(videoDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 820 },
  recordVideo: {
    dir: videoDir,
    size: { width: 1280, height: 820 }
  }
});
const page = await context.newPage();
const browserMessages = [];

page.on("console", (message) => {
  browserMessages.push(`[console:${message.type()}] ${message.text()}`);
});
page.on("pageerror", (error) => {
  browserMessages.push(`[pageerror] ${error.message}`);
});

try {
  await page.goto(`${storybookUrl}${storyPath}`, { waitUntil: "networkidle" });
  await waitForStoryText(page, "Settings");
  await page.screenshot({ path: resolve(outputDir, "01-english.png"), fullPage: true });

  await selectLocale(page, "Deutsch");
  await waitForStoryText(page, "Einstellungen");
  await assertPreviewLocale(page, "de");
  await page.screenshot({ path: resolve(outputDir, "02-german.png"), fullPage: true });

  await selectLocale(page, "Français");
  await waitForStoryText(page, "Parametres");
  await assertPreviewLocale(page, "fr");
  await page.screenshot({ path: resolve(outputDir, "03-french.png"), fullPage: true });

  await page.goto(`${storybookUrl}${storyPath}&globals=locale:de`, { waitUntil: "networkidle" });
  await waitForStoryText(page, "Einstellungen");
  await assertPreviewLocale(page, "de");
  await page.screenshot({ path: resolve(outputDir, "04-url-locale.png"), fullPage: true });
} finally {
  await context.close();
  await browser.close();
}

console.log(`Storybook addon demo artifacts written to ${outputDir}`);
console.log(`Video files are in ${videoDir}`);

async function selectLocale(page, title) {
  const toolbarButton = page.getByRole("button", { name: /Locale|English|Deutsch|Français|en|de|fr/i }).first();
  await toolbarButton.click();
  await page.getByRole("menuitem", { name: new RegExp(title, "i") }).click();
  await page.waitForLoadState("networkidle");
}

async function waitForStoryText(page, text) {
  const frame = await waitForPreviewFrame(page);
  await frame.getByText(text, { exact: false }).first().waitFor({ timeout: 10000 });
}

async function assertPreviewLocale(page, locale) {
  const frame = await waitForPreviewFrame(page);
  const actual = await frame.locator("html").evaluate((html) => html.lang);

  if (actual !== locale) {
    throw new Error(`Expected preview html lang ${locale}, got ${actual}`);
  }
}

async function waitForPreviewFrame(page) {
  const frameLocator = page.frameLocator("#storybook-preview-iframe");
  await frameLocator.locator("body").waitFor({ state: "attached", timeout: 10000 });

  const errorText = await frameLocator.locator(".sb-errordisplay, .sb-show-errordisplay").first().textContent({ timeout: 1000 }).catch(() => undefined);

  if (errorText) {
    throw new Error(`Storybook preview error: ${errorText}\n${browserMessages.join("\n")}`);
  }

  return frameLocator;
}
