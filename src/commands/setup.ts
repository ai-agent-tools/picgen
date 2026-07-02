import { select } from "@inquirer/prompts";
import { ensureConfig, getConfigPath } from "../config/store.js";
import { addProvider, listProviders } from "./provider.js";

export async function runSetup(): Promise<void> {
  await ensureConfig();
  console.log(`PicGen config: ${getConfigPath()}`);
  console.log("");
  await listProviders();
  console.log("");

  const action = await select({
    message: "What do you want to do?",
    choices: [
      { name: "Add a provider/channel", value: "add" },
      { name: "Leave defaults for now", value: "done" }
    ]
  });

  if (action === "add") {
    await addProvider();
  } else {
    console.log("Setup complete.");
  }
}
