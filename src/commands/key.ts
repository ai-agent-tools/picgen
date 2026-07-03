import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { password } from "@inquirer/prompts";
import { inspectEnvVar, inspectEnvVars, saveManagedEnvVar } from "../config/env.js";
import { loadConfig } from "../config/store.js";

const execFileAsync = promisify(execFile);

export interface KeySetOptions {
  stdin?: boolean;
  value?: string;
  clipboard?: boolean;
}

export interface KeyInspectOptions {
  json?: boolean;
}

export async function setApiKey(name: string, options: KeySetOptions): Promise<void> {
  validateEnvName(name);

  const value = options.clipboard
    ? await readClipboard()
    : options.stdin
    ? await readStdin()
    : options.value
      ? options.value
      : await password({
          message: `Paste API key for ${name}`,
          mask: "*"
        });

  if (!value.trim()) {
    throw new Error("API key is empty.");
  }

  const path = await saveManagedEnvVar(name, value.trim());
  console.log(`Saved ${name} to ${path}`);
}

export async function listApiKeys(options: KeyInspectOptions): Promise<void> {
  const config = await loadConfig();
  const names = Object.values(config.providers).map((provider) => provider.api_key_env);
  const inspections = await inspectEnvVars(names);

  if (options.json) {
    console.log(JSON.stringify(inspections, null, 2));
    return;
  }

  for (const inspection of inspections) {
    printInspection(inspection);
  }
}

export async function showApiKey(name: string, options: KeyInspectOptions): Promise<void> {
  validateEnvName(name);
  const inspection = await inspectEnvVar(name);

  if (options.json) {
    console.log(JSON.stringify(inspection, null, 2));
    return;
  }

  printInspection(inspection);
}

function validateEnvName(name: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid environment variable name: ${name}`);
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readClipboard(): Promise<string> {
  try {
    const { stdout } = await execFileAsync("pbpaste");
    return stdout;
  } catch {
    throw new Error("Could not read clipboard. Use --stdin or run picgen key set without flags.");
  }
}

function printInspection(inspection: Awaited<ReturnType<typeof inspectEnvVar>>): void {
  if (!inspection.set) {
    console.log(`${inspection.name}: missing`);
    return;
  }

  const location = inspection.path ? ` ${inspection.path}` : "";
  console.log(
    `${inspection.name}: set source=${inspection.source}${location} length=${inspection.length} preview=${inspection.preview} fingerprint=${inspection.fingerprint}`
  );
}
