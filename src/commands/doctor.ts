import { getConfigPath, loadConfig } from "../config/store.js";
import { inspectProviders } from "../config/doctor.js";

export async function runDoctor(options: { json?: boolean }): Promise<void> {
  const config = await loadConfig();
  const providers = inspectProviders(config);
  const configured = providers.some((provider) => provider.status === "ok");

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          configured,
          config_path: getConfigPath(),
          default_preset: config.default_preset,
          default_mode: config.routing.default_mode,
          default_provider: config.routing.default_provider,
          fallback_providers: config.routing.fallback_providers,
          providers
        },
        null,
        2
      )
    );
    return;
  }

  console.log(`Config: ${getConfigPath()}`);
  console.log(`Default preset: ${config.default_preset}`);
  console.log(`Default mode: ${config.routing.default_mode}`);
  console.log(`Default provider: ${config.routing.default_provider}`);
  console.log(`Fallback providers: ${config.routing.fallback_providers.join(", ") || "(none)"}`);
  console.log("");
  console.log("Providers:");
  for (const provider of providers) {
    console.log(
      `- ${provider.name} [${provider.protocol}] ${provider.status} key=${provider.api_key_env} capabilities=${provider.capabilities.join(", ")} models=${provider.models.join(", ")}`
    );
  }

  if (!configured) {
    console.log("");
    console.log("No usable provider found. Run `picgen setup` or set the API key env vars above.");
  }
}
