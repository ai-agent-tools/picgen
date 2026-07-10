import { join } from "node:path";
import { cwd } from "node:process";
import { aspectRatioFromPixelSize, parsePixelSize } from "../generation/dimensions.js";
import type {
  PicgenConfig,
  PresetConfig,
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
  aspectRatio?: string;
  size?: string;
  quality?: string;
  n?: number;
  outputFormat?: PresetConfig["output_format"];
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
  const effectivePreset = applyPresetOverrides(preset, options);

  const modeName = options.modeName ?? effectivePreset.mode ?? config.routing.default_mode;
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
      preset: effectivePreset,
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

function applyPresetOverrides(preset: PresetConfig, options: ResolveOptions): PresetConfig {
  const pixelSize = options.size ? parsePixelSize(options.size) : undefined;
  const n = options.n ?? preset.n;
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error("--n must be a positive integer.");
  }

  return {
    ...preset,
    aspect_ratio: options.aspectRatio ?? (pixelSize ? aspectRatioFromPixelSize(pixelSize) : preset.aspect_ratio),
    size: options.size ?? preset.size,
    quality: options.quality ?? preset.quality,
    n,
    output_format: options.outputFormat ?? preset.output_format
  };
}

function requiredCapabilityForOptions(options: ResolveOptions): ProviderCapability {
  if (options.maskImage) return "mask-guided-edit";
  return options.referenceImages && options.referenceImages.length > 0
    ? "reference-image"
    : "text-to-image";
}
