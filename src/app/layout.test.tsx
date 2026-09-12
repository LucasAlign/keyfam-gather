import { Children, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import RootLayout from "./layout";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("./login/actions", () => ({ logout: vi.fn() }));

describe("RootLayout", () => {
  it("places the skip link before global navigation and targets main content", async () => {
    const root = await RootLayout({ children: <h1>Page content</h1> });
    const body = root.props.children as ReactElement<{ children: ReactNode }>;
    const children = Children.toArray(body.props.children) as ReactElement<Record<string, unknown>>[];
    expect(children[0]).toMatchObject({ type: "a", props: { className: "skip-link", href: "#main-content", children: "Skip to content" } });
    expect(children[2]).toMatchObject({ type: "main", props: { id: "main-content" } });
  });
});
