import { SchematicsException } from "@angular-devkit/schematics";

export class SetupDiagnostic extends SchematicsException {
  constructor(readonly code: string, message: string, hint: string) {
    super(`[${code}] ${message}\nNext: ${hint}`);
  }
}

class SetupContextError extends SchematicsException {
  override readonly cause: unknown;
  constructor(readonly step: string, cause: unknown, buffered: boolean) {
    super(`at ${step}\n${cause instanceof Error ? cause.message : String(cause)}${buffered ? "\nState: Configuration generation failed before commit; no workspace files were written." : ""}`);
    this.cause = cause;
  }
}

/** Keep the original error and stack when adding setup context. */
export function setupStep<T>(step: string, operation: () => T, trace?: (step: string) => void, buffered = false): T {
  trace?.(step);
  try { return operation(); }
  catch (error) { throw new SetupContextError(step, error, buffered); }
}

export function formatSetupError(error: unknown, verbose = false): string {
  const message = error instanceof Error ? error.message : String(error);
  const lines = [`Angular i18n Tools setup failed\n${message}`];
  if (verbose) {
    lines.push("JavaScript stacks (including original causes):");
    const seen = new Set<unknown>();
    let current = error;
    while (current instanceof Error && !seen.has(current)) {
      seen.add(current);
      lines.push(current.stack ?? current.message);
      current = current.cause;
      if (current) lines.push("Caused by:");
    }
  } else lines.push("Rerun with --verbose for environment details, setup steps and JavaScript stacks.");
  lines.push("Help: https://github.com/axeljaeger/angular-i18n-tools/blob/main/packages/ng-generator/README.md#troubleshooting-storybook-detection");
  return lines.join("\n");
}
