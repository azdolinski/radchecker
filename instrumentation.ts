export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ensureDataDirs } = await import("@/lib/storage/fsPaths");
  await ensureDataDirs();
}
