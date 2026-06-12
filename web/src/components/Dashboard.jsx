import CoverageChart from "./CoverageChart";
import Checklist from "./Checklist";
import ActivityFeed from "./ActivityFeed";
import BugCard from "./BugCard";
import StatsStrip from "./StatsStrip";

export default function Dashboard({ sim, disp, onInspect }) {
  return (
    <main className="grid">
      <CoverageChart sim={sim} disp={disp} />
      <Checklist points={sim.points} />
      <ActivityFeed log={sim.activity_log} running={sim.status === "running"} />
      {sim.bug && <BugCard bug={sim.bug} onInspect={onInspect} />}
      <StatsStrip counts={sim.counts} memory={sim.memory} />
    </main>
  );
}
