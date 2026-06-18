import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");
const options = {
  entryPoints: ["src/preset.ts", "src/preview.ts", "src/manager.ts"],
  outdir: "dist",
  bundle: true,
  format: "esm",
  platform: "browser",
  external: ["storybook/manager-api", "storybook/preview-api", "storybook/internal/core-events"],
  sourcemap: true,
  logLevel: "info"
};

if (watch) {
  const buildContext = await context(options);
  await buildContext.watch();
  console.log("Watching Storybook addon...");
} else {
  await build(options);
}
