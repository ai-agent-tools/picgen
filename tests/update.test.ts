import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkForUpdate,
  formatUpdateMessage,
  isNewerVersion
} from "../src/commands/update.js";

let tempDir: string;
let previousDisable: string | undefined;
let previousCachePath: string | undefined;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "picgen-update-test-"));
  previousDisable = process.env.PICGEN_DISABLE_UPDATE_CHECK;
  previousCachePath = process.env.PICGEN_UPDATE_CACHE_PATH;
  process.env.PICGEN_UPDATE_CACHE_PATH = join(tempDir, "update-check.json");
});

afterEach(async () => {
  if (previousDisable === undefined) {
    delete process.env.PICGEN_DISABLE_UPDATE_CHECK;
  } else {
    process.env.PICGEN_DISABLE_UPDATE_CHECK = previousDisable;
  }

  if (previousCachePath === undefined) {
    delete process.env.PICGEN_UPDATE_CACHE_PATH;
  } else {
    process.env.PICGEN_UPDATE_CACHE_PATH = previousCachePath;
  }

  vi.unstubAllGlobals();
  await rm(tempDir, { recursive: true, force: true });
});

describe("update checks", () => {
  it("compares semver-like versions", () => {
    expect(isNewerVersion("0.1.1-alpha.0", "0.1.0-alpha.0")).toBe(true);
    expect(isNewerVersion("0.1.0", "0.1.0-alpha.0")).toBe(true);
    expect(isNewerVersion("0.1.0-alpha.0", "0.1.0-alpha.0")).toBe(false);
    expect(isNewerVersion("0.0.9", "0.1.0-alpha.0")).toBe(false);
  });

  it("formats update messages", () => {
    expect(
      formatUpdateMessage({
        checked: true,
        current_version: "0.1.0-alpha.0",
        latest_version: "0.1.1-alpha.0",
        update_available: true,
        package_name: "@ai-agent-tools/picgen"
      })
    ).toContain("npm install -g @ai-agent-tools/picgen@latest");
  });

  it("can be disabled by environment variable", async () => {
    process.env.PICGEN_DISABLE_UPDATE_CHECK = "1";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkForUpdate({ force: true })).resolves.toMatchObject({
      checked: false,
      disabled: true
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks npm registry dist-tags latest", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ "dist-tags": { latest: "0.1.1-alpha.0" } }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
    );

    await expect(checkForUpdate({ force: true })).resolves.toMatchObject({
      checked: true,
      current_version: "0.1.0-alpha.0",
      latest_version: "0.1.1-alpha.0",
      update_available: true
    });
  });
});
