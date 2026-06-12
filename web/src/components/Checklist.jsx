import { Check } from "lucide-react";

export default function Checklist({ points }) {
  return (
    <section className="panel">
      <div className="lbl">corner cases</div>
      <ul className="checks">
        {points.map((p) => (
          <li key={p.name} className={p.hit ? "hit" : ""}>
            <span className="tick">
              {p.hit ? <Check size={13} strokeWidth={3} /> : null}
            </span>
            {p.name}
          </li>
        ))}
      </ul>
    </section>
  );
}
