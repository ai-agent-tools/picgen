export interface PixelSize {
  width: number;
  height: number;
}

export interface GeminiImageConfig extends Record<string, unknown> {
  aspectRatio: string;
  imageSize?: string;
}

export interface OpenAIImageSizePlan {
  requested_size: string;
  provider_size?: string;
  size_adjusted: boolean;
  size_note?: string;
}

const OPENAI_MIN_PIXELS = 655_360;
const OPENAI_MAX_PIXELS = 8_294_400;
const OPENAI_MAX_EDGE = 3840;
const OPENAI_SIZE_MULTIPLE = 16;

const SUPPORTED_GEMINI_RATIOS = [
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9"
];

export function parsePixelSize(size: string): PixelSize | undefined {
  const match = /^(\d+)x(\d+)$/i.exec(size.trim());
  if (!match) return undefined;

  return {
    width: Number(match[1]),
    height: Number(match[2])
  };
}

export function parseAspectRatio(ratio: string): PixelSize | undefined {
  const match = /^(\d+):(\d+)$/.exec(ratio.trim());
  if (!match) return undefined;

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width <= 0 || height <= 0) return undefined;

  return { width, height };
}

export function aspectRatioFromPixelSize(size: PixelSize): string {
  const divisor = gcd(size.width, size.height);
  return `${size.width / divisor}:${size.height / divisor}`;
}

export function validateOpenAIPixelSize(size: PixelSize): void {
  if (size.width <= 0 || size.height <= 0) {
    throw new Error("Image size must be positive.");
  }

  if (size.width % 16 !== 0 || size.height % 16 !== 0) {
    throw new Error("OpenAI image size must have width and height divisible by 16.");
  }

  const ratio = size.width / size.height;
  if (ratio < 1 / 3 || ratio > 3) {
    throw new Error("OpenAI image size aspect ratio must be between 1:3 and 3:1.");
  }

  if (size.width > 3840 || size.height > 3840) {
    throw new Error("OpenAI image size cannot exceed 3840 pixels on either edge.");
  }

  const pixels = size.width * size.height;
  if (pixels < OPENAI_MIN_PIXELS) {
    throw new Error("OpenAI image size is below the current minimum pixel budget.");
  }

  if (pixels > OPENAI_MAX_PIXELS) {
    throw new Error("OpenAI image size exceeds the current maximum pixel budget.");
  }
}

export function openAIImageSizeFor(aspectRatio: string, size: string): string | undefined {
  return openAIImageSizePlanFor(aspectRatio, size).provider_size;
}

export function openAIImageSizePlanFor(aspectRatio: string, size: string): OpenAIImageSizePlan {
  const pixelSize = parsePixelSize(size);
  if (pixelSize) {
    const normalized = normalizeOpenAIPixelSize(pixelSize);
    const providerSize = formatPixelSize(normalized);
    const requestedSize = formatPixelSize(pixelSize);
    return {
      requested_size: requestedSize,
      provider_size: providerSize,
      size_adjusted: providerSize !== requestedSize,
      size_note:
        providerSize === requestedSize
          ? "OpenAI-compatible providers may still return a different final pixel size; PicGen saves the provider result without resizing."
          : `Adjusted to ${providerSize} to satisfy OpenAI image size rules. Providers may still return a different final pixel size; PicGen saves the provider result without resizing.`
    };
  }

  if (size === "auto") {
    return {
      requested_size: size,
      provider_size: "auto",
      size_adjusted: false,
      size_note:
        "Provider will choose the request size automatically. Final pixel size depends on the model/provider response."
    };
  }

  const ratio = parseAspectRatio(aspectRatio);
  if (!ratio) {
    return {
      requested_size: size,
      provider_size: "auto",
      size_adjusted: true,
      size_note:
        "Aspect ratio could not be parsed, so PicGen will ask the provider to choose a size automatically."
    };
  }

  const longEdge = size === "small" ? 512 : 1024;
  const requested = pixelSizeForLongEdge(ratio, longEdge);
  const normalized = normalizeOpenAIPixelSize(requested);
  const requestedSize = formatPixelSize(requested);
  const providerSize = formatPixelSize(normalized);
  return {
    requested_size: size,
    provider_size: providerSize,
    size_adjusted: providerSize !== requestedSize,
    size_note:
      providerSize === requestedSize
        ? "OpenAI-compatible providers may still return a different final pixel size; PicGen saves the provider result without resizing."
        : `Preset size ${size} maps to ${requestedSize}, adjusted to ${providerSize} to satisfy OpenAI image size rules. Providers may still return a different final pixel size; PicGen saves the provider result without resizing.`
  };
}

export function geminiImageConfigFor(aspectRatio: string, size: string): GeminiImageConfig {
  const pixelSize = parsePixelSize(size);
  if (pixelSize) {
    return {
      aspectRatio: nearestGeminiAspectRatio(pixelSize),
      imageSize: geminiImageSizeForPixelSize(pixelSize)
    };
  }

  return {
    aspectRatio: nearestGeminiAspectRatio(parseAspectRatio(aspectRatio) ?? { width: 1, height: 1 }),
    imageSize: geminiImageSizeForSymbolicSize(size)
  };
}

export function nearestGeminiAspectRatio(size: PixelSize): string {
  const target = size.width / size.height;
  return SUPPORTED_GEMINI_RATIOS.reduce((best, candidate) => {
    const parsed = parseAspectRatio(candidate);
    if (!parsed) return best;

    const candidateDistance = Math.abs(parsed.width / parsed.height - target);
    const bestParsed = parseAspectRatio(best);
    const bestDistance = bestParsed
      ? Math.abs(bestParsed.width / bestParsed.height - target)
      : Number.POSITIVE_INFINITY;
    return candidateDistance < bestDistance ? candidate : best;
  }, "1:1");
}

function geminiImageSizeForPixelSize(size: PixelSize): string {
  const longEdge = Math.max(size.width, size.height);
  if (longEdge <= 1536) return "1K";
  if (longEdge <= 2048) return "2K";
  return "4K";
}

function geminiImageSizeForSymbolicSize(size: string): string | undefined {
  switch (size) {
    case "small":
    case "medium":
    case "large":
      return "1K";
    case "auto":
      return undefined;
    default:
      return /^(1K|2K|4K)$/i.test(size) ? size.toUpperCase() : undefined;
  }
}

function pixelSizeForLongEdge(ratio: PixelSize, longEdge: number): PixelSize {
  const landscape = ratio.width >= ratio.height;
  const width = landscape ? longEdge : Math.round((longEdge * ratio.width) / ratio.height);
  const height = landscape ? Math.round((longEdge * ratio.height) / ratio.width) : longEdge;
  return {
    width: roundToMultiple(width, 16),
    height: roundToMultiple(height, 16)
  };
}

function normalizeOpenAIPixelSize(size: PixelSize): PixelSize {
  if (size.width <= 0 || size.height <= 0) {
    throw new Error("Image size must be positive.");
  }

  const ratio = size.width / size.height;
  if (ratio < 1 / 3 || ratio > 3) {
    throw new Error("OpenAI image size aspect ratio must be between 1:3 and 3:1.");
  }

  let normalized = {
    width: ceilToMultiple(size.width, OPENAI_SIZE_MULTIPLE),
    height: ceilToMultiple(size.height, OPENAI_SIZE_MULTIPLE)
  };

  normalized = scaleToPixelBudget(normalized);

  if (normalized.width > OPENAI_MAX_EDGE || normalized.height > OPENAI_MAX_EDGE) {
    throw new Error("OpenAI image size cannot exceed 3840 pixels on either edge.");
  }

  validateOpenAIPixelSize(normalized);
  return normalized;
}

function scaleToPixelBudget(size: PixelSize): PixelSize {
  const pixels = size.width * size.height;
  if (pixels >= OPENAI_MIN_PIXELS && pixels <= OPENAI_MAX_PIXELS) return size;

  const scale =
    pixels < OPENAI_MIN_PIXELS
      ? Math.sqrt(OPENAI_MIN_PIXELS / pixels)
      : Math.sqrt(OPENAI_MAX_PIXELS / pixels);

  const width =
    pixels < OPENAI_MIN_PIXELS
      ? ceilToMultiple(size.width * scale, OPENAI_SIZE_MULTIPLE)
      : floorToMultiple(size.width * scale, OPENAI_SIZE_MULTIPLE);
  const height =
    pixels < OPENAI_MIN_PIXELS
      ? ceilToMultiple(size.height * scale, OPENAI_SIZE_MULTIPLE)
      : floorToMultiple(size.height * scale, OPENAI_SIZE_MULTIPLE);

  return {
    width: Math.max(OPENAI_SIZE_MULTIPLE, width),
    height: Math.max(OPENAI_SIZE_MULTIPLE, height)
  };
}

function formatPixelSize(size: PixelSize): string {
  return `${size.width}x${size.height}`;
}

function roundToMultiple(value: number, multiple: number): number {
  return Math.max(multiple, Math.round(value / multiple) * multiple);
}

function ceilToMultiple(value: number, multiple: number): number {
  return Math.max(multiple, Math.ceil(value / multiple) * multiple);
}

function floorToMultiple(value: number, multiple: number): number {
  return Math.max(multiple, Math.floor(value / multiple) * multiple);
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const remainder = x % y;
    x = y;
    y = remainder;
  }
  return x || 1;
}
