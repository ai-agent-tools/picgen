import { select } from "@inquirer/prompts";
import { setPreferredMode, setPreferredProvider } from "../config/preferences.js";
import { ensureConfig, getConfigPath, loadConfig, saveConfig } from "../config/store.js";
import { testProvider } from "../providers/health.js";
import { addProvider, listProviders } from "./provider.js";

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
        { name: "Choose default provider/channel", value: "provider" },
        { name: "Choose generation preference", value: "mode" },
        { name: "Test a provider", value: "test" },
        { name: "Add a provider/channel", value: "add" },
        { name: "Finish setup", value: "done" }
      ]
    });

    if (action === "provider") {
      await chooseDefaultProvider();
    } else if (action === "mode") {
      await chooseDefaultMode();
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
  await listProviders();
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
