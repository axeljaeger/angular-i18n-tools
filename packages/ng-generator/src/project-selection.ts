import checkbox from "@inquirer/checkbox";
import { SchematicsException } from "@angular-devkit/schematics";

export interface ProjectSelectionOptions {
  project?: string;
  projects?: string[];
  all?: boolean;
  skipInstall?: boolean;
}

export interface ProjectChoice {
  projectName: string;
  project: { root?: string };
}

export type ProjectPrompt = (options: {
  message: string;
  choices: { name: string; value: string; checked: boolean }[];
  validate: (choices: readonly unknown[]) => boolean | string;
}) => Promise<string[]>;

export async function selectProjects(
  applications: ProjectChoice[],
  options: ProjectSelectionOptions,
  nxWorkspace: boolean,
  interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY),
  prompt: ProjectPrompt = checkbox<string>
): Promise<string[]> {
  const available = applications.map(app => app.projectName);
  if (available.length === 0) throw new SchematicsException("No supported Angular applications were found.");
  const requested = [...(options.project ? [options.project] : []), ...(options.projects ?? [])]
    .flatMap(name => name.split(",")).filter(Boolean);
  if (options.all && requested.length) throw new SchematicsException("Use either --all or --project, not both.");
  if (requested.length) {
    for (const name of requested) {
      if (!available.includes(name)) throw new SchematicsException(`Angular application "${name}" was not found. Available: ${available.join(", ")}.`);
    }
    return [...new Set(requested)];
  }
  if (options.all) return available;
  if (interactive && (nxWorkspace || available.length > 1)) {
    return prompt({
      message: "Which Angular applications should be configured?",
      choices: applications.map(app => ({ name: `${app.projectName} (${app.project.root || "."})`, value: app.projectName, checked: true })),
      validate: values => values.length > 0 || "Select at least one application."
    });
  }
  if (available.length === 1) return available;
  throw new SchematicsException(`Select applications with --project app1,app2 or --all when no interactive terminal is available. Found: ${available.join(", ")}.`);
}
