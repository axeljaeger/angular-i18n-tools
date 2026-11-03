import { runTests } from "@vscode/test-web";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { copyFile, mkdir, stat } from "node:fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { values } = parseArgs({ options: { project: { type: "string", default: "sample-angular" }, "extension-path": { type: "string" } } });
if (!["sample-angular", "sample-angular-nx"].includes(values.project)) throw new Error("Use sample-angular or sample-angular-nx for the web test project.");
const extensionDevelopmentPath = values["extension-path"] ? resolve(values["extension-path"]) : resolve(__dirname, "..");
await stat(resolve(extensionDevelopmentPath, "package.json"));
const bundledTestsPath = resolve(__dirname, "../dist/web/test/suite/index.cjs");
const extensionTestsPath = values["extension-path"] ? resolve(extensionDevelopmentPath, ".test/suite/index.cjs") : bundledTestsPath;
if (values["extension-path"]) {
  // The web host serves its test entry below the development extension root.
  // Add the harness only to the unpacked fixture; the published VSIX stays unchanged.
  await mkdir(dirname(extensionTestsPath), { recursive: true });
  await copyFile(bundledTestsPath, extensionTestsPath);
}
const folderPath = resolve(__dirname, "../../../apps", values.project);

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
  console.log(`VS Code web extension passed: ${values.project}; extension: ${extensionDevelopmentPath}`);
} catch (error) {
  console.error("Failed to run VS Code web extension tests", error);
  process.exit(1);
}
