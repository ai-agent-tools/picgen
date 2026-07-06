import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGenerationRun } from "../src/assets/output.js";
import { defaultConfig } from "../src/config/defaults.js";
import {
  buildOpenAIImagesEditFormData,
  buildOpenAIImagesFetchInit,
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
  it("builds an OpenAI-compatible image generation request", async () => {
    expect(buildOpenAIImagesRequest(plan)).toEqual({
      model: "gpt-image-2",
      prompt: "test prompt",
      n: 1,
      size: "1024x1536",
      quality: "high",
      output_format: "png",
      response_format: "b64_json"
    });
  });

  it("builds an OpenAI-compatible multipart image edit request with references and mask", async () => {
    const referencePath = join(tempDir, "reference.png");
    const maskPath = join(tempDir, "mask.png");
    await writeFile(referencePath, "reference image");
    await writeFile(maskPath, "mask image");
    const planWithReference = {
      ...plan,
      referenceImages: [
        {
          path: referencePath,
          mime_type: "image/png",
          bytes: 123
        }
      ],
      maskImage: {
        path: maskPath,
        mime_type: "image/png",
        bytes: 456
      }
    };

    const form = await buildOpenAIImagesEditFormData(planWithReference);
    expect(form.get("model")).toBe("gpt-image-2");
    expect(form.get("prompt")).toBe("test prompt");
    expect(form.get("n")).toBe("1");
    expect(form.get("size")).toBe("1024x1536");
    expect(form.get("quality")).toBe("high");
    expect(form.get("output_format")).toBe("png");
    expect(form.getAll("image[]")).toHaveLength(1);
    await expect((form.get("image[]") as Blob).text()).resolves.toBe("reference image");
    await expect((form.get("mask") as Blob).text()).resolves.toBe("mask image");
  });

  it("uses JSON for generations and multipart without manual content-type for edits", async () => {
    const referencePath = join(tempDir, "reference.png");
    await writeFile(referencePath, "reference image");
    const planWithReference = {
      ...plan,
      referenceImages: [
        {
          path: referencePath,
          mime_type: "image/png",
          bytes: 15
        }
      ]
    };

    const generationInit = await buildOpenAIImagesFetchInit(plan, "test-key");
    expect(generationInit.headers).toEqual(
      expect.objectContaining({
        Authorization: "Bearer test-key",
        "Content-Type": "application/json"
      })
    );
    expect(typeof generationInit.body).toBe("string");

    const editInit = await buildOpenAIImagesFetchInit(planWithReference, "test-key");
    expect(editInit.headers).toEqual({
      Authorization: "Bearer test-key"
    });
    expect(editInit.body).toBeInstanceOf(FormData);
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

  it("calls the edits endpoint when reference images are provided", async () => {
    const referencePath = join(tempDir, "reference.png");
    await writeFile(referencePath, "reference image");
    const planWithReference = {
      ...plan,
      referenceImages: [
        {
          path: referencePath,
          mime_type: "image/png",
          bytes: 15
        }
      ]
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ b64_json: Buffer.from("edited image").toString("base64") }]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const run = await createGenerationRun(planWithReference, new Date("2026-07-02T10:11:12"));
    await new OpenAIImagesAdapter().generate(planWithReference, run);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/images/edits",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer test-key"
        },
        body: expect.any(FormData)
      })
    );
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
