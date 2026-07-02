import { setPreferredMode, setPreferredPreset } from "../config/preferences.js";
import { loadConfig, saveConfig } from "../config/store.js";

export async function preferMode(name: string): Promise<void> {
  const config = await loadConfig();
  setPreferredMode(config, name);
  await saveConfig(config);
  console.log(`Preferred mode: ${name}`);
}

export async function preferPreset(name: string): Promise<void> {
  const config = await loadConfig();
  setPreferredPreset(config, name);
  await saveConfig(config);
  console.log(`Preferred preset: ${name}`);
}
