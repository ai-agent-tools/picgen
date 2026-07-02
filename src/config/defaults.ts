import type { PicgenConfig } from "../types.js";

export const defaultConfig: PicgenConfig = {
  default_preset: "default",
  routing: {
    default_mode: "balanced",
    default_provider: "openai_official",
    fallback_providers: ["gemini_official"]
  },
  providers: {
    openai_official: {
      enabled: true,
      protocol: "openai-images",
      channel: "official",
      base_url: "https://api.openai.com",
      api_key_env: "OPENAI_API_KEY",
      models: ["gpt-image-2"]
    },
    gemini_official: {
      enabled: true,
      protocol: "gemini",
      channel: "official",
      base_url: "https://generativelanguage.googleapis.com",
      api_key_env: "GEMINI_API_KEY",
      models: ["gemini-3.1-flash-image-preview", "gemini-3-pro-image-preview"]
    }
  },
  modes: {
    fast: {
      preferred_models: ["gemini-3.1-flash-image-preview", "gpt-image-2"]
    },
    balanced: {
      preferred_models: ["gpt-image-2", "gemini-3.1-flash-image-preview"]
    },
    premium: {
      preferred_models: ["gemini-3-pro-image-preview", "gpt-image-2"]
    }
  },
  presets: {
    default: {
      mode: "balanced",
      aspect_ratio: "1:1",
      size: "medium",
      quality: "auto",
      n: 1,
      output_format: "png"
    },
    poster: {
      mode: "premium",
      aspect_ratio: "3:4",
      size: "large",
      quality: "high",
      n: 2,
      output_format: "png"
    },
    "social-cover": {
      mode: "balanced",
      aspect_ratio: "16:9",
      size: "large",
      quality: "high",
      n: 2,
      output_format: "png"
    },
    "product-shot": {
      mode: "premium",
      aspect_ratio: "1:1",
      size: "large",
      quality: "high",
      n: 2,
      output_format: "png"
    },
    "fast-draft": {
      mode: "fast",
      aspect_ratio: "1:1",
      size: "medium",
      quality: "low",
      n: 1,
      output_format: "jpeg"
    }
  }
};
