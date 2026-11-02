import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("../../", import.meta.url));
const basePath = process.env.PAGES_BASE_PATH ?? "/angular-i18n-tools/";
if (!basePath.startsWith("/") || !basePath.endsWith("/") || basePath.includes("..")) {
  throw new Error("PAGES_BASE_PATH must start and end with / and contain no parent segments.");
}
for (const args of [
  ["--filter", "@angular-i18n-tools/storybook-addon", "run", "build"],
  ["--filter", "@angular-i18n-tools/sample-angular", "run", "build", "--configuration=production", `--base-href=${basePath}angular/`],
  ["exec", "nx", "run", "sample-angular-nx:build", "--configuration=production", `--base-href=${basePath}nx/`],
  ["--filter", "@angular-i18n-tools/sample-angular", "run", "build-storybook"],
  ["exec", "nx", "run", "sample-angular-nx:build-storybook"]
]) {
  await new Promise((resolve, reject) => {
    const child = spawn("pnpm", args, { cwd, stdio: "inherit", env: { ...process.env, NX_DAEMON: "false" } });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`pnpm ${args.join(" ")} exited with ${code}`)));
  });
}
await import("./assemble.mjs");
