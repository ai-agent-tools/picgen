import { readFile, writeFile } from "node:fs/promises";

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const content = `export const PACKAGE_NAME = ${JSON.stringify(pkg.name)};\nexport const VERSION = ${JSON.stringify(pkg.version)};\n`;
await writeFile(new URL("../src/version.ts", import.meta.url), content, "utf8");
