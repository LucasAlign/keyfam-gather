import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

// P2034: serialization write conflict / deadlock. P2028 / P2024: transient
// transaction-start and connection-pool timeouts under concurrency. None of
// these committed, so retrying with backoff is always safe.
const RETRYABLE_CODES = new Set(["P2034", "P2028", "P2024"]);

export function isRetryableTransactionError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && RETRYABLE_CODES.has(error.code);
}

export async function withSerializableRetry<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>, maxAttempts = 16) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await db.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 15000 });
    } catch (error) {
      if (!isRetryableTransactionError(error) || attempt === maxAttempts) throw error;
      // Full-jitter exponential backoff so many devices contending on the same
      // event (write conflicts / deadlocks, P2034) do not retry in lockstep.
      const ceilingMs = Math.min(2 ** (attempt - 1) * 12, 500);
      await new Promise((resolve) => setTimeout(resolve, Math.random() * ceilingMs));
    }
  }
  throw new Error("The transaction could not be completed.");
}
