import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventWorkspace, type WorkspaceCategory } from "./event-workspace";

let pathname = "/events/sample";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
const categories: WorkspaceCategory[] = [
  { label: "Overview", tools: [{ label: "Dashboard", href: "/events/sample", group: "Summary" }] },
  { label: "Guests", tools: [
    { label: "Guest list", href: "/events/sample/registrations", group: "Registration" },
    { label: "Import guests", href: "/events/sample/registrations/import", group: "Registration" },
  ] },
];
function show() { render(<EventWorkspace eventName="Community dinner" categories={categories}><h1>Page content</h1></EventWorkspace>); }
describe("event workspace navigation", () => {
  beforeEach(() => { pathname = "/events/sample"; });
  it("shows only the tools in the current category", () => {
    show();
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "Import guests" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Event categories" })).getAllByRole("link")).toHaveLength(2);
  });
  it("selects the most specific tool when paths overlap", () => {
    pathname = "/events/sample/registrations/import";
    show();
    expect(screen.getByRole("link", { name: "Import guests" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Guest list" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Guests" })).toHaveAttribute("aria-current", "true");
  });
  it("keeps nested guest editors in the guest list", () => {
    pathname = "/events/sample/registrations/person-1/substitute";
    show();
    expect(screen.getByRole("link", { name: "Guest list" })).toHaveAttribute("aria-current", "page");
  });
  it("does not put staff navigation on public registration", () => {
    pathname = "/events/sample/public-register";
    show();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Page content" })).toBeVisible();
  });
});

