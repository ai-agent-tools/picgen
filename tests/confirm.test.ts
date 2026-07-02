import { describe, expect, it } from "vitest";
import { confirmGeneration, formatGenerationPreview } from "../src/commands/confirm.js";
import type { GenerationPlanOutput } from "../src/commands/create.js";

const plan: GenerationPlanOutput = {
  prompt: "test prompt",
  provider: "openai_official",
  protocol: "openai-images",
  channel: "official",
  model: "gpt-image-2",
  preset: "poster",
  mode: "premium",
  aspect_ratio: "3:4",
  size: "large",
  quality: "high",
  n: 2,
  output_format: "png",
  output_directory: "/tmp/picgen",
  reference_images: []
};

describe("generation confirmation", () => {
  it("formats a compact generation preview", () => {
    expect(formatGenerationPreview(plan)).toContain("Provider: openai_official (openai-images)");
    expect(formatGenerationPreview(plan)).toContain("Model: gpt-image-2");
    expect(formatGenerationPreview(plan)).toContain("Images: 2");
    expect(formatGenerationPreview(plan)).toContain("Reference images: 0");
    expect(formatGenerationPreview(plan)).toContain("Output: /tmp/picgen");
  });

  it("skips interactive confirmation when --yes is used", async () => {
    await expect(confirmGeneration(plan, { yes: true })).resolves.toEqual({
      confirmed: true,
      skipped: true
    });
  });
});
