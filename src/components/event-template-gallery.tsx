import Link from "next/link";
import { EVENT_TEMPLATES } from "@/lib/event-templates";

// Home-screen launcher: a prefab template per common event shape, plus a
// blank-slate card. Each template links to the new-event form with its slug so
// the form opens pre-filled. Rendered only where the viewer can create events.
export function EventTemplateGallery({ heading = "Start a new event" }: { heading?: string }) {
  return <section className="template-gallery" aria-label={heading}>
    <div className="section-heading"><div><p className="eyebrow">Quick start</p><h2>{heading}</h2></div></div>
    <div className="template-grid">
      {EVENT_TEMPLATES.map((template) => <Link key={template.slug} className="template-card" href={`/events/new?template=${template.slug}`}>
        <span className="template-emoji" aria-hidden="true">{template.emoji}</span>
        <strong>{template.label}</strong>
        <p>{template.tagline}</p>
      </Link>)}
      <Link className="template-card template-card-blank" href="/events/new">
        <span className="template-emoji" aria-hidden="true">＋</span>
        <strong>Start from scratch</strong>
        <p>Build an event with your own details, or describe it for a suggested setup.</p>
      </Link>
    </div>
  </section>;
}
