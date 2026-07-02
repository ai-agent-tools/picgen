import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import YAML from "yaml";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultConfig } from "../src/config/defaults.js";
import { saveConfig } from "../src/config/store.js";
import { preferProvider } from "../src/commands/provider.js";
import { preferMode, preferPreset } from "../src/commands/preferences.js";

let tempDir: string;
let previousConfigPath: string | undefined;

beforeEach(async () => {
  previousConfigPath = process.env.PICGEN_CONFIG;
  tempDir = await mkdtemp(join(tmpdir(), "picgen-test-"));
  process.env.PICGEN_CONFIG = join(tempDir, "config.yaml");
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(async () => {
  if (previousConfigPath === undefined) {
    delete process.env.PICGEN_CONFIG;
  } else {
    process.env.PICGEN_CONFIG = previousConfigPath;
  }
  vi.restoreAllMocks();
  await rm(tempDir, { recursive: true, force: true });
});

describe("preference commands", () => {
  it("sets the preferred provider and keeps the previous default as fallback", async () => {
    await saveConfig(structuredClone(defaultConfig));

    await preferProvider("gemini_official");

    const config = await readSavedConfig();
    expect(config.routing.default_provider).toBe("gemini_official");
    expect(config.routing.fallback_providers).toEqual(["openai_official"]);
  });

  it("sets the preferred mode", async () => {
    await saveConfig(structuredClone(defaultConfig));

    await preferMode("premium");

    const config = await readSavedConfig();
    expect(config.routing.default_mode).toBe("premium");
  });

  it("sets the preferred preset", async () => {
    await saveConfig(structuredClone(defaultConfig));

    await preferPreset("social-cover");

    const config = await readSavedConfig();
    expect(config.default_preset).toBe("social-cover");
  });
});

async function readSavedConfig(): Promise<typeof defaultConfig> {
  const raw = await readFile(process.env.PICGEN_CONFIG!, "utf8");
  return YAML.parse(raw);
}
