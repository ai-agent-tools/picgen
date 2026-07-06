import { join } from "node:path";
import { cwd } from "node:process";
import type {
  PicgenConfig,
  ProviderCapability,
  ReferenceImage,
  ResolvedGenerationPlan
} from "../types.js";

export interface ResolveOptions {
  prompt: string;
  presetName?: string;
  providerName?: string;
  modeName?: string;
  model?: string;
  outputDirectory?: string;
  referenceImages?: ReferenceImage[];
  maskImage?: ReferenceImage;
}

export function resolveGenerationPlan(
  config: PicgenConfig,
  options: ResolveOptions
): ResolvedGenerationPlan {
  const presetName = options.presetName ?? config.default_preset;
  const preset = config.presets[presetName];
  if (!preset) {
    throw new Error(`Unknown preset: ${presetName}`);
  }

  const modeName = options.modeName ?? preset.mode ?? config.routing.default_mode;
  const mode = config.modes[modeName];
  if (!mode) {
    throw new Error(`Unknown mode: ${modeName}`);
  }

  const providerCandidates = options.providerName
    ? [options.providerName]
    : [config.routing.default_provider, ...config.routing.fallback_providers];
  const requiredCapability = requiredCapabilityForOptions(options);
  const unsupportedProviders: string[] = [];

  for (const providerName of providerCandidates) {
    const provider = config.providers[providerName];
    if (!provider || !provider.enabled) continue;
    if (!provider.capabilities.includes(requiredCapability)) {
      unsupportedProviders.push(providerName);
      continue;
    }

    const modelCandidates = options.model ? [options.model] : mode.preferred_models;
    const model = modelCandidates.find((candidate) => provider.models.includes(candidate));
    if (!model) continue;

    return {
      prompt: options.prompt,
      providerName,
      provider,
      model,
      presetName,
      preset,
      modeName,
      outputDirectory: options.outputDirectory ?? join(cwd(), "outputs", "picgen"),
      referenceImages: options.referenceImages ?? [],
      maskImage: options.maskImage
    };
  }

  if (options.providerName && unsupportedProviders.includes(options.providerName)) {
    throw new Error(
      `Provider "${options.providerName}" does not support ${requiredCapability}.`
    );
  }

  throw new Error(
    `No enabled provider can satisfy preset "${presetName}" with mode "${modeName}" and capability "${requiredCapability}".`
  );
}

function requiredCapabilityForOptions(options: ResolveOptions): ProviderCapability {
  if (options.maskImage) return "mask-guided-edit";
  return options.referenceImages && options.referenceImages.length > 0
    ? "reference-image"
    : "text-to-image";
}
