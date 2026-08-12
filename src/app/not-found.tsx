import Link from "next/link";
export default function NotFound() { return <section className="empty"><h1>We couldn’t find that event</h1><p>It may have been removed or the link may be incorrect.</p><Link className="button" href="/">Back to events</Link></section>; }
