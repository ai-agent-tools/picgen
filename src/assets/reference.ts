import { stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import type { ReferenceImage } from "../types.js";

export async function resolveReferenceImages(paths: string[] = []): Promise<ReferenceImage[]> {
  const images: ReferenceImage[] = [];

  for (const inputPath of paths) {
    const absolutePath = resolve(inputPath);
    const file = await stat(absolutePath).catch(() => {
      throw new Error(`Reference image not found: ${inputPath}`);
    });

    if (!file.isFile()) {
      throw new Error(`Reference image is not a file: ${inputPath}`);
    }

    images.push({
      path: absolutePath,
      mime_type: mimeTypeFromPath(absolutePath),
      bytes: file.size
    });
  }

  return images;
}

function mimeTypeFromPath(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    default:
      throw new Error(`Unsupported reference image format: ${path}`);
  }
}
