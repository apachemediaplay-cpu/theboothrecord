import { useState, useEffect, useRef } from "react";
import BoothHeader from "@/components/BoothHeader";
import BoothFooter from "@/components/BoothFooter";

interface ConfessionEntry {
  id: number;
  confessorId: string;
  timestamp: string;
  confession: string;
  verdict: string;
  verdictHidden: string;
}

const CONFESSIONS: ConfessionEntry[] = [
  {
    id: 1,
    confessorId: "#1842",
    timestamp: "12 Mar 2026 — 11:48 PM",
    confession: "I told them I was busy…\nbut I just didn't want to see them.",
    verdict: "Avoidance catalogued.",
    verdictHidden: "The distance you maintain is a mirror you refuse to look into. Guilt festers in silence.",
  },
  {
    id: 2,
    confessorId: "#1839",
    timestamp: "11 Mar 2026 — 09:14 PM",
    confession: "I said it didn't matter.\nBut I still check their profile.",
    verdict: "Attachment remains.",
    verdictHidden: "You hold onto what you claim to have released. The algorithm of longing does not forget.",
  },
  {
    id: 3,
    confessorId: "#1831",
    timestamp: "10 Mar 2026 — 03:22 AM",
    confession: "I smiled when they failed.\nI hated myself for it.",
    verdict: "Envy acknowledged.",
    verdictHidden: "Schadenfreude is the confession within the confession. Your awareness is the only redemption offered.",
  },
  {
    id: 4,
    confessorId: "#1824",
    timestamp: "09 Mar 2026 — 07:55 PM",
    confession: "I took the credit.\nThey'll never know.",
    verdict: "Theft of recognition logged.",
    verdictHidden: "The weight of stolen praise compounds silently. Every compliment you receive echoes with debt.",
  },
  {
    id: 5,
    confessorId: "#1817",
    timestamp: "08 Mar 2026 — 11:01 PM",
    confession: "I told her I forgave her.\nI haven't.",
    verdict: "False absolution detected.",
    verdictHidden: "Forgiveness spoken without conviction is just another form of deception. The wound remains open.",
  },
  {
    id: 6,
    confessorId: "#1809",
    timestamp: "07 Mar 2026 — 02:33 AM",
    confession: "I deleted the messages\nbefore anyone could see.",
    verdict: "Evidence destroyed.",
    verdictHidden: "Digital erasure does not erase memory. The booth remembers what you choose to forget.",
  },
  {
    id: 7,
    confessorId: "#1802",
    timestamp: "06 Mar 2026 — 06:17 PM",
    confession: "I pretend to care about things\nthat mean nothing to me.",
    verdict: "Performed empathy noted.",
    verdictHidden: "The mask you wear fits so well you've forgotten it's there. Authenticity is the first casualty.",
  },
];

const ConfessionEntry = ({
  entry,
  index,
  total,
}: {
  entry: ConfessionEntry;
  index: number;
  total: number;
}) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), index * 100);
    return () => clearTimeout(timer);
  }, [index]);

  // Fade older entries: newest = 1, oldest approaches 0.7
  const opacityFactor = 1 - (index / total) * 0.3;

  return (
    <div
      className={`group transition-all duration-700 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
      }`}
      style={{ opacity: visible ? opacityFactor : 0 }}
    >
      {/* Confessor ID + Timestamp */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-muted-foreground/30 text-[9px] tracking-[0.4em] uppercase font-mono-light">
          CONFESSOR {entry.confessorId}
        </span>
        <span className="text-muted-foreground/20 text-[9px]">·</span>
        <span className="text-muted-foreground/30 text-[9px] tracking-[0.2em] font-mono-light">
          {entry.timestamp}
        </span>
      </div>

      {/* Confession — primary focus */}
      <p className="text-foreground text-base md:text-lg font-mono-light leading-[1.6] whitespace-pre-line mb-4 max-w-[600px]">
        {entry.confession}
      </p>

      {/* Verdict — secondary */}
      <div className="max-w-[600px]">
        <p className="text-muted-foreground/30 text-[8px] tracking-[0.5em] uppercase font-mono-light mb-2">
          VERDICT
        </p>
        <p className="text-ritual text-xs font-mono-light tracking-wide mb-1 opacity-80">
          {entry.verdict}
        </p>

        {/* Gradient-blurred hidden verdict */}
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

const TheWall = () => {
  const feedRef = useRef<HTMLDivElement>(null);

  // Very slow auto-scroll
  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    const interval = setInterval(() => {
      el.scrollTop += 0.4;
    }, 50);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-[100dvh] bg-background">
      <BoothHeader />

      {/* Compact header */}
      <div className="pt-16 pb-8 md:pt-20 md:pb-10 text-center px-6">
        <h1 className="font-control text-2xl md:text-3xl font-bold text-foreground tracking-wide mb-2">
          THE WALL
        </h1>
        <p className="text-muted-foreground/40 text-[10px] md:text-xs font-mono-light tracking-[0.2em] leading-relaxed">
          Some truths don't disappear.
          <br />
          They just get recorded.
        </p>
      </div>

      {/* Continuous feed */}
      <div
        ref={feedRef}
        className="max-w-[720px] mx-auto px-6 pb-32"
      >
        {CONFESSIONS.map((entry, i) => (
          <div key={entry.id}>
            <ConfessionEntry entry={entry} index={i} total={CONFESSIONS.length} />
            {i < CONFESSIONS.length - 1 && (
              <div className="border-t border-border/15 my-7 md:my-8" />
            )}
          </div>
        ))}
      </div>

      <BoothFooter />
    </div>
  );
};

export default TheWall;
