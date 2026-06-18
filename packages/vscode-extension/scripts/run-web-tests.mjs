import { runTests } from "@vscode/test-web";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const extensionDevelopmentPath = resolve(__dirname, "..");
const extensionTestsPath = resolve(__dirname, "../dist/web/test/suite/index.cjs");
const folderPath = resolve(__dirname, "../../../apps/sample-angular");

try {
  await runTests({
    browserType: "chromium",
    esm: true,
    extensionDevelopmentPath,
    extensionTestsPath,
    folderPath,
    headless: true,
    port: 3101,
    quality: "stable",
    testRunnerDataDir: resolve(__dirname, "../../../.vscode-test-web")
  });
} catch (error) {
  console.error("Failed to run VS Code web extension tests", error);
  process.exit(1);
}
