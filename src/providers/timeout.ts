import type { ResolvedGenerationPlan } from "../types.js";

const FAST_PROVIDER_TIMEOUT_MS = 120_000;
const DEFAULT_PROVIDER_TIMEOUT_MS = 180_000;
const SLOW_PROVIDER_TIMEOUT_MS = 300_000;

export function resolveProviderTimeoutMs(plan: ResolvedGenerationPlan): number {
  const override = parseTimeoutOverride(process.env.PICGEN_PROVIDER_TIMEOUT_MS);
  if (override !== undefined) return override;

  if (
    plan.presetName === "fast-draft" ||
    plan.modeName === "fast" ||
    plan.preset.quality === "low"
  ) {
    return FAST_PROVIDER_TIMEOUT_MS;
  }

  if (
    plan.modeName === "premium" ||
    plan.preset.size === "large" ||
    plan.preset.quality === "high"
  ) {
    return SLOW_PROVIDER_TIMEOUT_MS;
  }

  return DEFAULT_PROVIDER_TIMEOUT_MS;
}

export async function fetchWithProviderTimeout(
  input: Parameters<typeof fetch>[0],
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(formatProviderTimeoutError(timeoutMs));
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function formatProviderTimeoutError(timeoutMs: number): string {
  return `Provider request timed out after ${Math.ceil(
    timeoutMs / 1000
  )}s. The provider may still be processing or temporarily unavailable. Try again, use a faster preset, or increase PICGEN_PROVIDER_TIMEOUT_MS.`;
}

function parseTimeoutOverride(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const timeoutMs = Number(value);
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) return undefined;
  return timeoutMs;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
