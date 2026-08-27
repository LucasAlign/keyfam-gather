import Link from "next/link";

const features = [
  { number: "01", title: "Know who’s coming", copy: "Keep registrations, households, hosts, and guest details in one calm, reliable place." },
  { number: "02", title: "Run the room", copy: "Shape tables, groups, name tags, and seating without wrestling with scattered spreadsheets." },
  { number: "03", title: "Welcome everyone", copy: "Give every check-in station a fast, shared view—even when the connection gets spotty." },
];

export default function Home() {
  return (
    <div className="landing-page">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-copy">
          <p className="landing-kicker"><span /> Event operations, thoughtfully aligned</p>
          <h1 id="landing-title">More gathering.<br /><em>Less juggling.</em></h1>
          <p className="landing-intro">Gather gives nonprofit teams one clear place to plan the room, welcome every guest, and stay steady through the moments that matter.</p>
          <div className="landing-actions"><Link className="landing-button" href="/login">Explore Gather <span aria-hidden="true">↗</span></Link><a className="landing-text-link" href="#how-it-works">See how it works <span aria-hidden="true">↓</span></a></div>
        </div>
        <div className="landing-scene" aria-label="A visual overview of an event flowing smoothly">
          <div className="landing-orbit orbit-one" /><div className="landing-orbit orbit-two" />
          <div className="landing-scene-card scene-main"><div className="scene-card-top"><span>THE SPRING BENEFIT</span><i>Live</i></div><strong>Everything is<br />coming together.</strong><div className="scene-progress"><span style={{ width: "78%" }} /></div><div className="scene-stats"><div><b>184</b><span>Arrived</span></div><div><b>12</b><span>Tables</span></div><div><b>4</b><span>Stations</span></div></div></div>
          <div className="landing-scene-card scene-check"><span className="scene-checkmark">✓</span><div><strong>Jordan Lee</strong><small>Checked in just now</small></div></div>
          <div className="landing-scene-card scene-table"><span>TABLE 08</span><div className="scene-avatars"><i>JL</i><i>AM</i><i>+6</i></div><small>Ready to welcome</small></div>
          <span className="landing-spark spark-one">✦</span><span className="landing-spark spark-two">✦</span>
        </div>
      </section>
      <section className="landing-belief"><p>Built for the people behind<br />unforgettable moments.</p><div className="landing-belief-note"><span>✦</span><p>Because your attention belongs<br />with people—not process.</p></div></section>
      <section className="landing-how" id="how-it-works" aria-labelledby="how-title">
        <div className="landing-section-heading"><p>HOW GATHER HELPS</p><h2 id="how-title">One shared rhythm,<br /><em>from invite to arrival.</em></h2></div>
        <div className="landing-feature-grid">{features.map((feature) => <article key={feature.number}><span>{feature.number}</span><div className="feature-mark" aria-hidden="true"><i /><i /><i /></div><h3>{feature.title}</h3><p>{feature.copy}</p></article>)}</div>
      </section>
      <section className="landing-quote"><blockquote>“The best event technology<br />quietly gets out of the way.”</blockquote><p>Gather keeps the details connected so your team can stay present, responsive, and focused on the experience you’re creating together.</p></section>
      <section className="landing-cta"><div><p>READY WHEN YOU ARE</p><h2>Bring your next<br />gathering <em>into focus.</em></h2></div><Link className="landing-button landing-button-light" href="/login">Start with Gather <span aria-hidden="true">↗</span></Link></section>
      <footer className="landing-footer"><span>Gather is a Lucas Align project.</span><span>Designed for people doing meaningful work.</span></footer>
    </div>
  );
}
