import { join } from "node:path";

import type { Command } from "commander";

import { ensureHelixentHomeEnv, isHelixentSetupComplete, loadConfig } from "@/cli/config";
import { createCodingAgent } from "@/coding";
import { AnthropicModelProvider } from "@/community/anthropic";
import { OpenAIModelProvider } from "@/community/openai";
import type { AssistantMessage, ModelProvider, UserMessage } from "@/foundation";
import { Model } from "@/foundation";

export function registerRunCommand(program: Command): void {
  program
    .command("run [prompt]")
    .description("Run the agent on a single prompt non-interactively and print the final response")
    .action(async (prompt: string | undefined) => {
      try {
        const text = await resolvePrompt(prompt);
        if (!text) {
          console.error("Error: no prompt provided. Pass it as an argument or pipe via stdin.");
          process.exit(2);
        }

        ensureHelixentHomeEnv();
        if (!isHelixentSetupComplete()) {
          console.error("Error: helixent is not configured. Run `helixent config model add` first.");
          process.exit(2);
        }

        const config = loadConfig();
        const modelName = config.defaultModel ?? config.models[0]?.name;
        const entry = modelName ? config.models.find((m) => m.name === modelName) : undefined;
        if (!entry) {
          console.error("Error: no models configured. Run `helixent config model add` to add one.");
          process.exit(2);
        }

        let provider: ModelProvider;
        if (entry.provider === "anthropic") {
          provider = new AnthropicModelProvider({ baseURL: entry.baseURL, apiKey: entry.APIKey });
        } else {
          provider = new OpenAIModelProvider({ baseURL: entry.baseURL, apiKey: entry.APIKey });
        }

        const model = new Model(entry.name, provider, {
          max_tokens: 16 * 1024,
          thinking: { type: "enabled" },
        });

        const skillsDirs = [
          join(process.cwd(), "skills"),
          join(process.cwd(), ".agents/skills"),
          join(Bun.env.HELIXENT_HOME!, "skills"),
          "~/.agents/skills",
          "~/.helixent/skills",
        ];

        // No askUser / askUserQuestion: in non-interactive mode the runner cannot
        // prompt a human, so the approval middleware is omitted entirely and the
        // agent executes its tools unattended.
        const agent = await createCodingAgent({ model, skillsDirs });

        const userMessage: UserMessage = { role: "user", content: [{ type: "text", text }] };
        let finalAssistant: AssistantMessage | null = null;
        for await (const event of agent.stream(userMessage)) {
          if (event.type === "message" && event.message.role === "assistant") {
            finalAssistant = event.message;
          }
        }

        const out = extractAssistantText(finalAssistant);
        if (out) process.stdout.write(out + "\n");
        process.exit(0);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Error: ${message}`);
        process.exit(1);
      }
    });
}

async function resolvePrompt(arg: string | undefined): Promise<string | null> {
  if (arg && arg !== "-") return arg;
  if (arg === "-" || !process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer);
    }
    const text = Buffer.concat(chunks).toString("utf8").trim();
    return text || null;
  }
  return null;
}

function extractAssistantText(message: AssistantMessage | null): string {
  if (!message) return "";
  return message.content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}
