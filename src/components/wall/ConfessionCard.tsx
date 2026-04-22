import { useState, useEffect } from "react";

export interface ConfessionEntry {
  id: number;
  confessorId: string;
  timestamp: string;
  confession: string;
  verdict: string;
  verdictHidden: string;
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
      className={`group transition-all duration-700 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
      }`}
      style={{ opacity: visible ? opacityFactor : 0 }}
    >
      <div className="flex items-center gap-3 mb-4">
        <span className="text-muted-foreground/80 text-[9px] tracking-[0.4em] uppercase font-mono-light">
          SUBJECT {entry.confessorId}
        </span>
        <span className="text-muted-foreground/20 text-[9px]">·</span>
        <span className="text-muted-foreground/80 text-[9px] tracking-[0.2em] font-mono-light">
          {displayTime}
        </span>
      </div>

      <p className="text-foreground text-base md:text-lg font-mono-light leading-[1.6] whitespace-pre-line mb-4 max-w-[600px]">
        {entry.confession}
      </p>

      <div className="max-w-[600px]">
        <p className="text-ritual text-xs font-mono-light tracking-wide mb-1 opacity-80">
          {entry.verdict}
        </p>
        <div className="relative overflow-hidden h-8 transition-all duration-500 group-hover:h-9">
          <p className="text-muted-foreground/50 text-xs font-mono-light leading-relaxed select-none">
            {entry.verdictHidden}
          </p>
          <div className="absolute inset-0 backdrop-blur-[6px] transition-all duration-500 group-hover:backdrop-blur-[4px]" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/70 to-background" />
        </div>
      </div>
    </div>
  );
};

export default ConfessionCard;
