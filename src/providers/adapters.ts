import type { GenerationRun, ProviderGenerationResult, ResolvedGenerationPlan } from "../types.js";
import { GeminiAdapter } from "./gemini.js";
import { OpenAIImagesAdapter } from "./openaiImages.js";

export interface ImageProviderAdapter {
  protocol: "openai-images" | "gemini";
  generate(plan: ResolvedGenerationPlan, run: GenerationRun): Promise<ProviderGenerationResult>;
}

export class NotImplementedAdapter implements ImageProviderAdapter {
  constructor(public readonly protocol: "openai-images" | "gemini") {}

  async generate(
    plan: ResolvedGenerationPlan,
    _run: GenerationRun
  ): Promise<ProviderGenerationResult> {
    throw new Error(
      `Real generation is not implemented for ${this.protocol} yet. Dry-run plan is ready for ${plan.providerName}/${plan.model}.`
    );
  }
}

export function getAdapter(protocol: "openai-images" | "gemini"): ImageProviderAdapter {
  if (protocol === "openai-images") {
    return new OpenAIImagesAdapter();
  }

  if (protocol === "gemini") {
    return new GeminiAdapter();
  }

  return new NotImplementedAdapter(protocol);
}
