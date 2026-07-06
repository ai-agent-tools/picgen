import { defaultCapabilitiesForProtocol } from "./capabilities.js";
import { readEnvVarValue, saveManagedEnvVar } from "./env.js";
import { providerNameToApiKeyEnv } from "./providerKeys.js";
import type { PicgenConfig } from "../types.js";

export interface ConfigMigrationResult {
  config: PicgenConfig;
  changed: boolean;
}

export async function migrateConfig(config: PicgenConfig): Promise<ConfigMigrationResult> {
  const migrated = structuredClone(config);
  let changed = false;
  const usedEnvs = new Set<string>();

  for (const [providerName, provider] of Object.entries(migrated.providers)) {
    const defaultCapabilities = defaultCapabilitiesForProtocol(provider.protocol);
    const mergedCapabilities = [...new Set([...provider.capabilities, ...defaultCapabilities])];
    if (mergedCapabilities.length !== provider.capabilities.length) {
      provider.capabilities = mergedCapabilities;
      changed = true;
    }

    const currentEnv = provider.api_key_env;
    if (!usedEnvs.has(currentEnv)) {
      usedEnvs.add(currentEnv);
      continue;
    }

    const nextEnv = nextUniqueProviderEnv(usedEnvs, providerName);
    const currentValue = await readEnvVarValue(currentEnv);
    provider.api_key_env = nextEnv;
    usedEnvs.add(nextEnv);
    changed = true;

    if (currentValue && !(await readEnvVarValue(nextEnv))) {
      await saveManagedEnvVar(nextEnv, currentValue);
    }
  }

  return { config: migrated, changed };
}

function nextUniqueProviderEnv(usedEnvs: Set<string>, providerName: string): string {
  const baseEnv = providerNameToApiKeyEnv(providerName);
  if (!usedEnvs.has(baseEnv)) return baseEnv;

  let index = 2;
  while (usedEnvs.has(`${baseEnv}_${index}`)) index += 1;
  return `${baseEnv}_${index}`;
}
