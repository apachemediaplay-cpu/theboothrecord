import { useState, useEffect, useRef, useCallback } from "react";
import BoothHeader from "@/components/BoothHeader";
import BoothFooter from "@/components/BoothFooter";

interface ConfessionEntry {
  id: number;
  confessorId: string;
  timestamp: string;
  confession: string;
  verdict: string;
  verdictHidden: string;
  insertedAt?: number; // epoch ms for relative time
}

const SYSTEM_MESSAGES = [
  "NEW CONFESSION RECORDED",
  "ANOTHER TRUTH LOGGED",
  "CONFESSION ACCEPTED",
  "ENTRY ADDED TO THE WALL",
  "GUILT ARCHIVED",
  "TRUTH CAPTURED",
];

const EXTRA_CONFESSIONS: Omit<ConfessionEntry, "id" | "confessorId" | "timestamp" | "insertedAt">[] = [
  {
    confession: "I read their journal.\nI never told them.",
    verdict: "Privacy violated.",
    verdictHidden: "You consumed someone's inner world without consent. Knowledge stolen is a wound that festers in silence.",
  },
  {
    confession: "I only called\nbecause I needed something.",
    verdict: "Transactional connection logged.",
    verdictHidden: "Every conversation became a negotiation. They felt it, even if they never said it.",
  },
  {
    confession: "I let them take the blame.\nIt was easier.",
    verdict: "Cowardice recorded.",
    verdictHidden: "The truth sat in your throat like a stone. You swallowed it and let someone else choke.",
  },
  {
    confession: "I said I was happy for them.\nI wasn't.",
    verdict: "False joy catalogued.",
    verdictHidden: "Their success illuminated your stagnation. The smile you wore was a mask stitched from resentment.",
  },
  {
    confession: "I kept the money.\nThey never asked for it back.",
    verdict: "Debt unresolved.",
    verdictHidden: "Silence is not forgiveness. The transaction haunts the space between you both.",
  },
  {
    confession: "I watched them struggle\nand said nothing.",
    verdict: "Inaction documented.",
    verdictHidden: "Your silence was a choice. The booth does not distinguish between harm done and harm permitted.",
  },
  {
    confession: "I lied on my résumé.\nI got the job.",
    verdict: "False credentials filed.",
    verdictHidden: "Every accomplishment since rests on a foundation of fabrication. The imposter knows.",
  },
  {
    confession: "I told them I'd changed.\nI haven't even started.",
    verdict: "False promise detected.",
    verdictHidden: "The version of you they believe in does not exist. You perform growth while standing still.",
  },
];

const BASE_CONFESSIONS: ConfessionEntry[] = [
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

  // Update relative time every 10s
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
        <span className="text-muted-foreground/30 text-[9px] tracking-[0.4em] uppercase font-mono-light">
          CONFESSOR {entry.confessorId}
        </span>
        <span className="text-muted-foreground/20 text-[9px]">·</span>
        <span className="text-muted-foreground/30 text-[9px] tracking-[0.2em] font-mono-light">
          {displayTime}
        </span>
      </div>

      <p className="text-foreground text-base md:text-lg font-mono-light leading-[1.6] whitespace-pre-line mb-4 max-w-[600px]">
        {entry.confession}
      </p>

      <div className="max-w-[600px]">
        <p className="text-muted-foreground/30 text-[8px] tracking-[0.5em] uppercase font-mono-light mb-2">
          VERDICT
        </p>
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

const TheWall = () => {
  const feedRef = useRef<HTMLDivElement>(null);
  const [confessions, setConfessions] = useState<ConfessionEntry[]>(
    BASE_CONFESSIONS.map((c) => ({ ...c }))
  );
  const [systemMessage, setSystemMessage] = useState<string | null>(null);
  const [systemMessageVisible, setSystemMessageVisible] = useState(false);
  const nextIdRef = useRef(100);
  const nextConfessorRef = useRef(1850);
  const extraIndexRef = useRef(0);

  // Show a system message briefly
  const flashSystemMessage = useCallback(() => {
    const msg = SYSTEM_MESSAGES[Math.floor(Math.random() * SYSTEM_MESSAGES.length)];
    setSystemMessage(msg);
    setSystemMessageVisible(true);
    setTimeout(() => setSystemMessageVisible(false), 1200);
    setTimeout(() => setSystemMessage(null), 1800);
  }, []);

  // Insert a new confession at the top
  const insertConfession = useCallback(() => {
    const extra = EXTRA_CONFESSIONS[extraIndexRef.current % EXTRA_CONFESSIONS.length];
    extraIndexRef.current++;
    const newId = nextIdRef.current++;
    const confessorNum = nextConfessorRef.current++;

    const newEntry: ConfessionEntry = {
      ...extra,
      id: newId,
      confessorId: `#${confessorNum}`,
      timestamp: new Date().toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      insertedAt: Date.now(),
    };

    flashSystemMessage();
    setTimeout(() => {
      setConfessions((prev) => [{ ...newEntry, id: newId } as ConfessionEntry, ...prev]);
    }, 400);
  }, [flashSystemMessage]);

  // Random insertion every 25-55s
  useEffect(() => {
    const scheduleNext = () => {
      const delay = 25000 + Math.random() * 30000;
      return setTimeout(() => {
        insertConfession();
        timerRef = scheduleNext();
      }, delay);
    };
    let timerRef = scheduleNext();
    return () => clearTimeout(timerRef);
  }, [insertConfession]);

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
    <div className="min-h-[100dvh] bg-background relative overflow-hidden">
      <BoothHeader />

      {/* Ambient scan line */}
      <div
        className="pointer-events-none fixed inset-0 z-10 opacity-[0.03]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, hsl(var(--foreground) / 0.08) 2px, hsl(var(--foreground) / 0.08) 4px)",
          backgroundSize: "100% 4px",
        }}
      />
      {/* Moving scan line */}
      <div
        className="pointer-events-none fixed left-0 right-0 z-10 h-[1px] opacity-[0.06]"
        style={{
          background: "hsl(var(--foreground))",
          animation: "scanline 8s linear infinite",
        }}
      />

      {/* Compact header */}
      <div className="pt-16 pb-4 md:pt-20 md:pb-6 text-center px-6">
        <h1 className="font-control text-2xl md:text-3xl font-bold text-foreground tracking-wide mb-2">
          THE WALL
        </h1>
        <p className="text-muted-foreground/40 text-[10px] md:text-xs font-mono-light tracking-[0.2em] leading-relaxed">
          Some truths don't disappear.
          <br />
          They just get recorded.
        </p>
      </div>

      {/* Live indicator */}
      <div className="flex items-center justify-center gap-2 pb-6 md:pb-8">
        <span className="text-muted-foreground/30 text-[9px] tracking-[0.5em] uppercase font-mono-light">
          LIVE CONFESSIONS
        </span>
        <span
          className="inline-block w-1.5 h-1.5 rounded-full bg-ritual/80"
          style={{ animation: "livePulse 3s ease-in-out infinite" }}
        />
      </div>

      {/* System message flash */}
      <div className="h-5 flex items-center justify-center mb-2">
        {systemMessage && (
          <span
            className={`text-ritual/70 text-[9px] tracking-[0.4em] uppercase font-mono-light transition-all duration-500 ${
              systemMessageVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1"
            }`}
          >
            {systemMessage}
          </span>
        )}
      </div>

      {/* Confession feed */}
      <div ref={feedRef} className="max-w-[720px] mx-auto px-6 pb-32">
        {confessions.map((entry, i) => (
          <div key={entry.id}>
            <ConfessionCard
              entry={entry}
              index={i}
              total={confessions.length}
              isNew={!!entry.insertedAt}
            />
            {i < confessions.length - 1 && (
              <div className="border-t border-border/15 my-7 md:my-8" />
            )}
          </div>
        ))}
      </div>

      <BoothFooter />

      <style>{`
        @keyframes livePulse {
          0%, 100% { opacity: 0.3; box-shadow: 0 0 3px hsl(var(--ritual) / 0.2); }
          50% { opacity: 1; box-shadow: 0 0 8px hsl(var(--ritual) / 0.5); }
        }
        @keyframes scanline {
          0% { top: 0; }
          100% { top: 100vh; }
        }
      `}</style>
    </div>
  );
};

export default TheWall;
