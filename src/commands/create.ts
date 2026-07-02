import YAML from "yaml";
import { createGenerationRun, writeGenerationMetadata } from "../assets/output.js";
import { loadConfig } from "../config/store.js";
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
  outDir?: string;
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
}

export async function runCreate(promptParts: string[], options: CreateOptions): Promise<void> {
  const prompt = promptParts.join(" ").trim();
  if (!prompt) {
    throw new Error("Prompt is required.");
  }

  const config = await loadConfig();
  const plan = resolveGenerationPlan(config, {
    prompt,
    presetName: options.preset,
    providerName: options.provider,
    modeName: options.mode,
    model: options.model,
    outputDirectory: options.outDir
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

export function toPlanOutput(plan: ResolvedGenerationPlan): GenerationPlanOutput {
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
    output_directory: plan.outputDirectory
  };
}
