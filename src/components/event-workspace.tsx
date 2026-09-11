"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export type WorkspaceCategory = { label: string; tools: { label: string; href: string; group: string }[] };

export function EventWorkspace({ eventName, categories, children }: { eventName: string; categories: WorkspaceCategory[]; children: ReactNode }) {
  const pathname = usePathname();
  if (pathname.endsWith("/public-register") || categories.length === 0) return children;
  // Longest match keeps nested editors within their parent tool.
  const selected = categories.flatMap((category) => category.tools.map((tool) => ({ category, tool })))
    .filter(({ tool }) => pathname === tool.href || pathname.startsWith(`${tool.href}/`))
    .sort((a, b) => b.tool.href.length - a.tool.href.length)[0];
  const active = selected?.category ?? categories[0];
  const groups = [...new Set(active.tools.map((tool) => tool.group))];
  return <div className="event-workspace">
    <a className="workspace-skip" href="#workspace-content">Skip to content</a>
    <div className="workspace-topbar">
      <Link className="workspace-all-events" href="/events">← All events</Link>
      <nav className="workspace-tabs" aria-label="Event categories">
        {categories.map((category) => <Link key={category.label} href={category.tools[0].href} className={category === active ? "is-active" : undefined} aria-current={category === active ? "true" : undefined}>{category.label}</Link>)}
      </nav>
    </div>
    <aside className="workspace-sidebar">
      <div className="workspace-event"><span className="eyebrow">Event workspace</span><strong>{eventName}</strong></div>
      <nav aria-label={`${active.label} tools`}>
        {groups.map((group) => <div className="workspace-tool-group" key={group}><p>{group}</p>{active.tools.filter((tool) => tool.group === group).map((tool) => <Link key={tool.href} href={tool.href} className={selected?.tool === tool ? "is-active" : undefined} aria-current={selected?.tool === tool ? "page" : undefined}>{tool.label}<span aria-hidden="true">›</span></Link>)}</div>)}
      </nav>
      <div className="workspace-sidebar-note">A place for every detail.<br />More room for your event.</div>
    </aside>
    <div className="workspace-content" id="workspace-content" tabIndex={-1}>{children}</div>
  </div>;
}
