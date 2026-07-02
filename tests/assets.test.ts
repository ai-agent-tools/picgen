import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createGenerationRun,
  writeGenerationMetadata,
  writeProviderImage,
  writeProviderImages
} from "../src/assets/output.js";
import { defaultConfig } from "../src/config/defaults.js";
import { resolveGenerationPlan } from "../src/routing/resolve.js";
import type { ResolvedGenerationPlan } from "../src/types.js";

let tempDir: string;
let plan: ResolvedGenerationPlan;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "picgen-assets-test-"));
  plan = resolveGenerationPlan(defaultConfig, {
    prompt: "test prompt",
    presetName: "poster",
    outputDirectory: tempDir
  });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("generation output assets", () => {
  it("creates a run directory with prompt and metadata paths", async () => {
    const run = await createGenerationRun(plan, new Date("2026-07-02T10:11:12"));

    expect(run.id).toBe("101112-000-poster-openai-official");
    expect(run.outputDirectory).toBe(join(tempDir, "2026-07-02", run.id));
    await expect(stat(run.promptPath)).resolves.toMatchObject({ isFile: expect.any(Function) });
    await expect(readFile(run.promptPath, "utf8")).resolves.toBe("test prompt");
  });

  it("writes metadata JSON", async () => {
    const run = await createGenerationRun(plan, new Date("2026-07-02T10:11:12"));

    await writeGenerationMetadata(run, {
      plan: { prompt: "test prompt" },
      run: {
        id: run.id,
        output_directory: run.outputDirectory,
        metadata_path: run.metadataPath,
        prompt_path: run.promptPath
      }
    });

    const metadata = JSON.parse(await readFile(run.metadataPath, "utf8"));
    expect(metadata.run.id).toBe(run.id);
    expect(metadata.plan.prompt).toBe("test prompt");
  });

  it("writes base64 image data to a local file", async () => {
    const run = await createGenerationRun(plan, new Date("2026-07-02T10:11:12"));

    const image = await writeProviderImage(
      run,
      {
        kind: "base64",
        data: Buffer.from("fake png").toString("base64"),
        mime_type: "image/png"
      },
      0
    );

    expect(image).toMatchObject({
      id: "image-1",
      path: join(run.outputDirectory, "image-1.png"),
      mime_type: "image/png",
      metadata_path: run.metadataPath
    });
    await expect(readFile(image.path, "utf8")).resolves.toBe("fake png");
  });

  it("writes multiple byte images with mime-specific extensions", async () => {
    const run = await createGenerationRun(plan, new Date("2026-07-02T10:11:12"));

    const images = await writeProviderImages(run, [
      {
        kind: "bytes",
        data: new TextEncoder().encode("jpeg"),
        mime_type: "image/jpeg"
      },
      {
        kind: "bytes",
        data: new TextEncoder().encode("webp"),
        mime_type: "image/webp"
      }
    ]);

    expect(images.map((image) => image.path)).toEqual([
      join(run.outputDirectory, "image-1.jpg"),
      join(run.outputDirectory, "image-2.webp")
    ]);
  });
});
