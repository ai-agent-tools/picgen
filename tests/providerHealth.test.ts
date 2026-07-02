import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultConfig } from "../src/config/defaults.js";
import { testProvider } from "../src/providers/health.js";

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  vi.unstubAllGlobals();
});

describe("provider health checks", () => {
  it("reports missing API keys without calling the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await testProvider("openai_official", defaultConfig.providers.openai_official);

    expect(result).toMatchObject({
      ok: false,
      status: "missing_api_key",
      api_key_env: "OPENAI_API_KEY",
      has_api_key: false
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports disabled providers without calling the network", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const provider = {
      ...defaultConfig.providers.openai_official,
      enabled: false
    };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await testProvider("openai_official", provider);

    expect(result).toMatchObject({
      ok: false,
      status: "disabled",
      enabled: false
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks OpenAI-compatible model metadata", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await testProvider("openai_official", defaultConfig.providers.openai_official);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/models/gpt-image-2",
      expect.objectContaining({
        method: "GET",
        headers: {
          Authorization: "Bearer test-key"
        }
      })
    );
    expect(result).toMatchObject({
      ok: true,
      status: "ok",
      model: "gpt-image-2",
      http_status: 200
    });
  });

  it("checks Gemini generateContent endpoint", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await testProvider("gemini_official", defaultConfig.providers.gemini_official);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent",
      expect.objectContaining({
        method: "POST",
        headers: {
          "x-goog-api-key": "test-key",
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
      })
    );
    expect(result).toMatchObject({
      ok: true,
      status: "ok",
      model: "gemini-3.1-flash-image-preview",
      http_status: 200
    });
  });

  it("reports provider error messages", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "invalid key" } }), {
          status: 401,
          statusText: "Unauthorized"
        })
      )
    );

    const result = await testProvider("openai_official", defaultConfig.providers.openai_official);

    expect(result).toMatchObject({
      ok: false,
      status: "provider_error",
      message: "invalid key",
      http_status: 401
    });
  });
});
