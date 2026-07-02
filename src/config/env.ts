import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { parse } from "dotenv";

export function getManagedEnvPath(): string {
  return process.env.PICGEN_ENV_PATH ?? join(homedir(), ".picgen", ".env");
}

export async function loadPicgenEnv(): Promise<void> {
  const shellEnv = new Set(Object.keys(process.env));
  await loadEnvFile(getManagedEnvPath(), shellEnv, false);
  await loadEnvFile(resolve(process.cwd(), ".env"), shellEnv, true);
}

export async function saveManagedEnvVar(name: string, value: string): Promise<string> {
  const path = getManagedEnvPath();
  const current = await readManagedEnvFile(path);
  const next = {
    ...current,
    [name]: value
  };

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, stringifyEnv(next), "utf8");
  await chmod(path, 0o600);
  process.env[name] = value;
  return path;
}

async function loadEnvFile(
  path: string,
  shellEnv: Set<string>,
  overrideManagedValues: boolean
): Promise<void> {
  if (!existsSync(path)) return;

  const parsed = parse(await readFile(path, "utf8"));
  for (const [name, value] of Object.entries(parsed)) {
    if (shellEnv.has(name)) continue;
    if (!overrideManagedValues && process.env[name] !== undefined) continue;
    process.env[name] = value;
  }
}

async function readManagedEnvFile(path: string): Promise<Record<string, string>> {
  try {
    return parse(await readFile(path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

function stringifyEnv(values: Record<string, string>): string {
  return `${Object.entries(values)
    .map(([name, value]) => `${name}=${quoteEnvValue(value)}`)
    .join("\n")}\n`;
}

function quoteEnvValue(value: string): string {
  if (/^[A-Za-z0-9_./:@+-]+$/.test(value)) return value;
  return JSON.stringify(value);
}
