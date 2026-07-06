import { readFile } from "node:fs/promises";
import { writeProviderImages } from "../assets/output.js";
import { fetchWithProviderTimeout, resolveProviderTimeoutMs } from "./timeout.js";
import { buildGeminiProtocolUrl } from "./urls.js";
import type {
  GenerationRun,
  ProviderGenerationResult,
  ProviderImageOutput,
  ResolvedGenerationPlan
} from "../types.js";

export interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        thought?: boolean;
        inlineData?: {
          data?: string;
          mimeType?: string;
        };
        inline_data?: {
          data?: string;
          mime_type?: string;
        };
      }>;
    };
  }>;
  [key: string]: unknown;
}

export class GeminiAdapter {
  readonly protocol = "gemini" as const;

  async generate(
    plan: ResolvedGenerationPlan,
    run: GenerationRun
  ): Promise<ProviderGenerationResult> {
    const apiKey = process.env[plan.provider.api_key_env];
    if (!apiKey) {
      throw new Error(`Missing API key environment variable: ${plan.provider.api_key_env}`);
    }

    const responses: GeminiGenerateContentResponse[] = [];
    const providerImages: ProviderImageOutput[] = [];
    const requestCount = Math.max(1, plan.preset.n);
    const referenceParts = await readReferenceImageParts(plan);
    const timeoutMs = resolveProviderTimeoutMs(plan);

    for (let index = 0; index < requestCount; index += 1) {
      const response = await fetchWithProviderTimeout(
        buildGeminiGenerateContentUrl(plan.provider.base_url, plan.model),
        {
          method: "POST",
          headers: {
            "x-goog-api-key": apiKey,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(buildGeminiGenerateContentRequest(plan, referenceParts))
        },
        timeoutMs
      );

      const raw = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(formatGeminiError(response.status, response.statusText, raw));
      }

      responses.push(raw);
      providerImages.push(...extractGeminiImages(raw));
    }

    const images = await writeProviderImages(run, providerImages);
    return {
      images,
      provider_response: responses.length === 1 ? responses[0] : responses
    };
  }
}

export function buildGeminiGenerateContentRequest(
  plan: ResolvedGenerationPlan,
  referenceParts: Array<Record<string, unknown>> = []
): Record<string, unknown> {
  return {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: buildGeminiPrompt(plan)
          },
          ...referenceParts
        ]
      }
    ],
    generationConfig: {
      responseModalities: ["IMAGE"],
      imageConfig: removeUndefined({
        aspectRatio: plan.preset.aspect_ratio,
        imageSize: mapGeminiImageSize(plan.preset.size)
      })
    }
  };
}

async function readReferenceImageParts(plan: ResolvedGenerationPlan): Promise<Array<Record<string, unknown>>> {
  const images = plan.maskImage ? [...plan.referenceImages, plan.maskImage] : plan.referenceImages;
  return Promise.all(
    images.map(async (image) => ({
      inlineData: {
        mimeType: image.mime_type,
        data: (await readFile(image.path)).toString("base64")
      }
    }))
  );
}

function buildGeminiPrompt(plan: ResolvedGenerationPlan): string {
  if (!plan.maskImage) return plan.prompt;
  return [
    "Use the provided images for a mask-guided edit.",
    "The first image(s) are source/reference images. The final image is the mask.",
    "Only modify the area indicated by the mask as much as possible, and preserve the rest of the source image.",
    "",
    plan.prompt
  ].join("\n");
}

export function extractGeminiImages(
  response: GeminiGenerateContentResponse
): ProviderImageOutput[] {
  const parts = response.candidates?.flatMap((candidate) => candidate.content?.parts ?? []) ?? [];
  const imageParts = parts
    .filter((part) => part.thought !== true)
    .map((part) => part.inlineData ?? normalizeInlineData(part.inline_data))
    .filter(Boolean);

  if (imageParts.length === 0) {
    throw new Error("Gemini response did not include generated image data.");
  }

  return imageParts.map((image, index) => {
    if (!image?.data) {
      throw new Error(`Gemini image part ${index + 1} did not include base64 data.`);
    }

    return {
      kind: "base64",
      data: image.data,
      mime_type: image.mimeType ?? "image/png"
    };
  });
}

export function buildGeminiGenerateContentUrl(baseUrl: string, model: string): string {
  return buildGeminiProtocolUrl(baseUrl, `models/${encodeURIComponent(model)}:generateContent`);
}

function normalizeInlineData(
  inlineData:
    | {
        data?: string;
        mime_type?: string;
      }
    | undefined
): { data?: string; mimeType?: string } | undefined {
  if (!inlineData) return undefined;
  return {
    data: inlineData.data,
    mimeType: inlineData.mime_type
  };
}

function mapGeminiImageSize(size: string): string | undefined {
  switch (size) {
    case "small":
      return "512";
    case "medium":
      return "1K";
    case "large":
      return "2K";
    case "auto":
      return undefined;
    default:
      return /^(512|1K|2K|4K)$/.test(size) ? size : undefined;
  }
}

function removeUndefined<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<T>;
}

async function readJsonResponse(response: Response): Promise<GeminiGenerateContentResponse> {
  const text = await response.text();
  if (!text.trim()) return {};

  try {
    return JSON.parse(text) as GeminiGenerateContentResponse;
  } catch {
    throw new Error("Gemini response was not valid JSON.");
  }
}

function formatGeminiError(
  status: number,
  statusText: string,
  response: GeminiGenerateContentResponse
): string {
  const message = extractErrorMessage(response);
  return `Gemini request failed: ${status} ${statusText}${message ? ` - ${message}` : ""}`;
}

function extractErrorMessage(response: GeminiGenerateContentResponse): string | undefined {
  const error = response.error;
  if (typeof error === "object" && error && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : undefined;
  }
  return undefined;
}
