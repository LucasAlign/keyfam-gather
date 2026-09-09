"use client";

import { useActionState, type ReactNode } from "react";
import { saveEventPlanning } from "@/app/event-planning-actions";
import { SubmitButton } from "@/components/submit-button";
import { budgetTotals, expenseCategories } from "@/lib/event-planning";

function PlanningForm({ eventId, operation, id, children }: { eventId: string; operation: string; id?: string; children?: ReactNode }) {
  const [state, action] = useActionState(saveEventPlanning, {});
  return <form action={action} className="form-card" onReset={(event) => event.preventDefault()} onSubmit={(event) => { if (operation.startsWith("remove") && !window.confirm("Remove this item?")) event.preventDefault(); }}>
    <input type="hidden" name="eventId" value={eventId} /><input type="hidden" name="operation" value={operation} /><input type="hidden" name="id" value={id ?? ""} />
    {state.error && <p className="alert" role="alert">{state.error}</p>}{state.success && <p className="success" role="status">{state.success}</p>}
    {children}<SubmitButton pendingText="Saving…">{operation.startsWith("remove") ? "Remove" : "Save"}</SubmitButton>
  </form>;
}

type Expense = { id: string; category: string; description: string; vendor: string; plannedCents: number; actualCents: number | null };
type QuickLink = { id: string; title: string; url: string };
function ExpenseFields({ expense }: { expense?: Expense }) {
  return <><div className="field-row"><label>Category<select name="category" defaultValue={expense?.category ?? "Catering"}>{expenseCategories.map((category) => <option key={category}>{category}</option>)}</select></label><label>Vendor or speaker<input name="vendor" maxLength={160} defaultValue={expense?.vendor ?? ""} /></label></div><label>Cost description<input name="description" required maxLength={160} defaultValue={expense?.description ?? ""} placeholder="Dinner for 150 guests" /></label><div className="field-row"><label>Planned cost<input name="plannedCents" type="number" min="0" max="21474836.47" step="0.01" required defaultValue={expense ? (expense.plannedCents / 100).toFixed(2) : ""} /></label><label>Actual cost<input name="actualCents" type="number" min="0" max="21474836.47" step="0.01" defaultValue={expense?.actualCents != null ? (expense.actualCents / 100).toFixed(2) : ""} /><small>Leave blank until the final cost is known.</small></label></div></>;
}

export function EventPlanning({ eventId, currency, budgetCents, expenses, links, editable }: { eventId: string; currency: string; budgetCents: number | null; expenses: Expense[]; links: QuickLink[]; editable: boolean }) {
  const totals = budgetTotals(expenses);
  const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
  const remaining = budgetCents === null ? null : budgetCents - totals.forecast;
  return <section className="event-section" aria-label="Event planning">
    <div className="section-heading"><div><p className="eyebrow">Planning workspace</p><h2>Budget & costs</h2></div><span>{currency}</span></div>
    <div className="metrics"><div><strong>{budgetCents === null ? "Not set" : money(budgetCents)}</strong><span>Total budget</span></div><div><strong>{money(totals.planned)}</strong><span>Planned costs</span></div><div><strong>{money(totals.actual)}</strong><span>Actual costs recorded</span></div><div className={remaining !== null && remaining < 0 ? "metric-attention" : ""}><strong>{remaining === null ? "—" : money(Math.abs(remaining))}</strong><span>{remaining !== null && remaining < 0 ? "Over budget (forecast)" : "Remaining (forecast)"}</span></div></div>
    <p className="form-hint">Forecast: {money(totals.forecast)}. Uses actual costs where recorded and planned costs for everything else.</p>
    {editable && <details><summary>Set total budget</summary><PlanningForm eventId={eventId} operation="budget"><label>Total budget ({currency})<input name="budgetCents" type="number" min="0" max="21474836.47" step="0.01" defaultValue={budgetCents === null ? "" : (budgetCents / 100).toFixed(2)} /><small>Leave blank to clear the budget.</small></label></PlanningForm></details>}
    {expenses.length === 0 && <p>No costs yet. Add catering, speakers, decorations, and other event expenses.</p>}
    <div className="group-grid">{expenses.map((expense) => <article className="form-card" key={expense.id}><h3>{expense.description}</h3><p>{expense.category}{expense.vendor && ` · ${expense.vendor}`}</p><p>Planned: {money(expense.plannedCents)} · Actual: {expense.actualCents === null ? "Not recorded" : money(expense.actualCents)}</p>{editable && <details><summary>Edit cost</summary><PlanningForm eventId={eventId} operation="expense" id={expense.id}><ExpenseFields expense={expense} /></PlanningForm><PlanningForm eventId={eventId} operation="removeExpense" id={expense.id} /></details>}</article>)}</div>
    {editable && <details><summary>Add a cost</summary><PlanningForm eventId={eventId} operation="expense"><ExpenseFields /></PlanningForm></details>}
    <div className="section-heading"><h2>Quick links</h2><span>Google Drive</span></div><p>Keep event folders, contracts, menus, and planning documents close at hand. Google Drive sharing permissions still apply.</p>
    {links.length === 0 && <p>No documents linked yet.</p>}<div className="group-grid">{links.map((link) => <article className="form-card" key={link.id}><a href={link.url} target="_blank" rel="noopener noreferrer">{link.title} ↗</a>{editable && <details><summary>Edit link</summary><PlanningForm eventId={eventId} operation="link" id={link.id}><LinkFields link={link} /></PlanningForm><PlanningForm eventId={eventId} operation="removeLink" id={link.id} /></details>}</article>)}</div>
    {editable && <details><summary>Add a Google Drive link</summary><PlanningForm eventId={eventId} operation="link"><LinkFields /></PlanningForm></details>}
  </section>;
}

function LinkFields({ link }: { link?: QuickLink }) {
  return <><label>Link name<input name="title" required maxLength={120} defaultValue={link?.title ?? ""} placeholder="Event planning folder" /></label><label>Google Drive URL<input name="url" type="url" required maxLength={2048} defaultValue={link?.url ?? ""} placeholder="https://drive.google.com/…" /></label></>;
}
