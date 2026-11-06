export function previewAnnotations(entries: string[]): string[] {
  return [...entries, new URL("./preview.js", import.meta.url).pathname];
}

export function managerEntries(entry: string[] = []): string[] {
  return [...entry, new URL("./manager.js", import.meta.url).pathname];
}
