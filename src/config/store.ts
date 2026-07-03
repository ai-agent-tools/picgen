import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import YAML from "yaml";
import { defaultConfig } from "./defaults.js";
import { migrateConfig } from "./migrations.js";
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
    const config = picgenConfigSchema.parse(parsed);
    const migrated = await migrateConfig(config);
    if (migrated.changed) {
      await writeConfigFile(path, migrated.config);
    }
    return migrated.config;
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
  await writeConfigFile(path, parsed);
}

async function writeConfigFile(path: string, config: PicgenConfig): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, YAML.stringify(config), "utf8");
}

export async function ensureConfig(): Promise<PicgenConfig> {
  const config = await loadConfig();
  await saveConfig(config);
  return config;
}
