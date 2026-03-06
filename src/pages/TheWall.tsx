import { useState, useEffect } from "react";
import BoothHeader from "@/components/BoothHeader";
import BoothFooter from "@/components/BoothFooter";

interface ConfessionEntry {
  id: number;
  timestamp: string;
  confession: string;
  verdict: string;
  verdictHidden: string;
}

const PLACEHOLDER_CONFESSIONS: ConfessionEntry[] = [
  {
    id: 1,
    timestamp: "12 Mar 2026 — 11:48 PM",
    confession: "I told them I was busy…\nbut I just didn't want to see them.",
    verdict: "Avoidance catalogued.",
    verdictHidden: "The distance you maintain is a mirror you refuse to look into. Guilt festers in silence.",
  },
  {
    id: 2,
    timestamp: "11 Mar 2026 — 09:14 PM",
    confession: "I said it didn't matter.\nBut I still check their profile.",
    verdict: "Attachment remains.",
    verdictHidden: "You hold onto what you claim to have released. The algorithm of longing does not forget.",
  },
  {
    id: 3,
    timestamp: "10 Mar 2026 — 03:22 AM",
    confession: "I smiled when they failed.\nI hated myself for it.",
    verdict: "Envy acknowledged.",
    verdictHidden: "Schadenfreude is the confession within the confession. Your awareness is the only redemption offered.",
  },
  {
    id: 4,
    timestamp: "09 Mar 2026 — 07:55 PM",
    confession: "I took the credit.\nThey'll never know.",
    verdict: "Theft of recognition logged.",
    verdictHidden: "The weight of stolen praise compounds silently. Every compliment you receive echoes with debt.",
  },
  {
    id: 5,
    timestamp: "08 Mar 2026 — 11:01 PM",
    confession: "I told her I forgave her.\nI haven't.",
    verdict: "False absolution detected.",
    verdictHidden: "Forgiveness spoken without conviction is just another form of deception. The wound remains open.",
  },
  {
    id: 6,
    timestamp: "07 Mar 2026 — 02:33 AM",
    confession: "I deleted the messages\nbefore anyone could see.",
    verdict: "Evidence destroyed.",
    verdictHidden: "Digital erasure does not erase memory. The booth remembers what you choose to forget.",
  },
  {
    id: 7,
    timestamp: "06 Mar 2026 — 06:17 PM",
    confession: "I pretend to care about things\nthat mean nothing to me.",
    verdict: "Performed empathy noted.",
    verdictHidden: "The mask you wear fits so well you've forgotten it's there. Authenticity is the first casualty.",
  },
];

const ConfessionCard = ({ entry, index }: { entry: ConfessionEntry; index: number }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), index * 120);
    return () => clearTimeout(timer);
  }, [index]);

  return (
    <div
      className={`group relative border border-border/40 bg-secondary/30 backdrop-blur-sm rounded-sm px-6 py-7 md:px-8 md:py-9 transition-all duration-700 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      } hover:border-muted-foreground/30 hover:shadow-[0_0_40px_-12px_hsl(var(--ritual-green)/0.08)]`}
    >
      {/* Timestamp */}
      <p className="text-muted-foreground/50 text-[10px] tracking-[0.3em] uppercase font-mono-light mb-5">
        {entry.timestamp}
      </p>

      {/* Confession */}
      <p className="text-foreground text-base md:text-lg font-mono-light leading-relaxed whitespace-pre-line mb-7">
        {entry.confession}
      </p>

      {/* Verdict */}
      <div className="border-t border-border/30 pt-5">
        <p className="text-muted-foreground/40 text-[9px] tracking-[0.4em] uppercase font-mono-light mb-3">
          VERDICT
        </p>
        <p className="text-ritual text-sm font-mono-light tracking-wide mb-2">
          {entry.verdict}
        </p>

        {/* Blurred / redacted verdict */}
        <div className="relative overflow-hidden h-10 transition-all duration-500 group-hover:h-11">
          <p className="text-muted-foreground text-sm font-mono-light leading-relaxed select-none">
            {entry.verdictHidden}
          </p>
          <div className="absolute inset-0 backdrop-blur-[6px] transition-all duration-500 group-hover:backdrop-blur-[5px]" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-secondary/60 to-secondary/90" />
        </div>
      </div>
    </div>
  );
};

const TheWall = () => {
  return (
    <div className="min-h-[100dvh] bg-background">
      <BoothHeader />

      {/* Header */}
      <div className="pt-20 pb-12 md:pt-24 md:pb-16 text-center px-6">
        <h1 className="font-control text-4xl md:text-6xl font-bold text-foreground tracking-wide mb-4">
          THE WALL
        </h1>
        <p className="text-muted-foreground text-xs md:text-sm font-mono-light tracking-[0.2em] leading-relaxed max-w-sm mx-auto">
          Some truths don't disappear.
          <br />
          They just get recorded.
        </p>
      </div>

      {/* Feed */}
      <div className="max-w-[680px] mx-auto px-6 pb-32 flex flex-col gap-9 md:gap-10">
        {PLACEHOLDER_CONFESSIONS.map((entry, i) => (
          <ConfessionCard key={entry.id} entry={entry} index={i} />
        ))}
      </div>

      <BoothFooter />
    </div>
  );
};

export default TheWall;
