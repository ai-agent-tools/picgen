import { confirm, input, password, select } from "@inquirer/prompts";
import { getManagedEnvPath, saveManagedEnvVar } from "../config/env.js";
import { nextAvailableProviderApiKeyEnv } from "../config/providerKeys.js";
import { setPreferredMode, setPreferredProvider } from "../config/preferences.js";
import { ensureConfig, getConfigPath, loadConfig, saveConfig } from "../config/store.js";
import { testProvider } from "../providers/health.js";
import { defaultProviderBaseUrl, normalizeProviderBaseUrl } from "../providers/urls.js";
import {
  addProvider,
  addProviderToConfig,
  defaultCapabilitiesForProtocol,
  nextAvailableProviderName
} from "./provider.js";
import type { Channel, PicgenConfig, Protocol, ProviderConfig } from "../types.js";

type QuickProviderTemplate =
  | "openai_proxy"
  | "gemini_proxy"
  | "openai_official"
  | "gemini_official";

export async function runSetup(): Promise<void> {
  await ensureConfig();
  console.log(`PicGen config: ${getConfigPath()}`);

  let done = false;
  while (!done) {
    console.log("");
    await printSetupSummary();
    console.log("");

    const action = await select({
      message: "What do you want to configure?",
      choices: [
        { name: "Quick add a common provider/channel", value: "quick-add" },
        { name: "Choose default provider/channel", value: "provider" },
        { name: "Choose generation preference", value: "mode" },
        { name: "Configure API key", value: "key" },
        { name: "Test a provider", value: "test" },
        { name: "Advanced: add a custom provider/channel", value: "add" },
        { name: "Finish setup", value: "done" }
      ]
    });

    if (action === "quick-add") {
      await quickAddProvider();
    } else if (action === "provider") {
      await chooseDefaultProvider();
    } else if (action === "mode") {
      await chooseDefaultMode();
    } else if (action === "key") {
      await chooseProviderKeyToConfigure();
    } else if (action === "test") {
      await chooseProviderToTest();
    } else if (action === "add") {
      await addProvider();
    } else {
      done = true;
      console.log("Setup complete.");
    }
  }
}

async function printSetupSummary(): Promise<void> {
  const config = await loadConfig();
  console.log(`Default provider: ${config.routing.default_provider}`);
  console.log(`Generation preference: ${modeLabel(config.routing.default_mode)}`);
  console.log("Providers:");
  for (const [providerName, provider] of Object.entries(config.providers)) {
    const preference =
      providerName === config.routing.default_provider
        ? "default"
        : config.routing.fallback_providers.includes(providerName)
          ? "fallback"
          : "manual";
    console.log(
      `- ${providerName}: ${provider.enabled ? "enabled" : "disabled"}, ${preference}, ${providerLabel(provider)}, key=${provider.api_key_env}${process.env[provider.api_key_env] ? " set" : " missing"}, capabilities=${provider.capabilities.join(",")}`
    );
  }
}

async function chooseDefaultProvider(): Promise<void> {
  const config = await loadConfig();
  const name = await select<string>({
    message: "Choose the provider PicGen should use by default",
    default: config.routing.default_provider,
    choices: Object.entries(config.providers).map(([providerName, provider]) => ({
      name: `${providerName} (${provider.protocol}, ${provider.enabled ? "enabled" : "disabled"})`,
      value: providerName
    }))
  });

  setPreferredProvider(config, name);
  await saveConfig(config);
  console.log(`Preferred provider: ${name}`);
}

async function chooseDefaultMode(): Promise<void> {
  const config = await loadConfig();
  const name = await select<string>({
    message: "Choose the default generation preference",
    default: config.routing.default_mode,
    choices: Object.keys(config.modes).map((modeName) => ({
      name: modeLabel(modeName),
      value: modeName
    }))
  });

  setPreferredMode(config, name);
  await saveConfig(config);
  console.log(`Preferred mode: ${name}`);
}

async function chooseProviderToTest(): Promise<void> {
  const config = await loadConfig();
  const name = await select<string>({
    message: "Choose a provider to test",
    default: config.routing.default_provider,
    choices: Object.keys(config.providers).map((providerName) => ({
      name: providerName,
      value: providerName
    }))
  });

  const result = await testProvider(name, config.providers[name]);
  console.log(`${result.ok ? "OK" : "FAILED"} ${result.name} [${result.protocol}]`);
  console.log(result.message);
  if (result.model) console.log(`Model: ${result.model}`);
  if (result.http_status) console.log(`HTTP status: ${result.http_status}`);
}

async function chooseProviderKeyToConfigure(): Promise<void> {
  const config = await loadConfig();
  const name = await select<string>({
    message: "Choose the provider key to configure",
    default: config.routing.default_provider,
    choices: Object.entries(config.providers).map(([providerName, provider]) => ({
      name: `${providerName} (${provider.api_key_env}${process.env[provider.api_key_env] ? ", currently set" : ", missing"})`,
      value: providerName
    }))
  });

  await configureProviderApiKey(config.providers[name]);
}

async function quickAddProvider(): Promise<void> {
  const config = await loadConfig();
  const template = await select<QuickProviderTemplate>({
    message: "Choose the provider/channel you want to add",
    choices: [
      {
        name: "Third-party OpenAI-compatible channel",
        value: "openai_proxy"
      },
      {
        name: "Third-party Gemini channel",
        value: "gemini_proxy"
      },
      {
        name: "OpenAI official",
        value: "openai_official"
      },
      {
        name: "Gemini official",
        value: "gemini_official"
      }
    ]
  });

  const defaults = quickProviderDefaults(template);
  const name = await input({
    message: "Provider name",
    default: nextAvailableProviderName(config, defaults.name)
  });
  const baseUrl = await input({
    message: "Provider host URL (do not include /v1 or /v1beta)",
    default: defaults.base_url
  });
  const apiKeyEnv = await input({
    message: "API key environment variable",
    default: nextAvailableProviderApiKeyEnv(config, defaults.api_key_env, name)
  });
  const modelsRaw = await input({
    message: "Models (comma separated, press Enter for recommended defaults)",
    default: defaults.models.join(",")
  });

  const provider: ProviderConfig = {
    enabled: true,
    protocol: defaults.protocol,
    channel: defaults.channel,
    base_url: normalizeProviderBaseUrl(baseUrl),
    api_key_env: apiKeyEnv,
    models: parseModels(modelsRaw),
    capabilities: defaultCapabilitiesForProtocol(defaults.protocol)
  };

  addProviderToConfig(config, name, provider);

  const useAsDefault = await confirm({
    message: "Use this provider as the default?",
    default: true
  });
  if (useAsDefault) {
    setPreferredProvider(config, name);
  }

  await saveConfig(config);
  console.log(`Added provider: ${name}`);
  await configureProviderApiKey(provider);
}

async function configureProviderApiKey(provider: ProviderConfig): Promise<void> {
  if (process.env[provider.api_key_env]) {
    const replace = await confirm({
      message: `${provider.api_key_env} is already available. Replace the saved PicGen key?`,
      default: false
    });
    if (!replace) return;
  }

  const value = await password({
    message: `Paste API key for ${provider.api_key_env} (leave empty to skip)`,
    mask: "*"
  });

  if (!value.trim()) {
    console.log(`Skipped API key. You can configure it later with picgen setup.`);
    return;
  }

  const path = await saveManagedEnvVar(provider.api_key_env, value.trim());
  console.log(`Saved ${provider.api_key_env} to ${path}`);
  console.log(`PicGen loads this file automatically. Advanced users can override it with shell env vars or a project .env.`);
}

function quickProviderDefaults(template: QuickProviderTemplate): {
  name: string;
  protocol: Protocol;
  channel: Channel;
  base_url: string;
  api_key_env: string;
  models: string[];
} {
  switch (template) {
    case "openai_proxy":
      return {
        name: "openai_proxy",
        protocol: "openai-images",
        channel: "third_party",
        base_url: "https://www.pandai.vip",
        api_key_env: "PICGEN_OPENAI_PROXY_KEY",
        models: ["gpt-image-2"]
      };
    case "gemini_proxy":
      return {
        name: "gemini_proxy",
        protocol: "gemini",
        channel: "third_party",
        base_url: "https://www.pandai.vip",
        api_key_env: "PICGEN_GEMINI_PROXY_KEY",
        models: ["gemini-3.1-flash-image-preview", "gemini-3-pro-image-preview"]
      };
    case "openai_official":
      return {
        name: "openai_official",
        protocol: "openai-images",
        channel: "official",
        base_url: defaultProviderBaseUrl("openai-images"),
        api_key_env: "OPENAI_API_KEY",
        models: ["gpt-image-2"]
      };
    case "gemini_official":
      return {
        name: "gemini_official",
        protocol: "gemini",
        channel: "official",
        base_url: defaultProviderBaseUrl("gemini"),
        api_key_env: "GEMINI_API_KEY",
        models: ["gemini-3.1-flash-image-preview", "gemini-3-pro-image-preview"]
      };
  }
}

function parseModels(raw: string): string[] {
  return raw
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
}

function providerLabel(provider: ProviderConfig): string {
  if (provider.channel === "official") {
    return provider.protocol === "gemini" ? "Gemini official" : "OpenAI-compatible official";
  }

  return provider.protocol === "gemini"
    ? "Gemini third-party"
    : "OpenAI-compatible third-party";
}

function modeLabel(modeName: string): string {
  switch (modeName) {
    case "fast":
      return "fast - quick drafts";
    case "balanced":
      return "balanced - recommended";
    case "premium":
      return "premium - higher quality";
    default:
      return modeName;
  }
}
