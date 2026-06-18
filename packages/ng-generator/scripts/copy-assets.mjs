import { copyFile, mkdir } from "node:fs/promises";

await mkdir("dist/runtime-localize", { recursive: true });
await copyFile("src/runtime-localize/schema.json", "dist/runtime-localize/schema.json");
