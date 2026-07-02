import { Command } from "commander";
import { runCreate } from "./commands/create.js";
import { runDoctor } from "./commands/doctor.js";
import { setApiKey } from "./commands/key.js";
import {
  addProvider,
  editProvider,
  listProviders,
  preferProvider,
  quickAddProvider,
  removeProvider,
  runProviderTest,
  setProviderEnabled
} from "./commands/provider.js";
import { preferMode, preferPreset } from "./commands/preferences.js";
import { runQuickstart } from "./commands/quickstart.js";
import { runSetup } from "./commands/setup.js";
import { runUpdateCheck } from "./commands/update.js";
import { loadPicgenEnv } from "./config/env.js";
import { VERSION } from "./version.js";

await loadPicgenEnv();

const program = new Command();

program
  .name("picgen")
  .description("Lightweight image generation connector for AI agents.")
  .version(VERSION);

program.command("setup").description("Run the interactive PicGen setup wizard.").action(runSetup);

program.command("quickstart").description("Print install and first-run guidance.").action(runQuickstart);

program
  .command("doctor")
  .description("Inspect PicGen configuration and provider readiness.")
  .option("--json", "Print machine-readable JSON.")
  .action(runDoctor);

program
  .command("create")
  .description("Create an image generation plan or generate images.")
  .argument("<prompt...>", "Prompt text.")
  .option("--dry-run", "Plan generation without calling a provider.")
  .option("--preset <name>", "Preset name.")
  .option("--provider <name>", "Provider name.")
  .option("--mode <name>", "Mode name.")
  .option("--model <name>", "Model name.")
  .option("--out-dir <path>", "Output directory.")
  .option(
    "--reference <path>",
    "Reference image path for Gemini generation. Can be repeated.",
    collectOption,
    []
  )
  .option("--json", "Print machine-readable JSON.")
  .option("-y, --yes", "Skip confirmation for real generation.")
  .action(runCreate);

const provider = program.command("provider").description("Manage providers/channels.");
provider.command("list").description("List providers.").action(listProviders);
provider.command("add").description("Add a provider.").action(addProvider);
provider
  .command("quick-add")
  .argument("<template>", "openai-proxy, gemini-proxy, openai-official, or gemini-official")
  .description("Add a common provider/channel without interactive prompts.")
  .option("--name <name>", "Provider name.")
  .option("--host <url>", "Provider host URL. Do not include /v1 or /v1beta.")
  .option("--key-env <name>", "API key environment variable.")
  .option("--models <models>", "Comma-separated model list.")
  .option("--prefer", "Use this provider as the default.")
  .action(quickAddProvider);
provider.command("edit").argument("<name>").description("Edit a provider.").action(editProvider);
provider
  .command("test")
  .argument("<name>")
  .description("Test provider connectivity without generating an image.")
  .option("--json", "Print machine-readable JSON.")
  .action(runProviderTest);
provider
  .command("prefer")
  .argument("<name>")
  .description("Set the default provider preference.")
  .action(preferProvider);
provider
  .command("enable")
  .argument("<name>")
  .description("Enable a provider.")
  .action((name: string) => setProviderEnabled(name, true));
provider
  .command("disable")
  .argument("<name>")
  .description("Disable a provider.")
  .action((name: string) => setProviderEnabled(name, false));
provider.command("remove").argument("<name>").description("Remove a provider.").action(removeProvider);

program
  .command("key")
  .description("Manage PicGen API keys.")
  .command("set")
  .argument("<env-name>", "Environment variable name, such as PICGEN_GEMINI_PROXY_KEY.")
  .description("Save an API key to PicGen's managed env file.")
  .option("--stdin", "Read the key value from stdin.")
  .option("--value <value>", "Set the key value directly. Prefer --stdin for agent workflows.")
  .action(setApiKey);

program
  .command("mode")
  .description("Manage generation mode preferences.")
  .command("prefer")
  .argument("<name>")
  .description("Set the default mode preference.")
  .action(preferMode);

program
  .command("preset")
  .description("Manage generation preset preferences.")
  .command("prefer")
  .argument("<name>")
  .description("Set the default preset preference.")
  .action(preferPreset);

program
  .command("update")
  .description("Manage PicGen updates.")
  .command("check")
  .description("Check whether a newer PicGen version is available.")
  .option("--json", "Print machine-readable JSON.")
  .action(runUpdateCheck);

program.parseAsync().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

function collectOption(value: string, previous: string[]): string[] {
  return [...previous, value];
}
