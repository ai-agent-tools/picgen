import type { ResolvedGenerationPlan } from "../types.js";

export interface GeneratedImage {
  path: string;
  metadataPath: string;
}

export interface ImageProviderAdapter {
  protocol: "openai-images" | "gemini";
  generate(plan: ResolvedGenerationPlan): Promise<GeneratedImage[]>;
}

export class NotImplementedAdapter implements ImageProviderAdapter {
  constructor(public readonly protocol: "openai-images" | "gemini") {}

  async generate(plan: ResolvedGenerationPlan): Promise<GeneratedImage[]> {
    throw new Error(
      `Real generation is not implemented for ${this.protocol} yet. Dry-run plan is ready for ${plan.providerName}/${plan.model}.`
    );
  }
}

export function getAdapter(protocol: "openai-images" | "gemini"): ImageProviderAdapter {
  return new NotImplementedAdapter(protocol);
}
