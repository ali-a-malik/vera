// Failing-cycle illustration for the planted FIFO bug: the actual `full`
// (rose) rises one write earlier than the expected `full` (dashed emerald).
// `writes` = writes in the minimal repro (the cycle index where actual rises).

export default function Waveform({ writes = 7 }) {
  const CYC = 12, x0 = 92, cw = 48, w = x0 + CYC * cw, rh = 26, gap = 18;
  const actRise = writes;          // actual full rises after the Nth write
  const expRise = writes + 1;      // expected full rises one write later
  const rows = [
    { name: "clk", arr: Array.from({ length: CYC }, (_, i) => i % 2), color: "rgba(255,255,255,.30)", dash: false },
    { name: "wr_en", arr: Array.from({ length: CYC }, (_, i) => (i < expRise ? 1 : 0)), color: "rgba(255,255,255,.45)", dash: false },
    { name: "full · exp", arr: Array.from({ length: CYC }, (_, i) => (i >= expRise ? 1 : 0)), color: "#34d399", dash: true },
    { name: "full · act", arr: Array.from({ length: CYC }, (_, i) => (i >= actRise ? 1 : 0)), color: "#fb7185", dash: false },
  ];
  const path = (arr, top) => {
    const hi = top + 4, lo = top + rh - 4;
    const y = (v) => (v ? hi : lo);
    let d = `M ${x0} ${y(arr[0])}`;
    for (let i = 1; i < CYC; i++) {
      const xi = x0 + i * cw;
      d += ` H ${xi}`;
      if (arr[i] !== arr[i - 1]) d += ` V ${y(arr[i])}`;
    }
    d += ` H ${x0 + CYC * cw}`;
    return d;
  };
  const totalH = rows.length * (rh + gap) + 26;
  const bandX = x0 + actRise * cw;
  const counts = Array.from({ length: CYC }, (_, i) => Math.min(i + 1, expRise));

  return (
    <svg className="wave" viewBox={`0 0 ${w + 16} ${totalH}`} width="100%">
      <rect x={bandX} y={6} width={cw} height={rows.length * (rh + gap) - gap + 4}
        fill="rgba(251,113,133,.10)" />
      <line x1={bandX} y1={6} x2={bandX} y2={rows.length * (rh + gap) - gap + 10}
        stroke="rgba(251,113,133,.4)" strokeWidth="1" strokeDasharray="3 3" />
      {Array.from({ length: CYC + 1 }, (_, i) => (
        <line key={i} x1={x0 + i * cw} y1={6} x2={x0 + i * cw}
          y2={rows.length * (rh + gap) - gap + 6}
          stroke="rgba(255,255,255,.04)" strokeWidth="1" />
      ))}
      {rows.map((r, ri) => {
        const top = 6 + ri * (rh + gap);
        return (
          <g key={r.name}>
            <text x={8} y={top + rh / 2 + 4} className="wlbl">{r.name}</text>
            <path d={path(r.arr, top)} fill="none" stroke={r.color}
              strokeWidth="1.6" strokeDasharray={r.dash ? "5 4" : "0"}
              className="wsig" style={{ animationDelay: `${ri * 0.12}s` }} />
          </g>
        );
      })}
      <text x={8} y={totalH - 4} className="wlbl">count</text>
      {counts.map((c, i) => (
        <text key={i} x={x0 + i * cw + cw / 2} y={totalH - 4}
          className="wcount" textAnchor="middle">{c}</text>
      ))}
    </svg>
  );
}
