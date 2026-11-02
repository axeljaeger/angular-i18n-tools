import { describe, expect, it, vi } from "vitest";
import { selectProjects, type ProjectPrompt } from "./project-selection";

const apps = [
  { projectName: "admin", project: { root: "apps/admin" } },
  { projectName: "shop", project: { root: "apps/shop" } }
];

describe("application selection", () => {
  it("offers checked choices for a whole Nx workspace", async () => {
    const prompt: ProjectPrompt = vi.fn(async (options: Parameters<ProjectPrompt>[0]) => {
      expect(options.choices.map(choice => [choice.value, choice.checked])).toEqual([["admin", true], ["shop", true]]);
      expect(options.validate([])).toBe("Select at least one project.");
      return ["admin", "shop"];
    });
    expect(await selectProjects(apps, {}, true, true, prompt)).toEqual(["admin", "shop"]);
  });
  it("also offers the checkbox for a single Nx app in a terminal", async () => {
    const prompt: ProjectPrompt = vi.fn(async () => ["shop"]);
    await selectProjects([apps[1]!], {}, true, true, prompt);
    expect(prompt).toHaveBeenCalledOnce();
  });
  it("accepts a subset and does not prompt for explicit selections", async () => {
    const prompt: ProjectPrompt = vi.fn(async () => []);
    expect(await selectProjects(apps, { project: "shop,admin,shop" }, true, true, prompt)).toEqual(["shop", "admin"]);
    expect(prompt).not.toHaveBeenCalled();
  });
  it("supports all applications in automation", async () => {
    expect(await selectProjects(apps, { all: true }, true, false)).toEqual(["admin", "shop"]);
    await expect(selectProjects(apps, {}, true, false)).rejects.toThrow("--all");
  });
  it("validates all requested names before editing anything", async () => {
    await expect(selectProjects(apps, { projects: ["shop", "typo"] }, true, false)).rejects.toThrow('"typo" was not found');
    await expect(selectProjects(apps, { all: true, project: "shop" }, true, false)).rejects.toThrow("either --all or --project");
  });
  it("propagates cancellation before any generation starts", async () => {
    const prompt: ProjectPrompt = async () => { throw new Error("cancelled"); };
    await expect(selectProjects(apps, {}, true, true, prompt)).rejects.toThrow("cancelled");
  });
});
