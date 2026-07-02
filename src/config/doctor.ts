import type { DoctorProviderResult, PicgenConfig } from "../types.js";

export function inspectProviders(config: PicgenConfig): DoctorProviderResult[] {
  return Object.entries(config.providers).map(([name, provider]) => {
    const hasApiKey = Boolean(process.env[provider.api_key_env]);
    const status = !provider.enabled
      ? "disabled"
      : hasApiKey
        ? "ok"
        : "missing_api_key";

    return {
      name,
      enabled: provider.enabled,
      protocol: provider.protocol,
      channel: provider.channel,
      base_url: provider.base_url,
      api_key_env: provider.api_key_env,
      has_api_key: hasApiKey,
      models: provider.models,
      status
    };
  });
}
