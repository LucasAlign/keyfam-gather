import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), transaction: vi.fn(), event: vi.fn(), findCost: vi.fn(), updateCost: vi.fn(), audit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireActor: mocks.auth }));
vi.mock("@/lib/db", () => ({ db: { event: { findUniqueOrThrow: mocks.event } } }));
vi.mock("@/lib/transactions", () => ({ withSerializableRetry: mocks.transaction }));
import { saveEventPlanning } from "./event-planning-actions";

describe("planning authorization and scope", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.event.mockResolvedValue({ organizationId: "org-1", status: "DRAFT" });
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.transaction.mockImplementation((run) => run({ event: { findUniqueOrThrow: mocks.event }, eventExpense: { findFirst: mocks.findCost, update: mocks.updateCost }, auditLog: { create: mocks.audit } }));
  });
  const form = () => { const data = new FormData(); for (const [key, value] of Object.entries({ eventId: "event-1", operation: "expense", id: "cost-1", category: "Catering", description: "Dinner", vendor: "Chef", plannedCents: "100.00", actualCents: "120.00" })) data.set(key, value); return data; };
  it("rejects unauthorized mutations before opening a transaction", async () => {
    mocks.auth.mockRejectedValue(new Error("Forbidden"));
    expect(await saveEventPlanning({}, form())).toEqual({ error: "Forbidden" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("rejects costs belonging to another event", async () => {
    mocks.findCost.mockResolvedValue(null);
    expect((await saveEventPlanning({}, form())).error).toMatch(/no longer available/);
    expect(mocks.findCost).toHaveBeenCalledWith({ where: { id: "cost-1", eventId: "event-1" } });
    expect(mocks.updateCost).not.toHaveBeenCalled();
  });
  it("checks archived status inside the transaction", async () => {
    mocks.event.mockResolvedValue({ organizationId: "org-1", status: "ARCHIVED" });
    expect((await saveEventPlanning({}, form())).error).toMatch(/read-only/);
    expect(mocks.updateCost).not.toHaveBeenCalled();
  });
  it("updates scoped costs and records an audit entry", async () => {
    mocks.findCost.mockResolvedValue({ id: "cost-1" });
    mocks.updateCost.mockResolvedValue({ id: "cost-1" });
    expect(await saveEventPlanning({}, form())).toEqual({ success: "Saved." });
    expect(mocks.auth).toHaveBeenCalledWith("org-1", "event:manage", "event-1");
    expect(mocks.updateCost).toHaveBeenCalledWith({ where: { id: "cost-1", eventId: "event-1" }, data: { category: "Catering", description: "Dinner", vendor: "Chef", plannedCents: 10000, actualCents: 12000 } });
    expect(mocks.audit).toHaveBeenCalledOnce();
  });
});
