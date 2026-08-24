import { Prisma } from "@prisma/client";

// Structured, dependency-free logging. Each call emits a single JSON line so a
// log shipper (Loki, CloudWatch, Datadog, ...) can parse fields without a regex.
// Warnings and errors go to stderr, everything else to stdout, which keeps the
// two streams separable in an orchestrator.

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function thresholdWeight() {
  const configured = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  return LEVEL_WEIGHT[configured as LogLevel] ?? LEVEL_WEIGHT.info;
}

export type LogFields = Record<string, unknown>;

// Errors do not survive JSON.stringify (message/stack are non-enumerable), so
// flatten the fields a responder actually needs, including the Prisma code that
// distinguishes a transient conflict (P2034) from a real fault.
export function serializeError(error: unknown): LogFields {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return { errorName: error.name, errorCode: error.code, message: error.message };
  }
  if (error instanceof Error) {
    return { errorName: error.name, message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}

function emit(level: LogLevel, message: string, fields?: LogFields) {
  if (LEVEL_WEIGHT[level] < thresholdWeight()) return;
  const record = { time: new Date().toISOString(), level, message, ...fields };
  const line = JSON.stringify(record);
  // console.* (not process.stdout/stderr) so the logger is safe in the Edge
  // runtime too — instrumentation.ts is bundled for both runtimes. warn/error
  // go to stderr, info/debug to stdout, which keeps the streams separable.
  if (level === "warn" || level === "error") console.error(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, fields?: LogFields) => emit("debug", message, fields),
  info: (message: string, fields?: LogFields) => emit("info", message, fields),
  warn: (message: string, fields?: LogFields) => emit("warn", message, fields),
  error: (message: string, fields?: LogFields) => emit("error", message, fields),
};
