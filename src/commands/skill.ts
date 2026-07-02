import { access, cp, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

export interface SkillInstallOptions {
  force?: boolean;
}

export async function installSkill(target: string, options: SkillInstallOptions): Promise<void> {
  if (target !== "codex") {
    throw new Error(`Unsupported skill target: ${target}. Supported target: codex.`);
  }

  const source = await findBundledPicgenSkill();
  const destination = join(getCodexHome(), "skills", "picgen");

  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, {
    recursive: true,
    force: options.force ?? false,
    errorOnExist: !(options.force ?? false)
  });

  console.log(`Installed PicGen skill for Codex: ${destination}`);
  console.log("Restart Codex or start a new Codex session if the skill is not visible yet.");
}

export function getCodexHome(): string {
  return process.env.CODEX_HOME ?? join(homedir(), ".codex");
}

async function findBundledPicgenSkill(): Promise<string> {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, "../skills/picgen"),
    resolve(here, "../../skills/picgen"),
    resolve(process.cwd(), "skills/picgen")
  ];

  for (const candidate of candidates) {
    try {
      await access(join(candidate, "SKILL.md"), constants.R_OK);
      return candidate;
    } catch {
      // Try the next package layout.
    }
  }

  throw new Error("Bundled PicGen skill not found. Reinstall @ai-agent-tools/picgen and try again.");
}
