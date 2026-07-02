import type { Protocol } from "../types.js";

export function normalizeProviderBaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.pathname = stripKnownApiVersionPath(url.pathname);
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

export function buildOpenAIProtocolUrl(baseUrl: string, path: string): string {
  return `${normalizeProviderBaseUrl(baseUrl)}/v1/${path.replace(/^\/+/, "")}`;
}

export function buildGeminiProtocolUrl(baseUrl: string, path: string): string {
  return `${normalizeProviderBaseUrl(baseUrl)}/v1beta/${path.replace(/^\/+/, "")}`;
}

export function defaultProviderBaseUrl(protocol: Protocol): string {
  return protocol === "openai-images"
    ? "https://api.openai.com"
    : "https://generativelanguage.googleapis.com";
}

function stripKnownApiVersionPath(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, "");
  if (normalized === "" || normalized === "/") return "";
  if (normalized === "/v1" || normalized === "/v1beta") return "";
  return normalized;
}
