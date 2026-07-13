import YAML from "yaml";
import { createGenerationRun, writeGenerationMetadata } from "../assets/output.js";
import { resolveReferenceImages } from "../assets/reference.js";
import { loadConfig } from "../config/store.js";
import { openAIImageSizePlanFor } from "../generation/dimensions.js";
import { getAdapter } from "../providers/adapters.js";
import { resolveGenerationPlan } from "../routing/resolve.js";
import { confirmGeneration } from "./confirm.js";
import type { ProviderGenerationResult, ResolvedGenerationPlan } from "../types.js";

export interface CreateOptions {
  dryRun?: boolean;
  preset?: string;
  provider?: string;
  mode?: string;
  model?: string;
  n?: string;
  size?: string;
  aspectRatio?: string;
  quality?: string;
  outputFormat?: string;
  outDir?: string;
  reference?: string[];
  mask?: string;
  json?: boolean;
  yes?: boolean;
}

export interface GenerationPlanOutput {
  prompt: string;
  provider: string;
  protocol: string;
  channel: string;
  model: string;
  preset: string;
  mode: string;
  aspect_ratio: string;
  size: string;
  quality: string;
  n: number;
  output_format: string;
  output_directory: string;
  size_request?: {
    requested_size: string;
    provider_size?: string;
    size_adjusted: boolean;
    size_note?: string;
  };
  reference_images: Array<{
    path: string;
    mime_type: string;
    bytes: number;
  }>;
  mask_image?: {
    path: string;
    mime_type: string;
    bytes: number;
  };
}

export async function runCreate(promptParts: string[], options: CreateOptions): Promise<void> {
  const prompt = promptParts.join(" ").trim();
  if (!prompt) {
    throw new Error("Prompt is required.");
  }

  const config = await loadConfig();
  const referenceImages = await resolveReferenceImages(options.reference ?? []);
  const [maskImage] = await resolveReferenceImages(options.mask ? [options.mask] : []);
  if (maskImage && referenceImages.length === 0) {
    throw new Error("--mask requires at least one --reference image.");
  }
  const plan = resolveGenerationPlan(config, {
    prompt,
    presetName: options.preset,
    providerName: options.provider,
    modeName: options.mode,
    model: options.model,
    n: parseImageCount(options.n),
    size: options.size,
    aspectRatio: options.aspectRatio,
    quality: options.quality,
    outputFormat: parseOutputFormat(options.outputFormat),
    outputDirectory: options.outDir,
    referenceImages,
    maskImage
  });

  const planOutput = toPlanOutput(plan);

  if (options.dryRun) {
    if (options.json) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            dry_run: true,
            provider_called: false,
            requires_confirmation: true,
            plan: planOutput
          },
          null,
          2
        )
      );
    } else {
      console.log("PicGen dry-run plan:");
      console.log(YAML.stringify(planOutput));
    }
    return;
  }

  const confirmation = await confirmGeneration(planOutput, { yes: options.yes });
  if (!confirmation.confirmed) {
    const cancelledOutput = {
      ok: false,
      cancelled: true,
      provider_called: false,
      plan: planOutput
    };
    if (options.json) {
      console.log(JSON.stringify(cancelledOutput, null, 2));
    } else {
      console.log("Generation cancelled.");
    }
    return;
  }

  const run = await createGenerationRun(plan);
  const runtimePlan = {
    ...plan,
    outputDirectory: run.outputDirectory
  };
  const runtimePlanOutput = toPlanOutput(runtimePlan);
  await writeGenerationMetadata(run, {
    plan: runtimePlanOutput,
    run: {
      id: run.id,
      output_directory: run.outputDirectory,
      metadata_path: run.metadataPath,
      prompt_path: run.promptPath
    }
  });

  const adapter = getAdapter(plan.provider.protocol);
  let result: ProviderGenerationResult;
  try {
    result = await adapter.generate(runtimePlan, run);
  } catch (error) {
    await writeGenerationMetadata(run, {
      plan: runtimePlanOutput,
      run: {
        id: run.id,
        output_directory: run.outputDirectory,
        metadata_path: run.metadataPath,
        prompt_path: run.promptPath
      },
      error: {
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : undefined
      }
    });
    throw error;
  }

  await writeGenerationMetadata(run, {
    plan: runtimePlanOutput,
    run: {
      id: run.id,
      output_directory: run.outputDirectory,
      metadata_path: run.metadataPath,
      prompt_path: run.promptPath
    },
    provider_response: result.provider_response,
    images: result.images
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        dry_run: false,
        output_dir: run.outputDirectory,
        metadata_path: run.metadataPath,
        images: result.images
      },
      null,
      2
    )
  );
}

function parseImageCount(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("--n must be a positive integer.");
  }
  return parsed;
}

function parseOutputFormat(value: string | undefined): "png" | "jpeg" | "webp" | undefined {
  if (value === undefined) return undefined;
  if (value === "png" || value === "jpeg" || value === "webp") return value;
  throw new Error("--output-format must be png, jpeg, or webp.");
}

export function toPlanOutput(plan: ResolvedGenerationPlan): GenerationPlanOutput {
  const sizeRequest =
    plan.provider.protocol === "openai-images"
      ? openAIImageSizePlanFor(plan.preset.aspect_ratio, plan.preset.size)
      : undefined;

  return {
    prompt: plan.prompt,
    provider: plan.providerName,
    protocol: plan.provider.protocol,
    channel: plan.provider.channel,
    model: plan.model,
    preset: plan.presetName,
    mode: plan.modeName,
    aspect_ratio: plan.preset.aspect_ratio,
    size: plan.preset.size,
    quality: plan.preset.quality,
    n: plan.preset.n,
    output_format: plan.preset.output_format,
    output_directory: plan.outputDirectory,
    size_request: sizeRequest,
    reference_images: plan.referenceImages.map((image) => ({
      path: image.path,
      mime_type: image.mime_type,
      bytes: image.bytes
    })),
    mask_image: plan.maskImage
      ? {
          path: plan.maskImage.path,
          mime_type: plan.maskImage.mime_type,
          bytes: plan.maskImage.bytes
        }
      : undefined
  };
}
