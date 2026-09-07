import { updateRecommendation } from "@/app/recommendation-actions";

type CardRecommendation = { kind: string; dedupeKey: string; sourceFingerprint: string; title: string; why: string; evidence: Record<string, string | number | boolean | null>; proposedAction: { type: "REVIEW_WORKSPACE"; href: string; label: string }; expectedImpact: string; confidence?: number };

function DecisionFields({ eventId, item }: { eventId: string; item: CardRecommendation }) {
  return <><input type="hidden" name="eventId" value={eventId} /><input type="hidden" name="dedupeKey" value={item.dedupeKey} /><input type="hidden" name="sourceFingerprint" value={item.sourceFingerprint} /></>;
}

export function RecommendationCard({ eventId, item }: { eventId: string; item: CardRecommendation }) {
  return <article className="recommendation-card"><div><span className="status">Recommended</span><h3>{item.title}</h3><p><strong>Why this matters:</strong> {item.why}</p><details><summary>Review evidence and impact</summary><dl>{Object.entries(item.evidence).map(([label, value]) => <div key={label}><dt>{label.replace(/([A-Z])/g, " $1")}</dt><dd>{String(value)}</dd></div>)}</dl><p><strong>Expected impact:</strong> {item.expectedImpact}</p>{item.confidence !== undefined && <small>Confidence: {Math.round(item.confidence * 100)}%</small>}</details></div><div className="recommendation-actions"><form action={updateRecommendation}><DecisionFields eventId={eventId} item={item} /><button className="button" name="decision" value="APPROVE">{item.proposedAction.label}</button></form><form action={updateRecommendation}><DecisionFields eventId={eventId} item={item} /><input type="hidden" name="snoozeDays" value="1" /><button name="decision" value="SNOOZE">Remind tomorrow</button></form><form action={updateRecommendation}><DecisionFields eventId={eventId} item={item} /><button name="decision" value="DISMISS">Dismiss</button></form></div></article>;
}
