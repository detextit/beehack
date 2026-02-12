import { initializeSchema } from "@/lib/schema";

let initPromise: Promise<void> | null = null;

export async function ensureDbReady() {
  if (!initPromise) {
    initPromise = initializeSchema();
  }

  await initPromise;
}
