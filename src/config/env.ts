import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { parse } from "dotenv";

export interface EnvVarInspection {
  name: string;
  set: boolean;
  source?: "shell" | "project" | "managed";
  path?: string;
  length?: number;
  preview?: string;
  fingerprint?: string;
}

const loadedEnvSources = new Map<
  string,
  { source: NonNullable<EnvVarInspection["source"]>; path?: string }
>();

export function getManagedEnvPath(): string {
  return process.env.PICGEN_ENV_PATH ?? join(homedir(), ".picgen", ".env");
}

export async function loadPicgenEnv(): Promise<void> {
  const shellEnv = new Set(Object.keys(process.env));
  await loadEnvFile(getManagedEnvPath(), shellEnv, false, "managed");
  await loadEnvFile(resolve(process.cwd(), ".env"), shellEnv, true, "project");
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
  loadedEnvSources.set(name, { source: "managed", path });
  return path;
}

export async function inspectEnvVar(name: string): Promise<EnvVarInspection> {
  const shellValue = process.env[name];
  if (shellValue !== undefined) {
    const loadedSource = loadedEnvSources.get(name);
    return describeEnvValue(
      name,
      shellValue,
      loadedSource?.source ?? "shell",
      loadedSource?.path
    );
  }

  const projectPath = resolve(process.cwd(), ".env");
  const project = await readEnvFile(projectPath);
  if (project[name] !== undefined) {
    return describeEnvValue(name, project[name], "project", projectPath);
  }

  const managedPath = getManagedEnvPath();
  const managed = await readEnvFile(managedPath);
  if (managed[name] !== undefined) {
    return describeEnvValue(name, managed[name], "managed", managedPath);
  }

  return {
    name,
    set: false
  };
}

export async function inspectEnvVars(names: string[]): Promise<EnvVarInspection[]> {
  const uniqueNames = [...new Set(names)];
  return Promise.all(uniqueNames.map((name) => inspectEnvVar(name)));
}

async function loadEnvFile(
  path: string,
  shellEnv: Set<string>,
  overrideManagedValues: boolean,
  source: NonNullable<EnvVarInspection["source"]>
): Promise<void> {
  if (!existsSync(path)) return;

  const parsed = parse(await readFile(path, "utf8"));
  for (const [name, value] of Object.entries(parsed)) {
    if (shellEnv.has(name)) continue;
    if (!overrideManagedValues && process.env[name] !== undefined) continue;
    process.env[name] = value;
    loadedEnvSources.set(name, { source, path });
  }
}

async function readManagedEnvFile(path: string): Promise<Record<string, string>> {
  return readEnvFile(path);
}

async function readEnvFile(path: string): Promise<Record<string, string>> {
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

function describeEnvValue(
  name: string,
  value: string,
  source: EnvVarInspection["source"],
  path?: string
): EnvVarInspection {
  return {
    name,
    set: true,
    source,
    path,
    length: value.length,
    preview: maskSecret(value),
    fingerprint: createHash("sha256").update(value).digest("hex").slice(0, 12)
  };
}

function maskSecret(value: string): string {
  if (value.length <= 11) return "*".repeat(value.length);
  return `${value.slice(0, 7)}...${value.slice(-4)}`;
}
