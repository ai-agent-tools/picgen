import { password } from "@inquirer/prompts";
import { saveManagedEnvVar } from "../config/env.js";

export interface KeySetOptions {
  stdin?: boolean;
  value?: string;
}

export async function setApiKey(name: string, options: KeySetOptions): Promise<void> {
  validateEnvName(name);

  const value = options.stdin
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
