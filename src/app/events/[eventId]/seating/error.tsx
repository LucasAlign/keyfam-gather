"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <div className="empty"><h1>We could not load seating</h1><p>Try again. Your existing assignments have not been changed.</p><button className="button" onClick={reset}>Try again</button></div>; }
