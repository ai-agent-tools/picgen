import { Command } from "commander";
import { runCreate } from "./commands/create.js";
import { runDoctor } from "./commands/doctor.js";
import {
  addProvider,
  editProvider,
  listProviders,
  preferProvider,
  removeProvider,
  runProviderTest,
  setProviderEnabled
} from "./commands/provider.js";
import { preferMode, preferPreset } from "./commands/preferences.js";
import { runSetup } from "./commands/setup.js";

const program = new Command();

program
  .name("picgen")
  .description("Lightweight image generation connector for AI agents.")
  .version("0.1.0-alpha.0");

program.command("setup").description("Run the interactive PicGen setup wizard.").action(runSetup);

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
  .option("--json", "Print machine-readable JSON.")
  .option("-y, --yes", "Skip confirmation for real generation.")
  .action(runCreate);

const provider = program.command("provider").description("Manage providers/channels.");
provider.command("list").description("List providers.").action(listProviders);
provider.command("add").description("Add a provider.").action(addProvider);
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

program.parseAsync().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
