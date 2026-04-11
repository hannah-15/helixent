/**
 * Centralized error handling for the CLI entry point.
 *
 * Throw a `CliError` (or subclass) anywhere under the CLI surface when you
 * want a clean, styled exit with a specific status code. `runCli` wraps the
 * top-level entry and is responsible for printing and exiting.
 */

export const ExitCode = {
  Success: 0,
  Generic: 1,
  Usage: 2,
  ConfigMissing: 3,
  ConfigInvalid: 4,
  UserAbort: 130,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

export class CliError extends Error {
  readonly code: ExitCode;

  constructor(message: string, code: ExitCode = ExitCode.Generic) {
    super(message);
    this.name = "CliError";
    this.code = code;
  }
}

export class UserAbortError extends CliError {
  constructor(message = "Aborted by user.") {
    super(message, ExitCode.UserAbort);
    this.name = "UserAbortError";
  }
}

const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

/**
 * Wraps the CLI entry point. Catches errors, prints a styled message, and
 * exits with the appropriate code. Unknown errors fall through with code 1
 * and a stack trace so bugs stay visible.
 */
export async function runCli(main: () => Promise<void>): Promise<void> {
  try {
    await main();
  } catch (err) {
    if (err instanceof UserAbortError) {
      // Quiet exit — user pressed Esc / Ctrl+C intentionally.
      console.error(`${DIM}${err.message}${RESET}`);
      process.exit(err.code);
    }

    if (err instanceof CliError) {
      console.error(`${RED}error:${RESET} ${err.message}`);
      process.exit(err.code);
    }

    // Unknown error — keep the stack so we can debug.
    console.error(`${RED}error:${RESET} ${err instanceof Error ? err.message : String(err)}`);
    if (err instanceof Error && err.stack) {
      console.error(`${DIM}${err.stack}${RESET}`);
    }
    process.exit(ExitCode.Generic);
  }
}
