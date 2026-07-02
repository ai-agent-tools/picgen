import type { GeneratedImage, GenerationRun, ResolvedGenerationPlan } from "../types.js";

export interface ImageProviderAdapter {
  protocol: "openai-images" | "gemini";
  generate(plan: ResolvedGenerationPlan, run: GenerationRun): Promise<GeneratedImage[]>;
}

export class NotImplementedAdapter implements ImageProviderAdapter {
  constructor(public readonly protocol: "openai-images" | "gemini") {}

  async generate(plan: ResolvedGenerationPlan, _run: GenerationRun): Promise<GeneratedImage[]> {
    throw new Error(
      `Real generation is not implemented for ${this.protocol} yet. Dry-run plan is ready for ${plan.providerName}/${plan.model}.`
    );
  }
}

export function getAdapter(protocol: "openai-images" | "gemini"): ImageProviderAdapter {
  return new NotImplementedAdapter(protocol);
}
