export interface PixelSize {
  width: number;
  height: number;
}

export interface GeminiImageConfig extends Record<string, unknown> {
  aspectRatio: string;
  imageSize?: string;
}

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
}

export function openAIImageSizeFor(aspectRatio: string, size: string): string | undefined {
  const pixelSize = parsePixelSize(size);
  if (pixelSize) {
    validateOpenAIPixelSize(pixelSize);
    return `${pixelSize.width}x${pixelSize.height}`;
  }

  if (size === "auto") return "auto";

  const ratio = parseAspectRatio(aspectRatio);
  if (!ratio) return "auto";

  const longEdge = size === "small" ? 512 : 1024;
  const resolved = pixelSizeForLongEdge(ratio, longEdge);
  return `${resolved.width}x${resolved.height}`;
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

function roundToMultiple(value: number, multiple: number): number {
  return Math.max(multiple, Math.round(value / multiple) * multiple);
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
