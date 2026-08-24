import { Prisma } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { logger, serializeError } from "./logger";

// info/debug go to console.log (stdout), warn/error to console.error (stderr).
function captureStream(stream: "stdout" | "stderr") {
  const method = stream === "stdout" ? "log" : "error";
  const lines: string[] = [];
  const spy = vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
    lines.push(String(args[0]));
  });
  return { lines, spy };
}

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.LOG_LEVEL;
});

describe("logger", () => {
  it("emits one JSON line per call with level, message, and fields", () => {
    const { lines } = captureStream("stdout");
    logger.info("check-in applied", { eventId: "evt_1", applied: 3 });
    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0]);
    expect(record).toMatchObject({ level: "info", message: "check-in applied", eventId: "evt_1", applied: 3 });
    expect(typeof record.time).toBe("string");
  });

  it("routes warn and error to stderr, info and debug to stdout", () => {
    process.env.LOG_LEVEL = "debug";
    const out = captureStream("stdout");
    const err = captureStream("stderr");
    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");
    expect(out.lines.map((l) => JSON.parse(l).level)).toEqual(["debug", "info"]);
    expect(err.lines.map((l) => JSON.parse(l).level)).toEqual(["warn", "error"]);
  });

  it("suppresses events below the configured LOG_LEVEL", () => {
    process.env.LOG_LEVEL = "warn";
    const out = captureStream("stdout");
    const err = captureStream("stderr");
    logger.info("hidden");
    logger.debug("hidden");
    logger.error("shown");
    expect(out.lines).toHaveLength(0);
    expect(err.lines).toHaveLength(1);
  });
});

describe("serializeError", () => {
  it("keeps the Prisma error code so transient conflicts stay distinguishable", () => {
    const error = new Prisma.PrismaClientKnownRequestError("boom", { code: "P2034", clientVersion: "6.19.3" });
    expect(serializeError(error)).toMatchObject({ errorName: "PrismaClientKnownRequestError", errorCode: "P2034" });
  });

  it("captures message and stack for plain errors", () => {
    const fields = serializeError(new Error("nope"));
    expect(fields.message).toBe("nope");
    expect(typeof fields.stack).toBe("string");
  });

  it("stringifies non-error throwables", () => {
    expect(serializeError("weird")).toEqual({ message: "weird" });
  });
});
