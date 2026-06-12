import { Activity } from "lucide-react";

export default function ActivityFeed({ log, running }) {
  const lines = log.slice(-7);
  return (
    <section className="panel feed">
      <div className="lbl"><Activity size={11} /> agent activity</div>
      <div className="log">
        {lines.map((l, i) => (
          <div key={`${l.t}-${i}-${l.text}`} className={`line lv-${l.level}`}>
            <span className="log-t mono">{l.t}</span>
            <span className="log-dot" />
            <span className="mono">{l.text}</span>
          </div>
        ))}
        {running && (
          <div className="working">
            <span className="log-t mono" />
            <span className="working-dots">working</span>
          </div>
        )}
      </div>
    </section>
  );
}
