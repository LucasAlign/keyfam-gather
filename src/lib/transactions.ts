import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export function isRetryableTransactionError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

export async function withSerializableRetry<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await db.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!isRetryableTransactionError(error) || attempt === maxAttempts) throw error;
    }
  }
  throw new Error("The transaction could not be completed.");
}
