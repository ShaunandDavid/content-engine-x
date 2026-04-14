import { open, rm } from "node:fs/promises";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const withFileLock = async <T>(
  lockPath: string,
  action: () => Promise<T>,
  options?: { retries?: number; delayMs?: number }
) => {
  const retries = options?.retries ?? 3;
  const delayMs = options?.delayMs ?? 50;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const handle = await open(lockPath, "wx");

      try {
        return await action();
      } finally {
        await handle.close();
        await rm(lockPath, { force: true });
      }
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }

      await sleep(delayMs);
    }
  }

  throw new Error("Failed to acquire file lock.");
};
