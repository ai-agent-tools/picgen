import { loadConfig, saveConfig } from "../config/store.js";

export async function preferMode(name: string): Promise<void> {
  const config = await loadConfig();
  if (!config.modes[name]) throw new Error(`Unknown mode: ${name}`);

  config.routing.default_mode = name;
  await saveConfig(config);
  console.log(`Preferred mode: ${name}`);
}

export async function preferPreset(name: string): Promise<void> {
  const config = await loadConfig();
  if (!config.presets[name]) throw new Error(`Unknown preset: ${name}`);

  config.default_preset = name;
  await saveConfig(config);
  console.log(`Preferred preset: ${name}`);
}
