import { describe, expect, it } from "vitest";
import {
  buildGeminiProtocolUrl,
  buildOpenAIProtocolUrl,
  normalizeProviderBaseUrl
} from "../src/providers/urls.js";

describe("provider URL helpers", () => {
  it("normalizes host-only provider URLs", () => {
    expect(normalizeProviderBaseUrl("https://www.pandai.vip/v1")).toBe("https://www.pandai.vip");
    expect(normalizeProviderBaseUrl("https://example.com/v1beta/")).toBe("https://example.com");
    expect(normalizeProviderBaseUrl("https://example.com/custom/")).toBe("https://example.com/custom");
  });

  it("builds protocol-specific URLs", () => {
    expect(buildOpenAIProtocolUrl("https://www.pandai.vip", "images/generations")).toBe(
      "https://www.pandai.vip/v1/images/generations"
    );
    expect(buildGeminiProtocolUrl("https://www.pandai.vip", "models/gemini:generateContent")).toBe(
      "https://www.pandai.vip/v1beta/models/gemini:generateContent"
    );
  });
});
