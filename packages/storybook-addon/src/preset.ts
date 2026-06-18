export function previewAnnotations(): string[] {
  return [new URL("./preview.js", import.meta.url).pathname];
}

export function managerEntries(entry: string[] = []): string[] {
  return [...entry, new URL("./manager.js", import.meta.url).pathname];
}
