export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ensureDataDirs } = await import("@/lib/storage/fsPaths");
  await ensureDataDirs();
  const { initDictionaries } = await import("@/lib/radius/dictionaryIndex");
  await initDictionaries();
  const { rehydrateJobs } = await import("@/lib/jobs/persistence");
  await rehydrateJobs();
}
