import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config/defaults.js";
import { picgenConfigSchema } from "../src/config/schema.js";
import { resolveGenerationPlan } from "../src/routing/resolve.js";
import { toPlanOutput } from "../src/commands/create.js";

describe("resolveGenerationPlan", () => {
  it("uses preset mode and default provider preference", () => {
    const plan = resolveGenerationPlan(defaultConfig, {
      prompt: "test",
      presetName: "poster"
    });

    expect(plan.providerName).toBe("openai_official");
    expect(plan.model).toBe("gpt-image-2");
    expect(plan.modeName).toBe("premium");
  });

  it("uses fallback providers when the default provider is disabled", () => {
    const config = structuredClone(defaultConfig);
    config.providers.openai_official.enabled = false;

    const plan = resolveGenerationPlan(config, {
      prompt: "test",
      presetName: "poster"
    });

    expect(plan.providerName).toBe("gemini_official");
    expect(plan.model).toBe("gemini-3-pro-image-preview");
  });

  it("uses one-off provider overrides without changing preferences", () => {
    const config = structuredClone(defaultConfig);

    const plan = resolveGenerationPlan(config, {
      prompt: "test",
      presetName: "poster",
      providerName: "gemini_official"
    });

    expect(plan.providerName).toBe("gemini_official");
    expect(plan.model).toBe("gemini-3-pro-image-preview");
    expect(config.routing.default_provider).toBe("openai_official");
  });

  it("supports legacy provider_priority configs", () => {
    const legacyConfig = structuredClone(defaultConfig) as unknown as {
      routing: {
        default_mode: string;
        provider_priority: string[];
        default_provider?: string;
        fallback_providers?: string[];
      };
    };
    legacyConfig.routing = {
      default_mode: "balanced",
      provider_priority: ["gemini_official", "openai_official"]
    };

    const parsed = picgenConfigSchema.parse(legacyConfig);

    expect(parsed.routing.default_provider).toBe("gemini_official");
    expect(parsed.routing.fallback_providers).toEqual(["openai_official"]);
  });

  it("builds an agent-friendly plan output", () => {
    const plan = resolveGenerationPlan(defaultConfig, {
      prompt: "test",
      presetName: "poster"
    });

    expect(toPlanOutput(plan)).toMatchObject({
      prompt: "test",
      provider: "openai_official",
      protocol: "openai-images",
      channel: "official",
      model: "gpt-image-2",
      preset: "poster",
      mode: "premium",
      aspect_ratio: "3:4",
      n: 2
    });
  });
});
