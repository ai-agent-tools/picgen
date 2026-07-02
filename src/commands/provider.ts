import { input, select } from "@inquirer/prompts";
import { loadConfig, saveConfig } from "../config/store.js";
import { testProvider } from "../providers/health.js";
import type { Channel, PicgenConfig, Protocol, ProviderConfig } from "../types.js";

export async function listProviders(): Promise<void> {
  const config = await loadConfig();
  for (const [name, provider] of Object.entries(config.providers)) {
    const preference =
      name === config.routing.default_provider
        ? "default"
        : config.routing.fallback_providers.includes(name)
          ? "fallback"
          : "manual";
    console.log(
      `${name}\t${provider.enabled ? "enabled" : "disabled"}\t${preference}\t${provider.protocol}\t${provider.channel}\t${provider.models.join(",")}`
    );
  }
}

export async function addProvider(): Promise<void> {
  const config = await loadConfig();
  const provider = await promptProvider(config);
  config.providers[provider.name] = provider.config;
  const knownProviders = [config.routing.default_provider, ...config.routing.fallback_providers];
  if (!knownProviders.includes(provider.name)) {
    config.routing.fallback_providers.push(provider.name);
  }
  await saveConfig(config);
  console.log(`Added provider: ${provider.name}`);
}

export async function editProvider(name: string): Promise<void> {
  const config = await loadConfig();
  if (!config.providers[name]) throw new Error(`Unknown provider: ${name}`);
  const provider = await promptProvider(config, name, config.providers[name]);
  delete config.providers[name];
  config.providers[provider.name] = provider.config;
  if (config.routing.default_provider === name) {
    config.routing.default_provider = provider.name;
  }
  config.routing.fallback_providers = config.routing.fallback_providers.map((item) =>
    item === name ? provider.name : item
  );
  await saveConfig(config);
  console.log(`Updated provider: ${provider.name}`);
}

export async function setProviderEnabled(name: string, enabled: boolean): Promise<void> {
  const config = await loadConfig();
  const provider = config.providers[name];
  if (!provider) throw new Error(`Unknown provider: ${name}`);
  provider.enabled = enabled;
  await saveConfig(config);
  console.log(`${enabled ? "Enabled" : "Disabled"} provider: ${name}`);
}

export async function removeProvider(name: string): Promise<void> {
  const config = await loadConfig();
  if (!config.providers[name]) throw new Error(`Unknown provider: ${name}`);
  delete config.providers[name];
  config.routing.fallback_providers = config.routing.fallback_providers.filter(
    (item) => item !== name
  );
  if (config.routing.default_provider === name) {
    const [nextDefault, ...remainingFallbacks] = config.routing.fallback_providers;
    if (!nextDefault) {
      throw new Error("Cannot remove the default provider because no fallback provider remains.");
    }
    config.routing.default_provider = nextDefault;
    config.routing.fallback_providers = remainingFallbacks;
  }
  await saveConfig(config);
  console.log(`Removed provider: ${name}`);
}

export async function preferProvider(name: string): Promise<void> {
  const config = await loadConfig();
  if (!config.providers[name]) throw new Error(`Unknown provider: ${name}`);

  const previousDefault = config.routing.default_provider;
  config.routing.default_provider = name;
  config.routing.fallback_providers = [
    ...new Set([
      previousDefault,
      ...config.routing.fallback_providers.filter((providerName) => providerName !== name)
    ])
  ].filter((providerName) => providerName && providerName !== name);

  await saveConfig(config);
  console.log(`Preferred provider: ${name}`);
}

export async function runProviderTest(
  name: string,
  options: { json?: boolean }
): Promise<void> {
  const config = await loadConfig();
  const provider = config.providers[name];
  if (!provider) throw new Error(`Unknown provider: ${name}`);

  const result = await testProvider(name, provider);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`${result.ok ? "OK" : "FAILED"} ${result.name} [${result.protocol}]`);
  console.log(result.message);
  if (result.model) console.log(`Model: ${result.model}`);
  if (result.http_status) console.log(`HTTP status: ${result.http_status}`);
}

async function promptProvider(
  config: PicgenConfig,
  existingName?: string,
  existing?: ProviderConfig
): Promise<{ name: string; config: ProviderConfig }> {
  const protocol = await select<Protocol>({
    message: "Select protocol",
    default: existing?.protocol ?? "openai-images",
    choices: [
      { name: "OpenAI-compatible Images API", value: "openai-images" },
      { name: "Gemini image API", value: "gemini" }
    ]
  });
  const channel = await select<Channel>({
    message: "Select channel",
    default: existing?.channel ?? "official",
    choices: [
      { name: "Official", value: "official" },
      { name: "Third-party proxy / aggregator", value: "third_party" }
    ]
  });

  const defaultName =
    existingName ??
    (protocol === "openai-images"
      ? channel === "official"
        ? "openai_official"
        : "openai_proxy"
      : channel === "official"
        ? "gemini_official"
        : "gemini_proxy");

  const name = await input({
    message: "Provider name",
    default: nextAvailableName(config, defaultName, existingName)
  });

  const baseUrl = await input({
    message: "Base URL",
    default:
      existing?.base_url ??
      (protocol === "openai-images"
        ? "https://api.openai.com/v1"
        : "https://generativelanguage.googleapis.com")
  });

  const apiKeyEnv = await input({
    message: "API key environment variable",
    default:
      existing?.api_key_env ??
      (protocol === "openai-images"
        ? channel === "official"
          ? "OPENAI_API_KEY"
          : "PICGEN_OPENAI_PROXY_KEY"
        : channel === "official"
          ? "GEMINI_API_KEY"
          : "PICGEN_GEMINI_PROXY_KEY")
  });

  const defaultModels =
    protocol === "openai-images"
      ? "gpt-image-2"
      : "gemini-3.1-flash-image-preview,gemini-3-pro-image-preview";
  const modelsRaw = await input({
    message: "Models (comma separated)",
    default: existing?.models.join(",") ?? defaultModels
  });

  return {
    name,
    config: {
      enabled: existing?.enabled ?? true,
      protocol,
      channel,
      base_url: baseUrl,
      api_key_env: apiKeyEnv,
      models: modelsRaw
        .split(",")
        .map((model) => model.trim())
        .filter(Boolean)
    }
  };
}

function nextAvailableName(config: PicgenConfig, baseName: string, existingName?: string): string {
  if (existingName) return existingName;
  if (!config.providers[baseName]) return baseName;
  let index = 2;
  while (config.providers[`${baseName}_${index}`]) index += 1;
  return `${baseName}_${index}`;
}
