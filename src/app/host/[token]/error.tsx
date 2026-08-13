"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <div className="empty"><h1>We could not open this group</h1><p>Try again. If the problem continues, ask event staff for help.</p><button className="button" onClick={reset}>Try again</button></div>; }
