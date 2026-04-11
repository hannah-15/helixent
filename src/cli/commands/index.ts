import type { Command } from "commander";

import { registerConfigCommands } from "./config";
import { registerRunCommand } from "./run";

export function registerCommands(program: Command): void {
  registerConfigCommands(program);
  registerRunCommand(program);
}
