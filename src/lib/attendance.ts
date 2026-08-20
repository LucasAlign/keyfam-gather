import { createHash } from "node:crypto";
import { Prisma, type AttendanceResultCode as DbResultCode } from "@prisma/client";
import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { CHECK_IN_UNDO_WINDOW_MS } from "@/lib/check-in";
import { emptyAttendanceState, type AttendanceCommand, type AttendanceResult, type AttendanceState } from "@/lib/attendance-contract";
import { isRetryableTransactionError, withSerializableRetry } from "@/lib/transactions";

type CheckInWithActor = Prisma.CheckInGetPayload<{ include: { actor: { select: { name: true } } } }>;

function canonicalState(registrationId: string, checkIn: CheckInWithActor | null): AttendanceState {
  if (!checkIn) return emptyAttendanceState(registrationId);
  return {
    registrationId,
    active: checkIn.reversedAt === null,
    checkedInAt: checkIn.checkedInAt.toISOString(),
    reversedAt: checkIn.reversedAt?.toISOString() ?? null,
    actor: checkIn.actor.name,
    deviceId: checkIn.deviceId,
    version: checkIn.version,
  };
}

function commandHash(command: AttendanceCommand) {
  return createHash("sha256").update(JSON.stringify(command)).digest("hex");
}

function result(operationId: string, disposition: AttendanceResult["disposition"], canonical: AttendanceState, code?: AttendanceResult["code"]): AttendanceResult {
  return { operationId, disposition, canonical, ...(code ? { code } : {}) };
}

async function persistResult(tx: Prisma.TransactionClient, input: {
  command: AttendanceCommand; hash: string; organizationId: string; actorId: string; value: AttendanceResult;
}) {
  await tx.attendanceOperation.create({ data: {
    operationId: input.command.operationId,
    organizationId: input.organizationId,
    eventId: input.command.eventId,
    registrationId: input.command.registrationId,
    actorId: input.actorId,
    deviceId: input.command.deviceId,
    kind: input.command.kind,
    occurredAt: new Date(input.command.occurredAt),
    expectedVersion: input.command.expectedVersion,
    disposition: input.value.disposition,
    resultCode: input.value.code as DbResultCode | undefined,
    commandHash: input.hash,
    canonicalResult: JSON.stringify(input.value.canonical),
  } });
}

async function applyOne(command: AttendanceCommand): Promise<AttendanceResult> {
  const event = await db.event.findUnique({ where: { id: command.eventId }, select: { organizationId: true } });
  if (!event) return result(command.operationId, "REJECTED", emptyAttendanceState(command.registrationId), "NOT_FOUND");
  let actor: Awaited<ReturnType<typeof requireActor>>;
  try { actor = await requireActor(event.organizationId, "checkin:manage", command.eventId); }
  catch { return result(command.operationId, "REJECTED", emptyAttendanceState(command.registrationId), "FORBIDDEN"); }
  const hash = commandHash(command);

  return withSerializableRetry(async (tx) => {
    const prior = await tx.attendanceOperation.findUnique({ where: { operationId: command.operationId } });
    if (prior) {
      if (prior.organizationId !== event.organizationId || prior.eventId !== command.eventId || prior.registrationId !== command.registrationId) {
        return result(command.operationId, "REJECTED", emptyAttendanceState(command.registrationId), "OPERATION_ID_REUSED");
      }
      if (prior.commandHash !== hash) return result(command.operationId, "REJECTED", JSON.parse(prior.canonicalResult) as AttendanceState, "OPERATION_ID_REUSED");
      return result(command.operationId, "ALREADY_APPLIED", JSON.parse(prior.canonicalResult) as AttendanceState, prior.resultCode ?? undefined);
    }
    const registration = await tx.registration.findFirst({
      where: { id: command.registrationId, eventId: command.eventId, organizationId: event.organizationId, status: "ACTIVE" },
      include: { checkIn: { include: { actor: { select: { name: true } } } } },
    });
    if (!registration) return result(command.operationId, "REJECTED", emptyAttendanceState(command.registrationId), "NOT_FOUND");

    if (command.kind === "CHECK_IN" && registration.checkIn?.reversedAt === null) {
      const value = result(command.operationId, "CONFLICT", canonicalState(registration.id, registration.checkIn), "ALREADY_CHECKED_IN");
      await persistResult(tx, { command, hash, organizationId: event.organizationId, actorId: actor.user.id, value });
      return value;
    }

    if (command.kind === "UNDO") {
      const current = registration.checkIn;
      if (!current || current.reversedAt !== null) {
        const value = result(command.operationId, "CONFLICT", canonicalState(registration.id, current), "ALREADY_REVERSED");
        await persistResult(tx, { command, hash, organizationId: event.organizationId, actorId: actor.user.id, value });
        return value;
      }
      if (command.expectedVersion !== current.version) {
        const value = result(command.operationId, "CONFLICT", canonicalState(registration.id, current), "STALE_VERSION");
        await persistResult(tx, { command, hash, organizationId: event.organizationId, actorId: actor.user.id, value });
        return value;
      }
      if (Date.now() - current.checkedInAt.getTime() > CHECK_IN_UNDO_WINDOW_MS) {
        const value = result(command.operationId, "REJECTED", canonicalState(registration.id, current), "UNDO_EXPIRED");
        await persistResult(tx, { command, hash, organizationId: event.organizationId, actorId: actor.user.id, value });
        return value;
      }
      const reversedAt = new Date();
      const changed = await tx.checkIn.updateMany({ where: { id: current.id, version: current.version, reversedAt: null }, data: { reversedAt, reversedById: actor.user.id, version: { increment: 1 } } });
      if (changed.count !== 1) throw new Prisma.PrismaClientKnownRequestError("Attendance state changed", { code: "P2034", clientVersion: Prisma.prismaVersion.client });
      const updated = await tx.checkIn.findUniqueOrThrow({ where: { id: current.id }, include: { actor: { select: { name: true } } } });
      const value = result(command.operationId, "APPLIED", canonicalState(registration.id, updated));
      await tx.auditLog.create({ data: { organizationId: event.organizationId, eventId: command.eventId, actorId: actor.user.id, action: "checkin.reversed", entityType: "CheckIn", entityId: current.id, previousState: JSON.stringify(canonicalState(registration.id, current)), newState: JSON.stringify(value.canonical) } });
      await persistResult(tx, { command, hash, organizationId: event.organizationId, actorId: actor.user.id, value });
      return value;
    }

    const now = new Date();
    const updated = registration.checkIn
      ? await tx.checkIn.update({ where: { id: registration.checkIn.id }, data: { actorId: actor.user.id, deviceId: command.deviceId, checkedInAt: now, reversedAt: null, reversedById: null, version: { increment: 1 } }, include: { actor: { select: { name: true } } } })
      : await tx.checkIn.create({ data: { organizationId: event.organizationId, eventId: command.eventId, registrationId: registration.id, actorId: actor.user.id, deviceId: command.deviceId }, include: { actor: { select: { name: true } } } });
    const value = result(command.operationId, "APPLIED", canonicalState(registration.id, updated));
    await tx.auditLog.create({ data: { organizationId: event.organizationId, eventId: command.eventId, actorId: actor.user.id, action: "checkin.created", entityType: "CheckIn", entityId: updated.id, newState: JSON.stringify(value.canonical) } });
    await persistResult(tx, { command, hash, organizationId: event.organizationId, actorId: actor.user.id, value });
    return value;
  });
}

export async function applyAttendanceCommands(commands: AttendanceCommand[]) {
  const results: AttendanceResult[] = [];
  for (const command of commands) {
    try { results.push(await applyOne(command)); }
    catch (error) {
      // A transient serialization exhaustion (many devices contending on one
      // event) must not fail the whole request: return what was applied so the
      // client resends the unacknowledged remainder. Only genuinely unexpected
      // errors with nothing applied propagate.
      if (isRetryableTransactionError(error)) break;
      if (results.length === 0) throw error;
      break;
    }
  }
  return results;
}
