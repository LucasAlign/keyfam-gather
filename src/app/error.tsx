"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <section className="empty"><h1>Something didn’t go as planned</h1><p>Your information is safe. Try the page again.</p><button className="button" onClick={reset}>Try again</button></section>; }
