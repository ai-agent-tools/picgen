import type { PicgenConfig } from "../types.js";

export function setPreferredProvider(config: PicgenConfig, name: string): PicgenConfig {
  if (!config.providers[name]) throw new Error(`Unknown provider: ${name}`);

  const previousDefault = config.routing.default_provider;
  config.routing.default_provider = name;
  config.routing.fallback_providers = [
    ...new Set([
      previousDefault,
      ...config.routing.fallback_providers.filter((providerName) => providerName !== name)
    ])
  ].filter((providerName) => providerName && providerName !== name);

  return config;
}

export function setPreferredMode(config: PicgenConfig, name: string): PicgenConfig {
  if (!config.modes[name]) throw new Error(`Unknown mode: ${name}`);

  config.routing.default_mode = name;
  return config;
}

export function setPreferredPreset(config: PicgenConfig, name: string): PicgenConfig {
  if (!config.presets[name]) throw new Error(`Unknown preset: ${name}`);

  config.default_preset = name;
  return config;
}
