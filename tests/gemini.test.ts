import { mkdtemp, readFile, rm } from "node:fs/promises";
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
    expect(buildGeminiGenerateContentRequest(plan)).toEqual({
      contents: [
        {
          role: "user",
          parts: [{ text: "test prompt" }]
        }
      ],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        responseFormat: {
          image: {
            aspectRatio: "3:4",
            imageSize: "2K"
          }
        }
      }
    });
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
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(geminiResponse("first image", "image/png"))
      .mockResolvedValueOnce(geminiResponse("second image", "image/png"));
    vi.stubGlobal("fetch", fetchMock);

    const run = await createGenerationRun(plan, new Date("2026-07-02T10:11:12"));
    const result = await new GeminiAdapter().generate(plan, run);

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
