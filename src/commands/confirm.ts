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
  const lines = [
    `Provider: ${plan.provider} (${plan.protocol})`,
    `Model: ${plan.model}`,
    `Preset: ${plan.preset}`,
    `Images: ${plan.n}`,
    `Size: ${formatSizePreview(plan)}`,
    `Reference images: ${plan.reference_images.length}`,
    `Mask image: ${plan.mask_image ? "yes" : "no"}`,
    `Aspect ratio: ${plan.aspect_ratio}`,
    `Output: ${plan.output_directory}`
  ];

  if (plan.size_request?.size_note) {
    lines.push(`Size note: ${plan.size_request.size_note}`);
  }

  return lines.join("\n");
}

function formatSizePreview(plan: GenerationPlanOutput): string {
  const request = plan.size_request;
  if (!request) return plan.size;
  if (!request.provider_size || request.provider_size === plan.size) return plan.size;
  return `${request.requested_size} -> ${request.provider_size}`;
}
