import { build } from "esbuild";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
await build({ absWorkingDir: root, entryPoints: ["scripts/catalog-action/index.ts"], outfile: "dist/catalog-action.mjs", bundle: true, format: "esm", platform: "node", target: "node24", logLevel: "info" });
