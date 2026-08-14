import type { AttendanceCommand, AttendanceResult } from "@/lib/attendance-contract";

export type QueuedAttendanceCommand = AttendanceCommand & { sequence: number; attempts: number; lastError: string | null };
export type AttendanceConflict = { result: AttendanceResult; recordedAt: string };
export class AttendanceStorageError extends Error {
  constructor(message = "Offline attendance storage could not be opened. Keep this page open and ask a lead to export or clear this site's stored data before retrying.") { super(message); this.name = "AttendanceStorageError"; }
}

export interface AttendanceQueueStore<TSnapshot> {
  close(): void;
  loadSnapshot(): Promise<TSnapshot | null>;
  saveSnapshot(snapshot: TSnapshot): Promise<void>;
  enqueue(command: AttendanceCommand): Promise<void>;
  pending(): Promise<QueuedAttendanceCommand[]>;
  acknowledge(results: AttendanceResult[], merge: (snapshot: TSnapshot | null, results: AttendanceResult[]) => TSnapshot): Promise<TSnapshot>;
  markAttempts(operationIds: string[], error: string): Promise<void>;
  conflicts(): Promise<AttendanceConflict[]>;
  clearConflict(operationId: string): Promise<void>;
}

export class MemoryAttendanceQueue<TSnapshot> implements AttendanceQueueStore<TSnapshot> {
  private snapshot: TSnapshot | null = null;
  private operations: QueuedAttendanceCommand[] = [];
  private terminal: AttendanceConflict[] = [];
  close() {}
  async loadSnapshot() { return this.snapshot; }
  async saveSnapshot(snapshot: TSnapshot) { this.snapshot = structuredClone(snapshot); }
  async enqueue(command: AttendanceCommand) { this.operations.push({ ...command, sequence: Date.now() * 1000 + this.operations.length, attempts: 0, lastError: null }); }
  async pending() { return structuredClone(this.operations.sort((a, b) => a.sequence - b.sequence)); }
  async acknowledge(results: AttendanceResult[], merge: (snapshot: TSnapshot | null, results: AttendanceResult[]) => TSnapshot) {
    this.snapshot = merge(this.snapshot, results);
    const ids = new Set(results.map((item) => item.operationId));
    for (const item of results) if (item.disposition === "CONFLICT" || item.disposition === "REJECTED") this.terminal.push({ result: item, recordedAt: new Date().toISOString() });
    this.operations = this.operations.filter((item) => !ids.has(item.operationId));
    return structuredClone(this.snapshot);
  }
  async markAttempts(operationIds: string[], error: string) { const ids = new Set(operationIds); for (const item of this.operations) if (ids.has(item.operationId)) { item.attempts += 1; item.lastError = error; } }
  async conflicts() { return structuredClone(this.terminal); }
  async clearConflict(operationId: string) { this.terminal = this.terminal.filter((item) => item.result.operationId !== operationId); }
}

function requestValue<T>(request: IDBRequest<T>) { return new Promise<T>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
function transactionDone(transaction: IDBTransaction) { return new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error); }); }
function openedDatabase(request: IDBOpenDBRequest) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new AttendanceStorageError("Offline attendance storage is blocked by another open tab. Close other Gather tabs, then reload this page."));
  });
}

export class IndexedDbAttendanceQueue<TSnapshot> implements AttendanceQueueStore<TSnapshot> {
  private constructor(private readonly database: IDBDatabase, private readonly eventId: string) {}
  static async open<TSnapshot>(namespace: string, eventId: string) {
    const request = indexedDB.open(`gather-attendance-${namespace}`, 2);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("snapshots")) database.createObjectStore("snapshots");
      if (!database.objectStoreNames.contains("operations")) database.createObjectStore("operations", { keyPath: "operationId" }).createIndex("sequence", "sequence");
      if (!database.objectStoreNames.contains("conflicts")) database.createObjectStore("conflicts", { keyPath: "result.operationId" });
      if (!database.objectStoreNames.contains("metadata")) database.createObjectStore("metadata");
    };
    const database = await openedDatabase(request).catch((error) => { if (error instanceof AttendanceStorageError) throw error; throw new AttendanceStorageError(); });
    for (const store of ["snapshots", "operations", "conflicts", "metadata"]) {
      if (!database.objectStoreNames.contains(store)) { database.close(); throw new AttendanceStorageError(); }
    }
    return new IndexedDbAttendanceQueue<TSnapshot>(database, eventId);
  }
  close() { this.database.close(); }
  async loadSnapshot() { return (await requestValue(this.database.transaction("snapshots").objectStore("snapshots").get(this.eventId)) as TSnapshot | undefined) ?? null; }
  async saveSnapshot(snapshot: TSnapshot) { const tx = this.database.transaction("snapshots", "readwrite"); tx.objectStore("snapshots").put(snapshot, this.eventId); await transactionDone(tx); }
  async enqueue(command: AttendanceCommand) {
    const tx = this.database.transaction(["operations", "metadata"], "readwrite");
    const metadata = tx.objectStore("metadata");
    const sequenceKey = `sequence:${this.eventId}`;
    const previous = await requestValue(metadata.get(sequenceKey)) as number | undefined;
    const sequence = (previous ?? 0) + 1;
    metadata.put(sequence, sequenceKey);
    tx.objectStore("operations").add({ ...command, sequence, attempts: 0, lastError: null });
    await transactionDone(tx);
  }
  async pending() { const values = await requestValue(this.database.transaction("operations").objectStore("operations").getAll()) as QueuedAttendanceCommand[]; return values.filter((item) => item.eventId === this.eventId).sort((a, b) => a.sequence - b.sequence); }
  async acknowledge(results: AttendanceResult[], merge: (snapshot: TSnapshot | null, results: AttendanceResult[]) => TSnapshot) {
    const current = await this.loadSnapshot();
    const next = merge(current, results);
    const tx = this.database.transaction(["snapshots", "operations", "conflicts"], "readwrite");
    tx.objectStore("snapshots").put(next, this.eventId);
    for (const item of results) {
      tx.objectStore("operations").delete(item.operationId);
      if (item.disposition === "CONFLICT" || item.disposition === "REJECTED") tx.objectStore("conflicts").put({ result: item, recordedAt: new Date().toISOString() });
    }
    await transactionDone(tx);
    return next;
  }
  async markAttempts(operationIds: string[], error: string) { const tx = this.database.transaction("operations", "readwrite"); const store = tx.objectStore("operations"); for (const operationId of operationIds) { const item = await requestValue(store.get(operationId)) as QueuedAttendanceCommand | undefined; if (item) store.put({ ...item, attempts: item.attempts + 1, lastError: error }); } await transactionDone(tx); }
  async conflicts() { return await requestValue(this.database.transaction("conflicts").objectStore("conflicts").getAll()) as AttendanceConflict[]; }
  async clearConflict(operationId: string) { const tx = this.database.transaction("conflicts", "readwrite"); tx.objectStore("conflicts").delete(operationId); await transactionDone(tx); }
}

export async function synchronizeAttendance<TSnapshot>(store: AttendanceQueueStore<TSnapshot>, send: (commands: AttendanceCommand[]) => Promise<AttendanceResult[]>, merge: (snapshot: TSnapshot | null, results: AttendanceResult[]) => TSnapshot) {
  const pending = await store.pending();
  if (pending.length === 0) return { snapshot: await store.loadSnapshot(), pending: 0 };
  try {
    const results = await send(pending.map((item) => ({ operationId: item.operationId, eventId: item.eventId, registrationId: item.registrationId, deviceId: item.deviceId, kind: item.kind, occurredAt: item.occurredAt, expectedVersion: item.expectedVersion })));
    const snapshot = await store.acknowledge(results, merge);
    return { snapshot, pending: (await store.pending()).length };
  } catch (error) {
    await store.markAttempts(pending.map((item) => item.operationId), error instanceof Error ? error.message : "Network request failed");
    throw error;
  }
}
