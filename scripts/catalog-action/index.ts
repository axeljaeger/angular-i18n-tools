import { appendFile, realpath } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import { runCli } from "../../packages/core/src/check.js";

function enabled(name: string, fallback: string): boolean {
  const value = process.env[name] || fallback;
  if (!["true", "false"].includes(value)) throw new Error(`${name.replace("INPUT_", "").toLowerCase()} must be true or false.`);
  return value === "true";
}

try {
  const workspace = await realpath(process.env.GITHUB_WORKSPACE ?? process.cwd());
  const input = process.env.INPUT_PATH || ".";
  if (isAbsolute(input)) throw new Error("path must be relative to the checked-out repository.");
  const root = await realpath(resolve(workspace, input));
  const project = relative(workspace, root);
  if (project === ".." || project.startsWith("../") || project.startsWith("..\\") || isAbsolute(project)) {
    throw new Error("path must stay inside the checked-out repository.");
  }
  const args = [root, "--annotation-root", workspace];
  if (enabled("INPUT_ANNOTATIONS", "true")) args.push("--github-annotations");
  if (enabled("INPUT_SUMMARY", "true") && process.env.GITHUB_STEP_SUMMARY) args.push("--github-summary");
  console.log(`Checking runtime JSON catalogs: ${project || "."}`);
  process.exitCode = await runCli(args);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const escaped = message.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
  console.error(`::error title=Catalog check could not run::${escaped}`);
  if (process.env.GITHUB_STEP_SUMMARY && process.env.INPUT_SUMMARY !== "false") {
    const safe = message.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Angular i18n catalog checks\n\n**Could not run.**\n\n<pre>${safe}</pre>\n\nCheck the project path and runtime JSON catalog syntax.\n`);
  }
  process.exitCode = 1;
}
