import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import YAML from "yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config/defaults.js";
import { getManagedEnvPath, readEnvVarValue, saveManagedEnvVar } from "../src/config/env.js";
import { loadConfig } from "../src/config/store.js";

let tempDir: string;
let previousConfigPath: string | undefined;
let previousEnvPath: string | undefined;
let previousCwd: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "picgen-migration-test-"));
  previousConfigPath = process.env.PICGEN_CONFIG;
  previousEnvPath = process.env.PICGEN_ENV_PATH;
  previousCwd = process.cwd();
  process.env.PICGEN_CONFIG = join(tempDir, "config.yaml");
  process.env.PICGEN_ENV_PATH = join(tempDir, "home", ".picgen", ".env");
});

afterEach(async () => {
  process.chdir(previousCwd);
  delete process.env.PICGEN_SHARED_GEMINI_KEY;
  delete process.env.PICGEN_GEMINI_PROXY_2_KEY;
  if (previousConfigPath === undefined) {
    delete process.env.PICGEN_CONFIG;
  } else {
    process.env.PICGEN_CONFIG = previousConfigPath;
  }
  if (previousEnvPath === undefined) {
    delete process.env.PICGEN_ENV_PATH;
  } else {
    process.env.PICGEN_ENV_PATH = previousEnvPath;
  }
  await rm(tempDir, { recursive: true, force: true });
});

describe("config migrations", () => {
  it("splits duplicate provider API key envs and copies the existing key", async () => {
    const config = structuredClone(defaultConfig);
    config.providers.gemini_proxy = {
      ...config.providers.gemini_official,
      channel: "third_party",
      base_url: "https://one.example",
      api_key_env: "PICGEN_SHARED_GEMINI_KEY"
    };
    config.providers.gemini_proxy_2 = {
      ...config.providers.gemini_official,
      channel: "third_party",
      base_url: "https://two.example",
      api_key_env: "PICGEN_SHARED_GEMINI_KEY"
    };

    await mkdir(tempDir, { recursive: true });
    await writeFile(process.env.PICGEN_CONFIG!, YAML.stringify(config), "utf8");
    await saveManagedEnvVar("PICGEN_SHARED_GEMINI_KEY", "shared-secret");

    const migrated = await loadConfig();

    expect(migrated.providers.gemini_proxy.api_key_env).toBe("PICGEN_SHARED_GEMINI_KEY");
    expect(migrated.providers.gemini_proxy_2.api_key_env).toBe("PICGEN_GEMINI_PROXY_2_KEY");
    await expect(readEnvVarValue("PICGEN_GEMINI_PROXY_2_KEY")).resolves.toBe("shared-secret");

    const saved = YAML.parse(await readFile(process.env.PICGEN_CONFIG!, "utf8"));
    expect(saved.providers.gemini_proxy_2.api_key_env).toBe("PICGEN_GEMINI_PROXY_2_KEY");
    await expect(readFile(getManagedEnvPath(), "utf8")).resolves.toContain(
      "PICGEN_GEMINI_PROXY_2_KEY=shared-secret"
    );

    const migratedAgain = await loadConfig();
    expect(migratedAgain.providers.gemini_proxy_2.api_key_env).toBe(
      "PICGEN_GEMINI_PROXY_2_KEY"
    );
  });
});
