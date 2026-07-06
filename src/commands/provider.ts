import { input, select } from "@inquirer/prompts";
import { defaultCapabilitiesForProtocol } from "../config/capabilities.js";
import { nextAvailableProviderApiKeyEnv } from "../config/providerKeys.js";
import { setPreferredProvider } from "../config/preferences.js";
import { loadConfig, saveConfig } from "../config/store.js";
import { testProvider } from "../providers/health.js";
import { defaultProviderBaseUrl, normalizeProviderBaseUrl } from "../providers/urls.js";
import type { Channel, PicgenConfig, Protocol, ProviderConfig } from "../types.js";

export { defaultCapabilitiesForProtocol } from "../config/capabilities.js";

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
      `${name}\t${provider.enabled ? "enabled" : "disabled"}\t${preference}\t${provider.protocol}\t${provider.channel}\t${provider.capabilities.join(",")}\t${provider.models.join(",")}`
    );
  }
}

export async function addProvider(): Promise<void> {
  const config = await loadConfig();
  const provider = await promptProvider(config);
  addProviderToConfig(config, provider.name, provider.config);
  await saveConfig(config);
  console.log(`Added provider: ${provider.name}`);
}

export interface QuickAddProviderOptions {
  name?: string;
  host?: string;
  keyEnv?: string;
  models?: string;
  prefer?: boolean;
}

export async function quickAddProvider(
  templateName: string,
  options: QuickAddProviderOptions
): Promise<void> {
  const config = await loadConfig();
  const template = quickProviderTemplate(templateName);
  const name = options.name ?? nextAvailableProviderName(config, template.name);
  const apiKeyEnv =
    options.keyEnv ?? nextAvailableProviderApiKeyEnv(config, template.api_key_env, name);
  const provider: ProviderConfig = {
    enabled: true,
    protocol: template.protocol,
    channel: template.channel,
    base_url: normalizeProviderBaseUrl(options.host ?? template.base_url),
    api_key_env: apiKeyEnv,
    models: parseModels(options.models ?? template.models.join(",")),
    capabilities: defaultCapabilitiesForProtocol(template.protocol)
  };

  addProviderToConfig(config, name, provider);
  if (options.prefer) {
    setPreferredProvider(config, name);
  }
  await saveConfig(config);

  console.log(`Added provider: ${name}`);
  console.log(`Protocol: ${provider.protocol}`);
  console.log(`Host: ${provider.base_url}`);
  console.log(`API key env: ${provider.api_key_env}`);
  console.log(`Models: ${provider.models.join(",")}`);
  if (options.prefer) console.log(`Preferred provider: ${name}`);
}

export function addProviderToConfig(
  config: PicgenConfig,
  name: string,
  provider: ProviderConfig
): void {
  config.providers[name] = provider;
  const knownProviders = [config.routing.default_provider, ...config.routing.fallback_providers];
  if (!knownProviders.includes(name)) {
    config.routing.fallback_providers.push(name);
  }
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
  setPreferredProvider(config, name);
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
    default: nextAvailableProviderName(config, defaultName, existingName)
  });

  const baseUrl = await input({
    message: "Provider host URL (do not include /v1 or /v1beta)",
    default: existing?.base_url ?? defaultProviderBaseUrl(protocol)
  });

  const apiKeyEnv = await input({
    message: "API key environment variable",
    default:
      existing?.api_key_env ??
      nextAvailableProviderApiKeyEnv(
        config,
        protocol === "openai-images"
          ? channel === "official"
            ? "OPENAI_API_KEY"
            : "PICGEN_OPENAI_PROXY_KEY"
          : channel === "official"
            ? "GEMINI_API_KEY"
            : "PICGEN_GEMINI_PROXY_KEY",
        name
      )
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
      base_url: normalizeProviderBaseUrl(baseUrl),
      api_key_env: apiKeyEnv,
      models: modelsRaw
        .split(",")
        .map((model) => model.trim())
        .filter(Boolean),
      capabilities: defaultCapabilitiesForProtocol(protocol)
    }
  };
}

export function nextAvailableProviderName(
  config: PicgenConfig,
  baseName: string,
  existingName?: string
): string {
  if (existingName) return existingName;
  if (!config.providers[baseName]) return baseName;
  let index = 2;
  while (config.providers[`${baseName}_${index}`]) index += 1;
  return `${baseName}_${index}`;
}

function quickProviderTemplate(templateName: string): {
  name: string;
  protocol: Protocol;
  channel: Channel;
  base_url: string;
  api_key_env: string;
  models: string[];
} {
  switch (templateName.replaceAll("_", "-")) {
    case "openai-proxy":
      return {
        name: "openai_proxy",
        protocol: "openai-images",
        channel: "third_party",
        base_url: "https://www.pandai.vip",
        api_key_env: "PICGEN_OPENAI_PROXY_KEY",
        models: ["gpt-image-2"]
      };
    case "gemini-proxy":
      return {
        name: "gemini_proxy",
        protocol: "gemini",
        channel: "third_party",
        base_url: "https://www.pandai.vip",
        api_key_env: "PICGEN_GEMINI_PROXY_KEY",
        models: ["gemini-3.1-flash-image-preview", "gemini-3-pro-image-preview"]
      };
    case "openai-official":
      return {
        name: "openai_official",
        protocol: "openai-images",
        channel: "official",
        base_url: defaultProviderBaseUrl("openai-images"),
        api_key_env: "OPENAI_API_KEY",
        models: ["gpt-image-2"]
      };
    case "gemini-official":
      return {
        name: "gemini_official",
        protocol: "gemini",
        channel: "official",
        base_url: defaultProviderBaseUrl("gemini"),
        api_key_env: "GEMINI_API_KEY",
        models: ["gemini-3.1-flash-image-preview", "gemini-3-pro-image-preview"]
      };
    default:
      throw new Error(
        `Unknown provider template: ${templateName}. Use openai-proxy, gemini-proxy, openai-official, or gemini-official.`
      );
  }
}

function parseModels(raw: string): string[] {
  return raw
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
}
