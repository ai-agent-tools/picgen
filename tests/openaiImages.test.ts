import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGenerationRun } from "../src/assets/output.js";
import { defaultConfig } from "../src/config/defaults.js";
import {
  buildOpenAIImagesRequest,
  extractOpenAIImages,
  OpenAIImagesAdapter
} from "../src/providers/openaiImages.js";
import { resolveGenerationPlan } from "../src/routing/resolve.js";
import type { ResolvedGenerationPlan } from "../src/types.js";

let tempDir: string;
let plan: ResolvedGenerationPlan;
let previousApiKey: string | undefined;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "picgen-openai-test-"));
  plan = resolveGenerationPlan(defaultConfig, {
    prompt: "test prompt",
    presetName: "poster",
    outputDirectory: tempDir
  });
  previousApiKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
});

afterEach(async () => {
  if (previousApiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = previousApiKey;
  }
  vi.unstubAllGlobals();
  await rm(tempDir, { recursive: true, force: true });
});

describe("OpenAI images adapter", () => {
  it("builds an OpenAI-compatible image generation request", () => {
    expect(buildOpenAIImagesRequest(plan)).toEqual({
      model: "gpt-image-2",
      prompt: "test prompt",
      n: 2,
      size: "1024x1536",
      quality: "high",
      output_format: "png",
      response_format: "b64_json"
    });
  });

  it("extracts b64 and URL image outputs", () => {
    expect(
      extractOpenAIImages({
        data: [
          { b64_json: "abc" },
          { url: "https://example.com/image.png", revised_prompt: "revised" }
        ]
      })
    ).toEqual([
      { kind: "base64", data: "abc", mime_type: undefined },
      { kind: "url", url: "https://example.com/image.png", mime_type: undefined }
    ]);
  });

  it("calls the provider and writes generated b64 images locally", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          created: 1,
          data: [
            {
              b64_json: Buffer.from("fake image").toString("base64"),
              revised_prompt: "revised prompt"
            }
          ]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const run = await createGenerationRun(plan, new Date("2026-07-02T10:11:12"));
    const result = await new OpenAIImagesAdapter().generate(plan, run);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/images/generations",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
          "Content-Type": "application/json"
        })
      })
    );
    expect(result.images).toEqual([
      expect.objectContaining({
        id: "image-1",
        path: join(run.outputDirectory, "image-1.png"),
        mime_type: "image/png",
        revised_prompt: "revised prompt"
      })
    ]);
    expect(result.provider_response).toEqual(
      expect.objectContaining({
        created: 1
      })
    );
    await expect(readFile(result.images[0].path, "utf8")).resolves.toBe("fake image");
  });

  it("surfaces provider error messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "bad request" } }), {
          status: 400,
          statusText: "Bad Request",
          headers: { "content-type": "application/json" }
        })
      )
    );

    const run = await createGenerationRun(plan, new Date("2026-07-02T10:11:12"));

    await expect(new OpenAIImagesAdapter().generate(plan, run)).rejects.toThrow(
      "OpenAI images request failed: 400 Bad Request - bad request"
    );
  });
});
