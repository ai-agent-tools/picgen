import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import YAML from "yaml";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultConfig } from "../src/config/defaults.js";
import {
  setPreferredMode,
  setPreferredPreset,
  setPreferredProvider
} from "../src/config/preferences.js";
import { nextAvailableProviderApiKeyEnv } from "../src/config/providerKeys.js";
import { saveConfig } from "../src/config/store.js";
import {
  addProviderToConfig,
  defaultCapabilitiesForProtocol,
  nextAvailableProviderName,
  preferProvider,
  quickAddProvider
} from "../src/commands/provider.js";
import { preferMode, preferPreset } from "../src/commands/preferences.js";

let tempDir: string;
let previousConfigPath: string | undefined;

beforeEach(async () => {
  previousConfigPath = process.env.PICGEN_CONFIG;
  tempDir = await mkdtemp(join(tmpdir(), "picgen-test-"));
  process.env.PICGEN_CONFIG = join(tempDir, "config.yaml");
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(async () => {
  if (previousConfigPath === undefined) {
    delete process.env.PICGEN_CONFIG;
  } else {
    process.env.PICGEN_CONFIG = previousConfigPath;
  }
  vi.restoreAllMocks();
  await rm(tempDir, { recursive: true, force: true });
});

describe("preference commands", () => {
  it("updates provider preference in memory", () => {
    const config = structuredClone(defaultConfig);

    setPreferredProvider(config, "gemini_official");

    expect(config.routing.default_provider).toBe("gemini_official");
    expect(config.routing.fallback_providers).toEqual(["openai_official"]);
  });

  it("updates mode and preset preferences in memory", () => {
    const config = structuredClone(defaultConfig);

    setPreferredMode(config, "premium");
    setPreferredPreset(config, "poster");

    expect(config.routing.default_mode).toBe("premium");
    expect(config.default_preset).toBe("poster");
  });

  it("sets the preferred provider and keeps the previous default as fallback", async () => {
    await saveConfig(structuredClone(defaultConfig));

    await preferProvider("gemini_official");

    const config = await readSavedConfig();
    expect(config.routing.default_provider).toBe("gemini_official");
    expect(config.routing.fallback_providers).toEqual(["openai_official"]);
  });

  it("sets the preferred mode", async () => {
    await saveConfig(structuredClone(defaultConfig));

    await preferMode("premium");

    const config = await readSavedConfig();
    expect(config.routing.default_mode).toBe("premium");
  });

  it("sets the preferred preset", async () => {
    await saveConfig(structuredClone(defaultConfig));

    await preferPreset("social-cover");

    const config = await readSavedConfig();
    expect(config.default_preset).toBe("social-cover");
  });

  it("adds providers as fallbacks without changing default preference", () => {
    const config = structuredClone(defaultConfig);

    addProviderToConfig(config, "gemini_proxy", {
      ...defaultConfig.providers.gemini_official,
      channel: "third_party",
      base_url: "https://www.pandai.vip"
    });

    expect(config.routing.default_provider).toBe("openai_official");
    expect(config.routing.fallback_providers).toContain("gemini_proxy");
  });

  it("chooses the next available provider name", () => {
    const config = structuredClone(defaultConfig);
    config.providers.openai_proxy = {
      ...defaultConfig.providers.openai_official,
      channel: "third_party"
    };

    expect(nextAvailableProviderName(config, "openai_proxy")).toBe("openai_proxy_2");
  });

  it("chooses an independent API key env for duplicate provider types", () => {
    const config = structuredClone(defaultConfig);
    config.providers.gemini_proxy = {
      ...defaultConfig.providers.gemini_official,
      channel: "third_party",
      api_key_env: "PICGEN_GEMINI_PROXY_KEY"
    };

    expect(
      nextAvailableProviderApiKeyEnv(config, "PICGEN_GEMINI_PROXY_KEY", "gemini_proxy_2")
    ).toBe("PICGEN_GEMINI_PROXY_2_KEY");
  });

  it("uses protocol defaults for provider capabilities", () => {
    expect(defaultCapabilitiesForProtocol("openai-images")).toEqual(["text-to-image"]);
    expect(defaultCapabilitiesForProtocol("gemini")).toEqual([
      "text-to-image",
      "reference-image"
    ]);
  });

  it("quick-adds a common provider without interactive prompts", async () => {
    await saveConfig(structuredClone(defaultConfig));

    await quickAddProvider("gemini-proxy", {
      host: "https://www.pandai.vip/v1beta",
      keyEnv: "PICGEN_GEMINI_PROXY_KEY",
      prefer: true
    });

    const config = await readSavedConfig();
    expect(config.routing.default_provider).toBe("gemini_proxy");
    expect(config.providers.gemini_proxy).toEqual(
      expect.objectContaining({
        protocol: "gemini",
        channel: "third_party",
        base_url: "https://www.pandai.vip",
        api_key_env: "PICGEN_GEMINI_PROXY_KEY",
        capabilities: ["text-to-image", "reference-image"]
      })
    );
  });

  it("quick-adds duplicate providers with independent API key env names", async () => {
    await saveConfig(structuredClone(defaultConfig));

    await quickAddProvider("gemini-proxy", {
      host: "https://one.example",
      prefer: true
    });
    await quickAddProvider("gemini-proxy", {
      host: "https://two.example"
    });

    const config = await readSavedConfig();
    expect(config.providers.gemini_proxy.api_key_env).toBe("PICGEN_GEMINI_PROXY_KEY");
    expect(config.providers.gemini_proxy_2.api_key_env).toBe("PICGEN_GEMINI_PROXY_2_KEY");
  });
});

async function readSavedConfig(): Promise<typeof defaultConfig> {
  const raw = await readFile(process.env.PICGEN_CONFIG!, "utf8");
  return YAML.parse(raw);
}
