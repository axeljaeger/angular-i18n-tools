import { describe, expect, it } from "vitest";
import { formatSetupError, setupStep, SetupDiagnostic } from "./diagnostics";

describe("setup error context", () => {
  it("keeps both the failing setup step and the original cause with its stack", () => {
    const cause = new SetupDiagnostic("CONFIG_EXPORT_NOT_FOUND", "No default config export in preview.ts", "Review the export form.");
    try {
      setupStep('Project "demo"', () => setupStep("Update preview: preview.ts", () => { throw cause; }));
      throw new Error("expected failure");
    } catch (error) {
      const normal = formatSetupError(error);
      expect(normal).toContain('at Project "demo"\nat Update preview: preview.ts');
      expect(normal).toContain("[CONFIG_EXPORT_NOT_FOUND]");
      expect(normal).toContain("Next: Review the export form.");
      expect(normal).toContain("--verbose");
      expect(normal).not.toContain("JavaScript stacks (including original causes):");
      const verbose = formatSetupError(error, true);
      expect(verbose).toContain("JavaScript stacks");
      expect(verbose).toContain("Caused by:");
      expect(verbose).toContain(cause.stack);
    }
  });
});
