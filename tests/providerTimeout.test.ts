import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultConfig } from "../src/config/defaults.js";
import {
  fetchWithProviderTimeout,
  formatProviderTimeoutError,
  resolveProviderTimeoutMs
} from "../src/providers/timeout.js";
import { resolveGenerationPlan } from "../src/routing/resolve.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("provider request timeout", () => {
  it("uses shorter timeouts for fast draft plans", () => {
    const plan = resolveGenerationPlan(defaultConfig, {
      prompt: "test prompt",
      presetName: "fast-draft",
      outputDirectory: "/tmp/picgen-test"
    });

    expect(resolveProviderTimeoutMs(plan)).toBe(120_000);
  });

  it("uses longer timeouts for high quality plans", () => {
    const plan = resolveGenerationPlan(defaultConfig, {
      prompt: "test prompt",
      presetName: "poster",
      outputDirectory: "/tmp/picgen-test"
    });

    expect(resolveProviderTimeoutMs(plan)).toBe(300_000);
  });

  it("uses a balanced default timeout", () => {
    const plan = resolveGenerationPlan(defaultConfig, {
      prompt: "test prompt",
      presetName: "default",
      outputDirectory: "/tmp/picgen-test"
    });

    expect(resolveProviderTimeoutMs(plan)).toBe(180_000);
  });

  it("allows an environment override", () => {
    vi.stubEnv("PICGEN_PROVIDER_TIMEOUT_MS", "450000");
    const plan = resolveGenerationPlan(defaultConfig, {
      prompt: "test prompt",
      presetName: "fast-draft",
      outputDirectory: "/tmp/picgen-test"
    });

    expect(resolveProviderTimeoutMs(plan)).toBe(450_000);
  });

  it("aborts slow provider fetches with a helpful message", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        });
      })
    );

    const requestExpectation = expect(
      fetchWithProviderTimeout("https://example.com", {}, 1000)
    ).rejects.toThrow(formatProviderTimeoutError(1000));
    await vi.advanceTimersByTimeAsync(1000);

    await requestExpectation;
    vi.useRealTimers();
  });
});
