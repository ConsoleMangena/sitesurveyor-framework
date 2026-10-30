export function isDynamicImportError(error: Error): boolean {
  const text = `${error.name} ${error.message}`.toLowerCase();
  return text.includes("dynamically imported module") || text.includes("chunkloaderror") || text.includes("loading chunk");
}
