import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { isRetryableTransactionError } from "./transactions";

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError("boom", { code, clientVersion: "6.19.3" });
}

describe("isRetryableTransactionError", () => {
  it("retries serialization and transient transaction/pool timeouts", () => {
    expect(isRetryableTransactionError(prismaError("P2034"))).toBe(true); // write conflict / deadlock
    expect(isRetryableTransactionError(prismaError("P2028"))).toBe(true); // transaction start timeout
    expect(isRetryableTransactionError(prismaError("P2024"))).toBe(true); // pool timeout
  });

  it("does not retry non-transient errors", () => {
    expect(isRetryableTransactionError(prismaError("P2002"))).toBe(false); // unique violation
    expect(isRetryableTransactionError(prismaError("P2025"))).toBe(false); // record not found
    expect(isRetryableTransactionError(new Error("plain"))).toBe(false);
    expect(isRetryableTransactionError(null)).toBe(false);
  });
});
