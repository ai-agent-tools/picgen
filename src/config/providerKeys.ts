import type { PicgenConfig } from "../types.js";

export function nextAvailableProviderApiKeyEnv(
  config: PicgenConfig,
  baseEnv: string,
  providerName: string,
  existingEnv?: string
): string {
  if (existingEnv) return existingEnv;
  const usedEnvs = new Set(Object.values(config.providers).map((provider) => provider.api_key_env));
  if (!usedEnvs.has(baseEnv)) return baseEnv;

  const providerEnv = providerNameToApiKeyEnv(providerName);
  if (!usedEnvs.has(providerEnv)) return providerEnv;

  let index = 2;
  while (usedEnvs.has(`${providerEnv}_${index}`)) index += 1;
  return `${providerEnv}_${index}`;
}

export function providerNameToApiKeyEnv(providerName: string): string {
  const safeName = providerName
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `PICGEN_${safeName || "PROVIDER"}_KEY`;
}
