"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <div className="empty"><h1>Check-in could not load</h1><p>Confirm the connection and try again.</p><button className="button" onClick={reset}>Try again</button></div>; }
