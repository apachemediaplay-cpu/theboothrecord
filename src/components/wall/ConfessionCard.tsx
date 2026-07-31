import { useState, useEffect } from "react";

export interface ConfessionEntry {
  id: number;
  confessorId: string;
  timestamp: string;
  confession: string;
  verdict: string;
  insertedAt?: number;
}

function getRelativeTime(insertedAt: number | undefined): string | null {
  if (!insertedAt) return null;
  const diff = Date.now() - insertedAt;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 10) return "Just now";
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  return null;
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
  const [relativeTime, setRelativeTime] = useState<string | null>(
    getRelativeTime(entry.insertedAt)
  );

  useEffect(() => {
    if (isNew) {
      const timer = setTimeout(() => setVisible(true), 50);
      return () => clearTimeout(timer);
    }
  }, [isNew]);

  useEffect(() => {
    if (!entry.insertedAt) return;
    const interval = setInterval(() => {
      setRelativeTime(getRelativeTime(entry.insertedAt));
    }, 10000);
    return () => clearInterval(interval);
  }, [entry.insertedAt]);

  const opacityFactor = 1 - (index / total) * 0.3;
  const displayTime = relativeTime || entry.timestamp;

  return (
    <div
      className={`transition-all duration-700 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
      }`}
      style={{ opacity: visible ? opacityFactor : 0 }}
    >
      <div className="flex items-center gap-3 mb-2">
        <span className="text-muted-foreground/80 text-[9px] tracking-[0.4em] uppercase font-mono-light">
          SUBJECT {entry.confessorId}
        </span>
        <span className="text-muted-foreground/20 text-[9px]">·</span>
        <span className="text-muted-foreground/80 text-[9px] tracking-[0.2em] font-mono-light">
          {displayTime}
        </span>
      </div>

      {/* Hierarchy matches Verdict / VerdictShare: confession muted and secondary
          above, the full verdict prominent below — one system across all three. */}
      <p className="text-muted-foreground text-base md:text-lg font-mono-light leading-relaxed tracking-wide whitespace-pre-line mb-2 max-w-[600px]">
        {entry.confession}
      </p>

      <p className="font-control font-bold text-foreground text-xl md:text-2xl leading-tight whitespace-pre-line max-w-[600px]">
        {entry.verdict}
      </p>
    </div>
  );
};

export default ConfessionCard;
