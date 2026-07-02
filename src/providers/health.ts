import type { ProviderConfig, Protocol } from "../types.js";
import { buildGeminiProtocolUrl, buildOpenAIProtocolUrl } from "./urls.js";

export interface ProviderTestResult {
  ok: boolean;
  name: string;
  protocol: Protocol;
  enabled: boolean;
  base_url: string;
  api_key_env: string;
  has_api_key: boolean;
  model?: string;
  status: "ok" | "disabled" | "missing_api_key" | "network_error" | "provider_error";
  message: string;
  http_status?: number;
}

export async function testProvider(
  name: string,
  provider: ProviderConfig
): Promise<ProviderTestResult> {
  const base = baseResult(name, provider);
  if (!provider.enabled) {
    return {
      ...base,
      ok: false,
      status: "disabled",
      message: "Provider is disabled."
    };
  }

  const apiKey = process.env[provider.api_key_env];
  if (!apiKey) {
    return {
      ...base,
      ok: false,
      status: "missing_api_key",
      message: `Missing API key environment variable: ${provider.api_key_env}`
    };
  }

  const model = provider.models[0];
  try {
    const response =
      provider.protocol === "openai-images"
        ? await testOpenAICompatibleProvider(provider, apiKey, model)
        : await testGeminiProvider(provider, apiKey, model);

    if (!response.ok) {
      const message = await readProviderError(response);
      return {
        ...base,
        ok: false,
        model,
        status: "provider_error",
        message:
          message ??
          `Provider check failed: ${response.status} ${response.statusText}`.trim(),
        http_status: response.status
      };
    }

    return {
      ...base,
      ok: true,
      model,
      status: "ok",
      message: "Provider check passed.",
      http_status: response.status
    };
  } catch (error) {
    return {
      ...base,
      ok: false,
      model,
      status: "network_error",
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

function baseResult(name: string, provider: ProviderConfig): Omit<ProviderTestResult, "status" | "message"> {
  return {
    ok: false,
    name,
    protocol: provider.protocol,
    enabled: provider.enabled,
    base_url: provider.base_url,
    api_key_env: provider.api_key_env,
    has_api_key: Boolean(process.env[provider.api_key_env])
  };
}

async function testOpenAICompatibleProvider(
  provider: ProviderConfig,
  apiKey: string,
  model: string
): Promise<Response> {
  return fetch(buildOpenAIProtocolUrl(provider.base_url, `models/${encodeURIComponent(model)}`), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });
}

async function testGeminiProvider(
  provider: ProviderConfig,
  apiKey: string,
  model: string
): Promise<Response> {
  return fetch(buildGeminiProtocolUrl(provider.base_url, `models/${encodeURIComponent(model)}:generateContent`), {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: "Say OK only." }]
        }
      ]
    })
  });
}

async function readProviderError(response: Response): Promise<string | undefined> {
  const text = await response.text();
  if (!text.trim()) return undefined;

  try {
    const parsed = JSON.parse(text) as { error?: { message?: unknown } };
    const message = parsed.error?.message;
    if (typeof message === "string") return message;
  } catch {
    return text.slice(0, 300);
  }

  return text.slice(0, 300);
}
