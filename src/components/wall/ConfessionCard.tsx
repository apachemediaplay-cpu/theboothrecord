import { useState, useEffect } from "react";

export interface ConfessionEntry {
  id: number;
  confessorId: string;
  createdAtMs: number;
  timestamp: string; // date fallback for confessions older than 7 days
  confession: string;
  verdict: string;
  insertedAt?: number;
}

// Relative age for the metadata line: "4 MIN AGO" / "1 HR AGO" / "3 DAYS AGO",
// falling back to the absolute date past 7 days. Uppercase by convention — the
// metadata spans render with the uppercase class either way.
function timeLabel(createdAtMs: number, fallback: string): string {
  const mins = Math.floor((Date.now() - createdAtMs) / 60000);
  if (mins < 1) return "JUST NOW";
  if (mins < 60) return `${mins} MIN AGO`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} HR AGO`;
  const days = Math.floor(hrs / 24);
  if (days <= 7) return `${days} ${days === 1 ? "DAY" : "DAYS"} AGO`;
  return fallback;
}

const ConfessionCard = ({
  entry,
  index,
  total,
  isNew,
}: {
  entry: ConfessionEntry;
  index: number;
  total: number;
  isNew?: boolean;
}) => {
  const [visible, setVisible] = useState(!isNew);

  useEffect(() => {
    if (isNew) {
      const timer = setTimeout(() => setVisible(true), 50);
      return () => clearTimeout(timer);
    }
  }, [isNew]);

  // Keep the relative age honest while the reader lingers (auto-scroll makes long
  // sessions normal). Once past the 7-day date fallback the label never changes,
  // so the minute tick is skipped entirely.
  const [, tick] = useState(0);
  useEffect(() => {
    if (Date.now() - entry.createdAtMs > 7 * 24 * 3600 * 1000) return;
    const interval = setInterval(() => tick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, [entry.createdAtMs]);

  const opacityFactor = 1 - (index / total) * 0.3;
  const displayTime = timeLabel(entry.createdAtMs, entry.timestamp);

  return (
    <div
      className={`transition-all duration-700 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
      }`}
      style={{ opacity: visible ? opacityFactor : 0 }}
    >
      {/* Confession + verdict read as ONE UNIT at roughly equal weight — two voices,
          not headline and subtitle. Mono renders visually smaller than Control, so
          12.5px mono ≈ 14px Control. 6px inside the pair; the ~52px gap BETWEEN
          records lives on the wrapper in TheWall. */}
      <p className="text-foreground/70 text-[12.5px] font-mono-light leading-relaxed tracking-wide whitespace-pre-line mb-1.5">
        {entry.confession}
      </p>

      <p className="font-control font-bold text-foreground text-[14px] leading-snug whitespace-pre-line">
        {entry.verdict}
      </p>

      {/* Filing stamp — CLOSES the record, beneath the verdict, in State Blue:
          the State's apparatus filed this; it is not the Booth's voice and not
          the confessor's. "#1121 · 4 MIN AGO". */}
      <div className="mt-3.5 flex items-center gap-3">
        <span className="text-[hsl(var(--state-blue)/0.65)] text-[8px] tracking-[0.22em] uppercase font-mono-light">
          {entry.confessorId}
        </span>
        <span className="text-[hsl(var(--state-blue)/0.65)] text-[8px]">·</span>
        <span className="text-[hsl(var(--state-blue)/0.65)] text-[8px] tracking-[0.22em] uppercase font-mono-light">
          {displayTime}
        </span>
      </div>
    </div>
  );
};

export default ConfessionCard;
