import { join } from "node:path";
import { cwd } from "node:process";
import type { PicgenConfig, ReferenceImage, ResolvedGenerationPlan } from "../types.js";

export interface ResolveOptions {
  prompt: string;
  presetName?: string;
  providerName?: string;
  modeName?: string;
  model?: string;
  outputDirectory?: string;
  referenceImages?: ReferenceImage[];
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

  for (const providerName of providerCandidates) {
    const provider = config.providers[providerName];
    if (!provider || !provider.enabled) continue;

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
      referenceImages: options.referenceImages ?? []
    };
  }

  throw new Error(
    `No enabled provider can satisfy preset "${presetName}" with mode "${modeName}".`
  );
}
