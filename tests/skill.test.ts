import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCodexHome, installSkill } from "../src/commands/skill.js";

let tempDir: string;
let previousCodexHome: string | undefined;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "picgen-skill-test-"));
  previousCodexHome = process.env.CODEX_HOME;
  process.env.CODEX_HOME = join(tempDir, "codex");
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(async () => {
  if (previousCodexHome === undefined) {
    delete process.env.CODEX_HOME;
  } else {
    process.env.CODEX_HOME = previousCodexHome;
  }
  vi.restoreAllMocks();
  await rm(tempDir, { recursive: true, force: true });
});

describe("skill install command", () => {
  it("installs the bundled PicGen skill for Codex", async () => {
    await installSkill("codex", {});

    const installed = join(getCodexHome(), "skills", "picgen", "SKILL.md");
    await expect(readFile(installed, "utf8")).resolves.toContain("# PicGen Skill");
  });

  it("rejects unsupported skill targets", async () => {
    await expect(installSkill("trae", {})).rejects.toThrow(
      "Unsupported skill target: trae"
    );
  });
});
