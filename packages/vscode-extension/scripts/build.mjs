import { context, build } from "esbuild";

const watch = process.argv.includes("--watch");
const extensionOptions = {
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.js",
  bundle: true,
  format: "cjs",
  platform: "browser",
  external: ["vscode"],
  sourcemap: true,
  logLevel: "info"
};
const testOptions = {
  entryPoints: ["src/test/suite/index.ts"],
  outfile: "dist/web/test/suite/index.cjs",
  bundle: true,
  format: "cjs",
  platform: "browser",
  external: ["vscode"],
  sourcemap: true,
  logLevel: "info"
};

if (watch) {
  const extensionContext = await context(extensionOptions);
  const testContext = await context(testOptions);
  await Promise.all([extensionContext.watch(), testContext.watch()]);
  console.log("Watching VS Code extension...");
} else {
  await Promise.all([build(extensionOptions), build(testOptions)]);
}
