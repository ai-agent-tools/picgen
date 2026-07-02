import { confirm } from "@inquirer/prompts";
import type { GenerationPlanOutput } from "./create.js";

export interface ConfirmationResult {
  confirmed: boolean;
  skipped: boolean;
}

export async function confirmGeneration(
  plan: GenerationPlanOutput,
  options: { yes?: boolean }
): Promise<ConfirmationResult> {
  if (options.yes) {
    return { confirmed: true, skipped: true };
  }

  console.log("PicGen generation preview:");
  console.log(formatGenerationPreview(plan));

  const confirmed = await confirm({
    message: "Generate now? This may consume provider quota.",
    default: false
  });

  return { confirmed, skipped: false };
}

export function formatGenerationPreview(plan: GenerationPlanOutput): string {
  return [
    `Provider: ${plan.provider} (${plan.protocol})`,
    `Model: ${plan.model}`,
    `Preset: ${plan.preset}`,
    `Images: ${plan.n}`,
    `Reference images: ${plan.reference_images.length}`,
    `Aspect ratio: ${plan.aspect_ratio}`,
    `Output: ${plan.output_directory}`
  ].join("\n");
}
