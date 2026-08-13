import type { AttendanceCommand, AttendanceResult } from "@/lib/attendance-contract";

export type QueuedAttendanceCommand = AttendanceCommand & { sequence: number; attempts: number; lastError: string | null };
export type AttendanceConflict = { result: AttendanceResult; recordedAt: string };

export interface AttendanceQueueStore<TSnapshot> {
  loadSnapshot(): Promise<TSnapshot | null>;
  saveSnapshot(snapshot: TSnapshot): Promise<void>;
  enqueue(command: AttendanceCommand): Promise<void>;
  pending(): Promise<QueuedAttendanceCommand[]>;
  acknowledge(results: AttendanceResult[], merge: (snapshot: TSnapshot | null, results: AttendanceResult[]) => TSnapshot): Promise<TSnapshot>;
  markAttempt(operationId: string, error: string): Promise<void>;
  conflicts(): Promise<AttendanceConflict[]>;
  clearConflict(operationId: string): Promise<void>;
}

export class MemoryAttendanceQueue<TSnapshot> implements AttendanceQueueStore<TSnapshot> {
  private snapshot: TSnapshot | null = null;
  private operations: QueuedAttendanceCommand[] = [];
  private terminal: AttendanceConflict[] = [];
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
  async markAttempt(operationId: string, error: string) { const item = this.operations.find((entry) => entry.operationId === operationId); if (item) { item.attempts += 1; item.lastError = error; } }
  async conflicts() { return structuredClone(this.terminal); }
  async clearConflict(operationId: string) { this.terminal = this.terminal.filter((item) => item.result.operationId !== operationId); }
}

function requestValue<T>(request: IDBRequest<T>) { return new Promise<T>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
function transactionDone(transaction: IDBTransaction) { return new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error); }); }

export class IndexedDbAttendanceQueue<TSnapshot> implements AttendanceQueueStore<TSnapshot> {
  private constructor(private readonly database: IDBDatabase, private readonly eventId: string) {}
  static async open<TSnapshot>(namespace: string, eventId: string) {
    const request = indexedDB.open(`gather-attendance-${namespace}`, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("snapshots")) database.createObjectStore("snapshots");
      if (!database.objectStoreNames.contains("operations")) database.createObjectStore("operations", { keyPath: "operationId" }).createIndex("sequence", "sequence");
      if (!database.objectStoreNames.contains("conflicts")) database.createObjectStore("conflicts", { keyPath: "result.operationId" });
    };
    return new IndexedDbAttendanceQueue<TSnapshot>(await requestValue(request), eventId);
  }
  async loadSnapshot() { return (await requestValue(this.database.transaction("snapshots").objectStore("snapshots").get(this.eventId)) as TSnapshot | undefined) ?? null; }
  async saveSnapshot(snapshot: TSnapshot) { const tx = this.database.transaction("snapshots", "readwrite"); tx.objectStore("snapshots").put(snapshot, this.eventId); await transactionDone(tx); }
  async enqueue(command: AttendanceCommand) { const tx = this.database.transaction("operations", "readwrite"); tx.objectStore("operations").add({ ...command, sequence: Date.now(), attempts: 0, lastError: null }); await transactionDone(tx); }
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
  async markAttempt(operationId: string, error: string) { const tx = this.database.transaction("operations", "readwrite"); const store = tx.objectStore("operations"); const item = await requestValue(store.get(operationId)) as QueuedAttendanceCommand | undefined; if (item) store.put({ ...item, attempts: item.attempts + 1, lastError: error }); await transactionDone(tx); }
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
    await store.markAttempt(pending[0].operationId, error instanceof Error ? error.message : "Network request failed");
    throw error;
  }
}
