import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getManagedEnvPath,
  inspectEnvVar,
  inspectEnvVars,
  loadPicgenEnv,
  saveManagedEnvVar
} from "../src/config/env.js";
import { listApiKeys, setApiKey, showApiKey } from "../src/commands/key.js";
import { saveConfig } from "../src/config/store.js";
import { defaultConfig } from "../src/config/defaults.js";

let tempDir: string;
let previousEnvPath: string | undefined;
let previousCwd: string;
let previousKey: string | undefined;
let previousConfigPath: string | undefined;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "picgen-env-test-"));
  previousEnvPath = process.env.PICGEN_ENV_PATH;
  previousCwd = process.cwd();
  previousKey = process.env.PICGEN_TEST_KEY;
  previousConfigPath = process.env.PICGEN_CONFIG;
  process.env.PICGEN_ENV_PATH = join(tempDir, "home", ".picgen", ".env");
  process.env.PICGEN_CONFIG = join(tempDir, "config.yaml");
  delete process.env.PICGEN_TEST_KEY;
});

afterEach(async () => {
  process.chdir(previousCwd);

  if (previousEnvPath === undefined) {
    delete process.env.PICGEN_ENV_PATH;
  } else {
    process.env.PICGEN_ENV_PATH = previousEnvPath;
  }

  if (previousKey === undefined) {
    delete process.env.PICGEN_TEST_KEY;
  } else {
    process.env.PICGEN_TEST_KEY = previousKey;
  }

  if (previousConfigPath === undefined) {
    delete process.env.PICGEN_CONFIG;
  } else {
    process.env.PICGEN_CONFIG = previousConfigPath;
  }

  await rm(tempDir, { recursive: true, force: true });
});

describe("PicGen env loading", () => {
  it("saves managed API keys with private file permissions", async () => {
    const path = await saveManagedEnvVar("PICGEN_TEST_KEY", "secret value");

    await expect(readFile(path, "utf8")).resolves.toBe(
      'PICGEN_TEST_KEY="secret value"\n'
    );
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(process.env.PICGEN_TEST_KEY).toBe("secret value");
    expect(getManagedEnvPath()).toBe(path);
  });

  it("loads managed env and lets project env override it", async () => {
    await saveManagedEnvVar("PICGEN_TEST_KEY", "managed");
    const projectDir = join(tempDir, "project");
    await mkdir(projectDir);
    await writeFile(join(projectDir, ".env"), "PICGEN_TEST_KEY=project\n", "utf8");
    delete process.env.PICGEN_TEST_KEY;
    process.chdir(projectDir);

    await loadPicgenEnv();

    expect(process.env.PICGEN_TEST_KEY).toBe("project");
  });

  it("does not override shell env vars", async () => {
    process.env.PICGEN_TEST_KEY = "shell";
    await saveManagedEnvVar("PICGEN_TEST_KEY", "managed");
    const projectDir = join(tempDir, "project");
    await mkdir(projectDir);
    await writeFile(join(projectDir, ".env"), "PICGEN_TEST_KEY=project\n", "utf8");
    process.env.PICGEN_TEST_KEY = "shell";
    process.chdir(projectDir);

    await loadPicgenEnv();

    expect(process.env.PICGEN_TEST_KEY).toBe("shell");
  });

  it("sets API keys through the command helper", async () => {
    await setApiKey("PICGEN_TEST_KEY", { value: "command-secret" });

    await expect(readFile(getManagedEnvPath(), "utf8")).resolves.toBe(
      "PICGEN_TEST_KEY=command-secret\n"
    );
    expect(process.env.PICGEN_TEST_KEY).toBe("command-secret");
  });

  it("inspects configured keys without revealing values", async () => {
    await saveManagedEnvVar("PICGEN_TEST_KEY", "secret-value-123456");
    delete process.env.PICGEN_TEST_KEY;

    await expect(inspectEnvVar("PICGEN_TEST_KEY")).resolves.toMatchObject({
      name: "PICGEN_TEST_KEY",
      set: true,
      source: "managed",
      length: 19,
      preview: "secret-...3456"
    });

    const [inspection] = await inspectEnvVars(["PICGEN_TEST_KEY", "PICGEN_TEST_KEY"]);
    expect(inspection.fingerprint).toMatch(/^[a-f0-9]{12}$/);
    expect(JSON.stringify(inspection)).not.toContain("secret-value-123456");
  });

  it("prints key status without revealing values", async () => {
    const config = structuredClone(defaultConfig);
    config.providers.openai_official.api_key_env = "PICGEN_TEST_KEY";
    await saveConfig(config);
    await saveManagedEnvVar("PICGEN_TEST_KEY", "command-secret");
    delete process.env.PICGEN_TEST_KEY;

    const lines: string[] = [];
    const originalLog = console.log;
    console.log = (message?: unknown) => {
      lines.push(String(message));
    };
    try {
      await showApiKey("PICGEN_TEST_KEY", {});
      await listApiKeys({});
    } finally {
      console.log = originalLog;
    }

    expect(lines.join("\n")).toContain("PICGEN_TEST_KEY: set");
    expect(lines.join("\n")).toContain("preview=command...cret");
    expect(lines.join("\n")).not.toContain("command-secret");
  });
});
