import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import type {
  GeneratedImage,
  GenerationRun,
  ProviderImageOutput,
  ResolvedGenerationPlan
} from "../types.js";

export interface GenerationMetadata {
  plan: unknown;
  run: {
    id: string;
    output_directory: string;
    metadata_path: string;
    prompt_path: string;
  };
  provider_response?: unknown;
  error?: {
    message: string;
    name?: string;
  };
  images?: GeneratedImage[];
}

export async function createGenerationRun(
  plan: ResolvedGenerationPlan,
  now = new Date()
): Promise<GenerationRun> {
  const id = createRunId(plan, now);
  const dateFolder = formatDate(now);
  const outputDirectory = join(plan.outputDirectory, dateFolder, id);
  const metadataPath = join(outputDirectory, "metadata.json");
  const promptPath = join(outputDirectory, "prompt.txt");

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(promptPath, plan.prompt, "utf8");

  return {
    id,
    outputDirectory,
    metadataPath,
    promptPath
  };
}

export async function writeGenerationMetadata(
  run: GenerationRun,
  metadata: GenerationMetadata
): Promise<void> {
  await writeFile(run.metadataPath, JSON.stringify(redactGenerationMetadata(metadata), null, 2), "utf8");
}

export function redactGenerationMetadata(metadata: GenerationMetadata): GenerationMetadata {
  return {
    ...metadata,
    provider_response:
      metadata.provider_response === undefined
        ? undefined
        : redactProviderImageData(metadata.provider_response)
  };
}

export async function writeProviderImage(
  run: GenerationRun,
  image: ProviderImageOutput,
  index: number
): Promise<GeneratedImage> {
  const normalized = await normalizeProviderImage(image);
  const id = `image-${index + 1}`;
  const extension = extensionForMimeType(normalized.mime_type);
  const path = join(run.outputDirectory, `${id}.${extension}`);

  await writeFile(path, normalized.data);

  return {
    id,
    path,
    mime_type: normalized.mime_type,
    metadata_path: run.metadataPath
  };
}

export async function writeProviderImages(
  run: GenerationRun,
  images: ProviderImageOutput[]
): Promise<GeneratedImage[]> {
  const results: GeneratedImage[] = [];
  for (const [index, image] of images.entries()) {
    results.push(await writeProviderImage(run, image, index));
  }
  return results;
}

async function normalizeProviderImage(
  image: ProviderImageOutput
): Promise<{ data: Uint8Array; mime_type: string }> {
  if (image.kind === "bytes") {
    return {
      data: image.data,
      mime_type: image.mime_type
    };
  }

  if (image.kind === "base64") {
    const parsed = parseBase64Image(image.data);
    return {
      data: parsed.data,
      mime_type: image.mime_type ?? parsed.mime_type ?? "image/png"
    };
  }

  const response = await fetch(image.url);
  if (!response.ok) {
    throw new Error(`Failed to download generated image: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim();
  return {
    data: new Uint8Array(await response.arrayBuffer()),
    mime_type: image.mime_type ?? contentType ?? mimeTypeFromUrl(image.url) ?? "image/png"
  };
}

function parseBase64Image(data: string): { data: Uint8Array; mime_type?: string } {
  const dataUrlMatch = /^data:([^;]+);base64,(.+)$/s.exec(data);
  const mimeType = dataUrlMatch?.[1];
  const encoded = dataUrlMatch?.[2] ?? data;
  return {
    data: Buffer.from(encoded, "base64"),
    mime_type: mimeType
  };
}

function extensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/png":
      return "png";
    default:
      return "bin";
  }
}

function mimeTypeFromUrl(url: string): string | undefined {
  const extension = extname(basename(new URL(url).pathname)).toLowerCase();
  switch (extension) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".png":
      return "image/png";
    default:
      return undefined;
  }
}

function createRunId(plan: ResolvedGenerationPlan, date: Date): string {
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}-${padMilliseconds(
    date.getMilliseconds()
  )}`;
  const preset = slug(plan.presetName);
  const provider = slug(plan.providerName);
  return `${time}-${preset}-${provider}`;
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function padMilliseconds(value: number): string {
  return String(value).padStart(3, "0");
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function redactProviderImageData(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactProviderImageData(item));
  }

  if (!value || typeof value !== "object") {
    return shouldRedactImageDataKey(key) && typeof value === "string"
      ? redactedProviderDataPlaceholder(value)
      : value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      redactProviderImageData(entryValue, entryKey)
    ])
  );
}

function shouldRedactImageDataKey(key: string | undefined): boolean {
  return (
    key === "b64_json" ||
    key === "data" ||
    key === "thoughtSignature" ||
    key === "thought_signature"
  );
}

function redactedProviderDataPlaceholder(value: string): string {
  return `[redacted provider data: ${value.length} chars]`;
}
