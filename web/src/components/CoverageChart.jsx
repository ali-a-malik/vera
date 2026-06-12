import {
  Area, AreaChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis,
} from "recharts";

export default function CoverageChart({ sim, disp }) {
  return (
    <section className="panel hero">
      <div className="hero-l">
        <div className="lbl">functional coverage</div>
        <div className="cov-num mono">
          {Math.round(disp)}<span className="cov-pct">%</span>
        </div>
        <div className="hero-meta mono">
          iteration {sim.iteration} · target {sim.target}%
        </div>
      </div>
      <div className="chart">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={sim.history} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
            <defs>
              <linearGradient id="cov" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="iter" hide />
            <YAxis
              domain={[0, 100]} ticks={[0, 50, 100]} width={40}
              axisLine={false} tickLine={false}
              tick={{ fill: "#5b606b", fontSize: 11, fontFamily: "monospace" }}
            />
            <ReferenceLine
              y={sim.target} stroke="rgba(255,255,255,.18)" strokeDasharray="4 4"
              label={{ value: "target", position: "right", fill: "#5b606b", fontSize: 10 }}
            />
            <Area
              type="monotone" dataKey="coverage" stroke="#34d399" strokeWidth={2}
              fill="url(#cov)" dot={false} activeDot={false} isAnimationActive
              animationDuration={500}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
