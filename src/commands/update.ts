import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { PACKAGE_NAME, VERSION } from "../version.js";

const UPDATE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface UpdateCheckResult {
  checked: boolean;
  disabled?: boolean;
  current_version: string;
  latest_version?: string;
  update_available?: boolean;
  package_name: string;
  checked_at?: string;
  error?: string;
}

interface UpdateCache {
  checked_at: string;
  latest_version?: string;
}

export async function runUpdateCheck(options: { json?: boolean } = {}): Promise<void> {
  const result = await checkForUpdate({ force: true });
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const message = formatUpdateMessage(result);
  console.log(message ?? "PicGen is up to date.");
}

export async function maybePrintUpdateHint(): Promise<void> {
  const result = await checkForUpdate({ force: false });
  const message = formatUpdateMessage(result);
  if (message) {
    console.log("");
    console.log(message);
  }
}

export async function checkForUpdate(options: { force?: boolean } = {}): Promise<UpdateCheckResult> {
  if (process.env.PICGEN_DISABLE_UPDATE_CHECK === "1") {
    return {
      checked: false,
      disabled: true,
      current_version: VERSION,
      package_name: PACKAGE_NAME
    };
  }

  try {
    const cached = options.force ? undefined : await readFreshCache();
    const latestVersion = cached?.latest_version ?? (await fetchLatestVersion());
    const checkedAt = cached?.checked_at ?? new Date().toISOString();

    if (!cached) {
      await writeCache({
        checked_at: checkedAt,
        latest_version: latestVersion
      });
    }

    return {
      checked: true,
      current_version: VERSION,
      latest_version: latestVersion,
      update_available: isNewerVersion(latestVersion, VERSION),
      package_name: PACKAGE_NAME,
      checked_at: checkedAt
    };
  } catch (error) {
    return {
      checked: false,
      current_version: VERSION,
      package_name: PACKAGE_NAME,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export function formatUpdateMessage(result: UpdateCheckResult): string | undefined {
  if (!result.checked || !result.update_available || !result.latest_version) {
    return undefined;
  }

  return [
    `PicGen update available: ${result.current_version} -> ${result.latest_version}`,
    "Upgrade with:",
    `  npm install -g ${result.package_name}@latest`
  ].join("\n");
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const candidateParts = parseVersion(candidate);
  const currentParts = parseVersion(current);

  for (let index = 0; index < 3; index += 1) {
    if (candidateParts.numbers[index] > currentParts.numbers[index]) return true;
    if (candidateParts.numbers[index] < currentParts.numbers[index]) return false;
  }

  if (!candidateParts.prerelease && currentParts.prerelease) return true;
  if (candidateParts.prerelease && !currentParts.prerelease) return false;
  if (candidateParts.prerelease && currentParts.prerelease) {
    return candidateParts.prerelease.localeCompare(currentParts.prerelease) > 0;
  }

  return false;
}

async function fetchLatestVersion(): Promise<string> {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(PACKAGE_NAME)}`);
  if (!response.ok) {
    throw new Error(`npm registry returned ${response.status} ${response.statusText}`.trim());
  }

  const body = (await response.json()) as {
    "dist-tags"?: {
      latest?: unknown;
    };
  };
  const latest = body["dist-tags"]?.latest;
  if (typeof latest !== "string" || !latest) {
    throw new Error("npm registry response did not include dist-tags.latest.");
  }
  return latest;
}

async function readFreshCache(): Promise<UpdateCache | undefined> {
  try {
    const cache = JSON.parse(await readFile(getUpdateCachePath(), "utf8")) as UpdateCache;
    const checkedAt = Date.parse(cache.checked_at);
    if (!Number.isFinite(checkedAt)) return undefined;
    if (Date.now() - checkedAt > UPDATE_CACHE_TTL_MS) return undefined;
    return cache;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    return undefined;
  }
}

async function writeCache(cache: UpdateCache): Promise<void> {
  const path = getUpdateCachePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(cache, null, 2), "utf8");
}

function getUpdateCachePath(): string {
  if (process.env.PICGEN_UPDATE_CACHE_PATH) return process.env.PICGEN_UPDATE_CACHE_PATH;
  return join(homedir(), ".picgen", "update-check.json");
}

function parseVersion(version: string): { numbers: [number, number, number]; prerelease?: string } {
  const [core, prerelease] = version.split("-", 2);
  const numbers = core.split(".").map((part) => Number.parseInt(part, 10));
  return {
    numbers: [
      Number.isFinite(numbers[0]) ? numbers[0] : 0,
      Number.isFinite(numbers[1]) ? numbers[1] : 0,
      Number.isFinite(numbers[2]) ? numbers[2] : 0
    ],
    prerelease
  };
}
