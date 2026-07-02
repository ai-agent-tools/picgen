import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import YAML from "yaml";
import { loadConfig } from "../config/store.js";
import { getAdapter } from "../providers/adapters.js";
import { resolveGenerationPlan } from "../routing/resolve.js";
import type { ResolvedGenerationPlan } from "../types.js";

export interface CreateOptions {
  dryRun?: boolean;
  preset?: string;
  provider?: string;
  mode?: string;
  model?: string;
  outDir?: string;
  json?: boolean;
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

  await mkdir(plan.outputDirectory, { recursive: true });
  const metadataPath = join(plan.outputDirectory, `picgen-${Date.now()}.json`);
  await writeFile(metadataPath, JSON.stringify({ plan: planOutput }, null, 2), "utf8");

  const adapter = getAdapter(plan.provider.protocol);
  const results = await adapter.generate(plan);
  console.log(
    JSON.stringify(
      {
        ok: true,
        dry_run: false,
        output_dir: plan.outputDirectory,
        metadata_path: metadataPath,
        images: results
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
