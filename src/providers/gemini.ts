import { writeProviderImages } from "../assets/output.js";
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

    for (let index = 0; index < requestCount; index += 1) {
      const response = await fetch(buildGeminiGenerateContentUrl(plan.provider.base_url, plan.model), {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(buildGeminiGenerateContentRequest(plan))
      });

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
  plan: ResolvedGenerationPlan
): Record<string, unknown> {
  return {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: plan.prompt
          }
        ]
      }
    ],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"]
    }
  };
}

export function extractGeminiImages(
  response: GeminiGenerateContentResponse
): ProviderImageOutput[] {
  const parts = response.candidates?.flatMap((candidate) => candidate.content?.parts ?? []) ?? [];
  const imageParts = parts
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
