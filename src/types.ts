export type Protocol = "openai-images" | "gemini";
export type Channel = "official" | "third_party";
export type ModeName = "fast" | "balanced" | "premium" | string;
export type OutputFormat = "png" | "jpeg" | "webp";

export interface ProviderConfig {
  enabled: boolean;
  protocol: Protocol;
  channel: Channel;
  base_url: string;
  api_key_env: string;
  models: string[];
}

export interface ModeConfig {
  preferred_models: string[];
}

export interface PresetConfig {
  mode: ModeName;
  aspect_ratio: string;
  size: "small" | "medium" | "large" | "auto" | string;
  quality: "low" | "medium" | "high" | "auto" | string;
  n: number;
  output_format: OutputFormat;
}

export interface RoutingConfig {
  default_mode: ModeName;
  default_provider: string;
  fallback_providers: string[];
}

export interface PicgenConfig {
  default_preset: string;
  routing: RoutingConfig;
  providers: Record<string, ProviderConfig>;
  modes: Record<string, ModeConfig>;
  presets: Record<string, PresetConfig>;
}

export interface ResolvedGenerationPlan {
  prompt: string;
  providerName: string;
  provider: ProviderConfig;
  model: string;
  presetName: string;
  preset: PresetConfig;
  modeName: string;
  outputDirectory: string;
}

export interface DoctorProviderResult {
  name: string;
  enabled: boolean;
  protocol: Protocol;
  channel: Channel;
  base_url: string;
  api_key_env: string;
  has_api_key: boolean;
  models: string[];
  status: "ok" | "disabled" | "missing_api_key";
}
