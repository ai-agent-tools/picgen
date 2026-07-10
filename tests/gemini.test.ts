import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGenerationRun } from "../src/assets/output.js";
import { defaultConfig } from "../src/config/defaults.js";
import {
  buildGeminiGenerateContentRequest,
  buildGeminiGenerateContentUrl,
  extractGeminiImages,
  GeminiAdapter
} from "../src/providers/gemini.js";
import { resolveGenerationPlan } from "../src/routing/resolve.js";
import type { ResolvedGenerationPlan } from "../src/types.js";

let tempDir: string;
let plan: ResolvedGenerationPlan;
let previousApiKey: string | undefined;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "picgen-gemini-test-"));
  const config = structuredClone(defaultConfig);
  config.routing.default_provider = "gemini_official";
  config.routing.fallback_providers = ["openai_official"];
  plan = resolveGenerationPlan(config, {
    prompt: "test prompt",
    presetName: "poster",
    outputDirectory: tempDir
  });
  previousApiKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
});

afterEach(async () => {
  if (previousApiKey === undefined) {
    delete process.env.GEMINI_API_KEY;
  } else {
    process.env.GEMINI_API_KEY = previousApiKey;
  }
  vi.unstubAllGlobals();
  await rm(tempDir, { recursive: true, force: true });
});

describe("Gemini generateContent adapter", () => {
  it("builds a generateContent URL", () => {
    expect(
      buildGeminiGenerateContentUrl(
        "https://generativelanguage.googleapis.com",
        "gemini-3.1-flash-image-preview"
      )
    ).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent"
    );
  });

  it("builds a generateContent image request", () => {
    expect(
      buildGeminiGenerateContentRequest(plan, [
        {
          inlineData: {
            mimeType: "image/png",
            data: "abc"
          }
        }
      ])
    ).toEqual({
      contents: [
        {
          role: "user",
          parts: [
            { text: "test prompt" },
            {
              inlineData: {
                mimeType: "image/png",
                data: "abc"
              }
            }
          ]
        }
      ],
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig: {
          aspectRatio: "3:4",
          imageSize: "1K"
        }
      }
    });
  });

  it("maps exact size overrides to Gemini aspect ratio and image size", () => {
    const overriddenPlan = resolveGenerationPlan(
      {
        ...defaultConfig,
        routing: {
          default_mode: "balanced",
          default_provider: "gemini_official",
          fallback_providers: ["openai_official"]
        }
      },
      {
        prompt: "test prompt",
        presetName: "poster",
        size: "1088x576",
        n: 2,
        outputDirectory: tempDir
      }
    );

    expect(buildGeminiGenerateContentRequest(overriddenPlan)).toMatchObject({
      generationConfig: {
        imageConfig: {
          aspectRatio: "16:9",
          imageSize: "1K"
        }
      }
    });
    expect(overriddenPlan.preset.n).toBe(2);
  });

  it("extracts inlineData image parts", () => {
    expect(
      extractGeminiImages({
        candidates: [
          {
            content: {
              parts: [
                { text: "ignored" },
                {
                  thought: true,
                  inlineData: {
                    data: "thought",
                    mimeType: "image/png"
                  }
                },
                {
                  inlineData: {
                    data: "abc",
                    mimeType: "image/png"
                  }
                },
                {
                  inline_data: {
                    data: "def",
                    mime_type: "image/jpeg"
                  }
                }
              ]
            }
          }
        ]
      })
    ).toEqual([
      { kind: "base64", data: "abc", mime_type: "image/png" },
      { kind: "base64", data: "def", mime_type: "image/jpeg" }
    ]);
  });

  it("calls generateContent once per requested image and writes files locally", async () => {
    const twoImagePlan = {
      ...plan,
      preset: {
        ...plan.preset,
        n: 2
      }
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(geminiResponse("first image", "image/png"))
      .mockResolvedValueOnce(geminiResponse("second image", "image/png"));
    vi.stubGlobal("fetch", fetchMock);

    const run = await createGenerationRun(twoImagePlan, new Date("2026-07-02T10:11:12"));
    const result = await new GeminiAdapter().generate(twoImagePlan, run);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-goog-api-key": "test-key",
          "Content-Type": "application/json"
        })
      })
    );
    expect(result.images.map((image) => image.path)).toEqual([
      join(run.outputDirectory, "image-1.png"),
      join(run.outputDirectory, "image-2.png")
    ]);
    await expect(readFile(result.images[0].path, "utf8")).resolves.toBe("first image");
    await expect(readFile(result.images[1].path, "utf8")).resolves.toBe("second image");
    expect(result.provider_response).toEqual([expect.any(Object), expect.any(Object)]);
  });

  it("sends reference images as inlineData parts", async () => {
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
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(geminiResponse("generated image 1", "image/png"))
      .mockResolvedValueOnce(geminiResponse("generated image 2", "image/png"));
    vi.stubGlobal("fetch", fetchMock);

    const run = await createGenerationRun(planWithReference, new Date("2026-07-02T10:11:12"));
    await new GeminiAdapter().generate(planWithReference, run);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.contents[0].parts).toEqual([
      { text: "test prompt" },
      {
        inlineData: {
          mimeType: "image/png",
          data: Buffer.from("reference image").toString("base64")
        }
      }
    ]);
  });

  it("sends masks as the final inlineData part with mask-guided instructions", async () => {
    const referencePath = join(tempDir, "reference.png");
    const maskPath = join(tempDir, "mask.png");
    await writeFile(referencePath, "reference image");
    await writeFile(maskPath, "mask image");
    const planWithMask = {
      ...plan,
      referenceImages: [
        {
          path: referencePath,
          mime_type: "image/png",
          bytes: 15
        }
      ],
      maskImage: {
        path: maskPath,
        mime_type: "image/png",
        bytes: 10
      }
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(geminiResponse("generated image 1", "image/png"))
      .mockResolvedValueOnce(geminiResponse("generated image 2", "image/png"));
    vi.stubGlobal("fetch", fetchMock);

    const run = await createGenerationRun(planWithMask, new Date("2026-07-02T10:11:12"));
    await new GeminiAdapter().generate(planWithMask, run);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.contents[0].parts[0].text).toContain("mask-guided edit");
    expect(body.contents[0].parts).toEqual([
      expect.objectContaining({
        text: expect.stringContaining("Only modify the area indicated by the mask")
      }),
      {
        inlineData: {
          mimeType: "image/png",
          data: Buffer.from("reference image").toString("base64")
        }
      },
      {
        inlineData: {
          mimeType: "image/png",
          data: Buffer.from("mask image").toString("base64")
        }
      }
    ]);
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

    await expect(new GeminiAdapter().generate(plan, run)).rejects.toThrow(
      "Gemini request failed: 400 Bad Request - bad request"
    );
  });
});

function geminiResponse(text: string, mimeType: string): Response {
  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  data: Buffer.from(text).toString("base64"),
                  mimeType
                }
              }
            ]
          }
        }
      ]
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" }
    }
  );
}
