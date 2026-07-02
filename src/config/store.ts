import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import YAML from "yaml";
import { defaultConfig } from "./defaults.js";
import { picgenConfigSchema } from "./schema.js";
import type { PicgenConfig } from "../types.js";

export function getConfigPath(): string {
  return process.env.PICGEN_CONFIG ?? join(homedir(), ".picgen", "config.yaml");
}

export async function loadConfig(): Promise<PicgenConfig> {
  const path = getConfigPath();
  try {
    const raw = await readFile(path, "utf8");
    const parsed = YAML.parse(raw);
    return picgenConfigSchema.parse(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return structuredClone(defaultConfig);
    }
    throw error;
  }
}

export async function saveConfig(config: PicgenConfig): Promise<void> {
  const parsed = picgenConfigSchema.parse(config);
  const path = getConfigPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, YAML.stringify(parsed), "utf8");
}

export async function ensureConfig(): Promise<PicgenConfig> {
  const config = await loadConfig();
  await saveConfig(config);
  return config;
}
