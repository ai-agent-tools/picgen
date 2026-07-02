import { writeProviderImages } from "../assets/output.js";
import type {
  GenerationRun,
  ProviderImageOutput,
  ProviderGenerationResult,
  ResolvedGenerationPlan
} from "../types.js";

export interface OpenAIImagesResponse {
  created?: number;
  data?: Array<{
    b64_json?: string;
    url?: string;
    revised_prompt?: string;
  }>;
  [key: string]: unknown;
}

export class OpenAIImagesAdapter {
  readonly protocol = "openai-images" as const;

  async generate(
    plan: ResolvedGenerationPlan,
    run: GenerationRun
  ): Promise<ProviderGenerationResult> {
    const apiKey = process.env[plan.provider.api_key_env];
    if (!apiKey) {
      throw new Error(`Missing API key environment variable: ${plan.provider.api_key_env}`);
    }

    const response = await fetch(buildOpenAIImagesUrl(plan.provider.base_url), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(buildOpenAIImagesRequest(plan))
    });

    const raw = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(formatOpenAIImagesError(response.status, response.statusText, raw));
    }

    const providerImages = extractOpenAIImages(raw);
    const images = await writeProviderImages(run, providerImages);
    const revisedPrompts = raw.data?.map((item) => item.revised_prompt);

    return {
      images: images.map((image, index) => ({
        ...image,
        revised_prompt: revisedPrompts?.[index]
      })),
      provider_response: raw
    };
  }
}

export function buildOpenAIImagesRequest(plan: ResolvedGenerationPlan): Record<string, unknown> {
  return removeUndefined({
    model: plan.model,
    prompt: plan.prompt,
    n: plan.preset.n,
    size: mapOpenAIImageSize(plan.preset.aspect_ratio, plan.preset.size),
    quality: mapOpenAIImageQuality(plan.preset.quality),
    output_format: plan.preset.output_format,
    response_format: "b64_json"
  });
}

export function extractOpenAIImages(response: OpenAIImagesResponse): ProviderImageOutput[] {
  if (!Array.isArray(response.data) || response.data.length === 0) {
    throw new Error("OpenAI images response did not include generated image data.");
  }

  return response.data.map((item, index) => {
    if (item.b64_json) {
      return {
        kind: "base64",
        data: item.b64_json,
        mime_type: undefined
      };
    }

    if (item.url) {
      return {
        kind: "url",
        url: item.url,
        mime_type: undefined
      };
    }

    throw new Error(`OpenAI images response item ${index + 1} did not include b64_json or url.`);
  });
}

function buildOpenAIImagesUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/images/generations`;
}

function mapOpenAIImageSize(aspectRatio: string, size: string): string | undefined {
  if (/^\d+x\d+$/.test(size) || size === "auto") return size;

  switch (aspectRatio) {
    case "3:4":
    case "2:3":
      return "1024x1536";
    case "4:3":
    case "3:2":
    case "16:9":
    case "9:5":
      return "1536x1024";
    case "1:1":
      return "1024x1024";
    default:
      return "auto";
  }
}

function mapOpenAIImageQuality(quality: string): string | undefined {
  if (["low", "medium", "high", "auto"].includes(quality)) return quality;
  return undefined;
}

function removeUndefined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

async function readJsonResponse(response: Response): Promise<OpenAIImagesResponse> {
  const text = await response.text();
  if (!text.trim()) return {};

  try {
    return JSON.parse(text) as OpenAIImagesResponse;
  } catch {
    throw new Error("OpenAI images response was not valid JSON.");
  }
}

function formatOpenAIImagesError(
  status: number,
  statusText: string,
  response: OpenAIImagesResponse
): string {
  const message = extractErrorMessage(response);
  return `OpenAI images request failed: ${status} ${statusText}${message ? ` - ${message}` : ""}`;
}

function extractErrorMessage(response: OpenAIImagesResponse): string | undefined {
  const error = response.error;
  if (typeof error === "object" && error && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : undefined;
  }
  return undefined;
}
