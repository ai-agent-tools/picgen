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
  const dimensions = readImageDimensions(normalized.data, normalized.mime_type);

  return {
    id,
    path,
    mime_type: normalized.mime_type,
    metadata_path: run.metadataPath,
    width: dimensions?.width,
    height: dimensions?.height
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

function readImageDimensions(
  data: Uint8Array,
  mimeType: string
): { width: number; height: number } | undefined {
  const buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);

  if (mimeType === "image/png") {
    return readPngDimensions(buffer);
  }

  if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
    return readJpegDimensions(buffer);
  }

  if (mimeType === "image/webp") {
    return readWebpDimensions(buffer);
  }

  return undefined;
}

function readPngDimensions(buffer: Buffer): { width: number; height: number } | undefined {
  if (
    buffer.length < 24 ||
    buffer[0] !== 0x89 ||
    buffer.toString("ascii", 1, 4) !== "PNG" ||
    buffer.toString("ascii", 12, 16) !== "IHDR"
  ) {
    return undefined;
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function readJpegDimensions(buffer: Buffer): { width: number; height: number } | undefined {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return undefined;
  }

  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) return undefined;

    const marker = buffer[offset + 1];
    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2 || offset + 2 + segmentLength > buffer.length) return undefined;

    if (isJpegStartOfFrame(marker)) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7)
      };
    }

    offset += 2 + segmentLength;
  }

  return undefined;
}

function isJpegStartOfFrame(marker: number): boolean {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function readWebpDimensions(buffer: Buffer): { width: number; height: number } | undefined {
  if (
    buffer.length < 30 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return undefined;
  }

  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkType = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkDataOffset = offset + 8;
    if (chunkDataOffset + chunkSize > buffer.length) return undefined;

    if (chunkType === "VP8X" && chunkSize >= 10) {
      return {
        width: 1 + buffer.readUIntLE(chunkDataOffset + 4, 3),
        height: 1 + buffer.readUIntLE(chunkDataOffset + 7, 3)
      };
    }

    if (chunkType === "VP8L" && chunkSize >= 5 && buffer[chunkDataOffset] === 0x2f) {
      const b1 = buffer[chunkDataOffset + 1];
      const b2 = buffer[chunkDataOffset + 2];
      const b3 = buffer[chunkDataOffset + 3];
      const b4 = buffer[chunkDataOffset + 4];
      return {
        width: 1 + (((b2 & 0x3f) << 8) | b1),
        height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6))
      };
    }

    if (
      chunkType === "VP8 " &&
      chunkSize >= 10 &&
      buffer[chunkDataOffset + 3] === 0x9d &&
      buffer[chunkDataOffset + 4] === 0x01 &&
      buffer[chunkDataOffset + 5] === 0x2a
    ) {
      return {
        width: buffer.readUInt16LE(chunkDataOffset + 6) & 0x3fff,
        height: buffer.readUInt16LE(chunkDataOffset + 8) & 0x3fff
      };
    }

    offset = chunkDataOffset + chunkSize + (chunkSize % 2);
  }

  return undefined;
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
