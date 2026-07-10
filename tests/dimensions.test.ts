import { describe, expect, it } from "vitest";
import {
  aspectRatioFromPixelSize,
  geminiImageConfigFor,
  openAIImageSizeFor,
  parsePixelSize
} from "../src/generation/dimensions.js";

describe("dimension mapping", () => {
  it("parses exact pixel sizes and derives aspect ratios", () => {
    expect(parsePixelSize("1088x576")).toEqual({ width: 1088, height: 576 });
    expect(aspectRatioFromPixelSize({ width: 1088, height: 576 })).toBe("17:9");
  });

  it("maps OpenAI symbolic sizes to accurate low-cost 1K dimensions", () => {
    expect(openAIImageSizeFor("16:9", "medium")).toBe("1024x576");
    expect(openAIImageSizeFor("3:4", "large")).toBe("768x1024");
    expect(openAIImageSizeFor("1:1", "medium")).toBe("1024x1024");
  });

  it("passes exact OpenAI pixel sizes through after validation", () => {
    expect(openAIImageSizeFor("17:9", "1088x576")).toBe("1088x576");
  });

  it("maps exact pixel sizes to Gemini aspect ratio and 1K image size", () => {
    expect(geminiImageConfigFor("17:9", "1088x576")).toEqual({
      aspectRatio: "16:9",
      imageSize: "1K"
    });
  });
});
