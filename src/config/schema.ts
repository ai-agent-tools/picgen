import { z } from "zod";
import type { ProviderCapability } from "../types.js";

const providerSchema = z.object({
  enabled: z.boolean().default(true),
  protocol: z.enum(["openai-images", "gemini"]),
  channel: z.enum(["official", "third_party"]),
  base_url: z.string().url(),
  api_key_env: z.string().min(1),
  models: z.array(z.string().min(1)).min(1),
  test_model: z.string().min(1).optional(),
  capabilities: z
    .array(z.enum(["text-to-image", "reference-image"]))
    .optional()
})
.transform((provider) => ({
  ...provider,
  capabilities: provider.capabilities ?? defaultCapabilitiesForProtocol(provider.protocol)
}));

const presetSchema = z.object({
  mode: z.string().min(1),
  aspect_ratio: z.string().min(1),
  size: z.string().min(1),
  quality: z.string().min(1),
  n: z.number().int().positive(),
  output_format: z.enum(["png", "jpeg", "webp"])
});

const routingSchema = z
  .object({
    default_mode: z.string().min(1),
    default_provider: z.string().min(1).optional(),
    fallback_providers: z.array(z.string().min(1)).optional(),
    provider_priority: z.array(z.string().min(1)).optional()
  })
  .transform((routing) => {
    if (routing.default_provider) {
      return {
        default_mode: routing.default_mode,
        default_provider: routing.default_provider,
        fallback_providers: routing.fallback_providers ?? []
      };
    }

    const [defaultProvider, ...fallbackProviders] = routing.provider_priority ?? [];
    if (!defaultProvider) {
      throw new Error("routing.default_provider is required.");
    }

    return {
      default_mode: routing.default_mode,
      default_provider: defaultProvider,
      fallback_providers: routing.fallback_providers ?? fallbackProviders
    };
  });

export const picgenConfigSchema = z.object({
  default_preset: z.string().min(1),
  routing: routingSchema,
  providers: z.record(providerSchema),
  modes: z.record(
    z.object({
      preferred_models: z.array(z.string().min(1)).min(1)
    })
  ),
  presets: z.record(presetSchema)
});

function defaultCapabilitiesForProtocol(protocol: "openai-images" | "gemini"): ProviderCapability[] {
  if (protocol === "gemini") {
    return ["text-to-image", "reference-image"];
  }

  return ["text-to-image"];
}
