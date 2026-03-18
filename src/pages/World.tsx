import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import guiltyLogoRed from "@/assets/guilty-logo-red.svg";
import guiltyLogoWhite from "@/assets/guilty-logo-white.svg";
import heroCan from "@/assets/retail/hero-can.png";
import colaVice from "@/assets/retail/cola-vice.png";
import citrusConfessional from "@/assets/retail/citrus-confessional.png";
import bitterJustice from "@/assets/retail/bitter-justice.png";
import contextBar from "@/assets/retail/context-bar.png";
import contextRetail from "@/assets/retail/context-retail.png";
import contextSpirits from "@/assets/retail/context-spirits.png";
import contextStudio from "@/assets/retail/context-studio.png";

/* ─── Data ────────────────────────────────────────────── */

const flavours = [
  {
    name: "Citrus Confessional",
    subtitle: "Lemon + Yuzu",
    description:
      "Bright citrus with real acidity. Lemon brings sharpness while yuzu adds aromatic lift. The drink stays bright rather than sweet. The finish clears quickly.",
    warning: "WARNING: Evidence of indulgence.",
    ingredients: ["Lemon juice", "Yuzu juice", "Raw sugar", "Carbonated"],
    technical:
      "~5.5g sugar per 100ml. Built on Japanese yuzu juice with natural citrus extracts.",
    closing: "The first one rarely needs explaining.",
    notes: ["Lemon", "Yuzu"],
    image: citrusConfessional,
  },
  {
    name: "Bitter Justice",
    subtitle: "Blood Orange + Ginger",
    description:
      "Blood orange with ginger heat and a bitter edge. Blood orange brings depth while ginger adds warmth and lift. The bitterness lingers. Carbonation keeps the finish clean.",
    warning: "WARNING: Evidence of indulgence.",
    ingredients: ["Blood orange juice", "Ginger juice", "Raw sugar", "Carbonated"],
    technical:
      "~6g sugar per 100ml. Built on blood orange juice with bitter orange and juniper extracts.",
    closing: "Justice rarely tastes sweet.",
    notes: ["Blood orange", "Ginger"],
    image: bitterJustice,
  },
  {
    name: "Cola Vice",
    subtitle: "Spiced Cola",
    description:
      "Dark cola with citrus and warm spice. Kola nut and lime bring brightness while clove and cassia add depth. Sweetness supports the spice rather than dominating it. The drink dries slightly.",
    warning: "WARNING: Evidence of indulgence.",
    ingredients: ["Lime juice", "Kola nut extract", "Raw sugar", "Carbonated"],
    technical:
      "~7.5g sugar per 100ml. Built on kola nut and lime with warm spice extracts for balance.",
    closing: "Some vices age well.",
    notes: ["Spice", "Cola", "Lime"],
    image: colaVice,
  },
];

const contextImages = [
  { src: contextBar, alt: "GUILTY in a dimly lit bar" },
  { src: contextRetail, alt: "GUILTY on a boutique shelf" },
  { src: contextSpirits, alt: "GUILTY beside spirits" },
  { src: contextStudio, alt: "GUILTY in low studio light" },
];

const contrabandDrops = [
  {
    code: "DROP-001",
    label: "CLASSIFIED",
    status: "RESTRICTED",
    note: "Monitored.",
  },
  {
    code: "DROP-002",
    label: "REDACTED",
    status: "REFORMED",
    note: "Reformed. Access revoked.",
  },
  {
    code: "DROP-003",
    label: "PENDING",
    status: "DISAPPEARED",
    note: "Quietly disappeared.",
  },
];

interface ConfessionPreview {
  confession: string;
  verdict: string;
  verdictHidden: string;
  confessorId: string;
}

/* ─── Shared styles ───────────────────────────────────── */

const SECTION = "px-6 md:px-10 py-28 md:py-40";
const H2 = "font-control text-3xl md:text-5xl font-bold";
const LABEL =
  "text-muted-foreground text-[10px] tracking-[0.35em] uppercase font-mono-light";
const BODY =
  "text-muted-foreground text-sm leading-[1.9] font-mono-light";

/* ─── Component ───────────────────────────────────────── */

const World = () => {
  const [confessions, setConfessions] = useState<ConfessionPreview[]>([]);
  const scanRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const baseUrl = import.meta.env.VITE_BASE_URL;
    fetch(`${baseUrl}/v1/confessions`)
      .then((res) => res.json())
      .then((data) => {
        const items = (data?.data?.confessions || [])
          .slice(0, 3)
          .map(
            (c: { content: string; response: string }, i: number) => {
              const sentences = c.response.split(/(?<=\.)\s+/);
              return {
                confession: c.content,
                verdict: sentences[0] || "Verdict rendered.",
                verdictHidden: sentences.slice(1).join(" ") || "",
                confessorId: `#${1842 - i}`,
              };
            }
          );
        setConfessions(items);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Hero ─────────────────────────────────────── */}
      <section className="relative h-screen flex flex-col items-center justify-end overflow-hidden">
        <img
          src={heroCan}
          alt="GUILTY Soda"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        <div className="relative z-10 flex flex-col items-center text-center px-6 pb-16 md:pb-24">
          <img
            src={guiltyLogoWhite}
            alt="GUILTY"
            className="h-10 mb-10 opacity-80"
          />
          <h1 className="font-control text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight mb-6">
            Indulgence has a name.
          </h1>
          <p className={`${BODY} max-w-md mb-6 tracking-wide`}>
            A world built around flavour, ritual and things that don't explain themselves.
          </p>
        </div>
      </section>

      {/* ── The Drinks ───────────────────────────────── */}
      <section className="px-6 md:px-10 py-28 md:py-40 bg-white text-neutral-900">
        <div className="max-w-6xl mx-auto">
          <p className="text-neutral-500 text-[10px] tracking-[0.35em] uppercase font-mono-light text-center mb-4">
            The Range
          </p>
          <h2 className="font-control text-3xl md:text-5xl font-bold text-neutral-900 text-center mb-20 md:mb-28">
            Three Signature Flavours
          </h2>
          <div className="space-y-28 md:space-y-40">
            {flavours.map((f, i) => (
              <div
                key={f.name}
                className={`grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-center ${
                  i % 2 !== 0 ? "md:[direction:rtl]" : ""
                }`}
              >
                <div className="flex justify-center">
                  <img
                    src={f.image}
                    alt={f.name}
                    className="w-56 md:w-72 lg:w-80"
                  />
                </div>
                <div className={i % 2 !== 0 ? "md:[direction:ltr]" : ""}>
                  <h3 className="font-control text-2xl md:text-4xl font-bold text-neutral-900 mb-1">
                    {f.name}
                  </h3>
                  <p className="text-neutral-500 text-sm italic mb-6 font-mono-light">
                    {f.subtitle}
                  </p>
                  <p className="text-neutral-700 text-xs leading-[1.9] mb-4 max-w-sm font-mono-light">
                    {f.description}
                  </p>
                  <p className="text-neutral-800 text-[10px] tracking-[0.2em] uppercase font-bold mb-4 font-mono-light">
                    {f.warning}
                  </p>
                  <ul className="text-neutral-700 text-xs leading-[1.9] mb-4 max-w-sm font-mono-light list-disc list-inside">
                    {f.ingredients.map((ing) => (
                      <li key={ing}>{ing}</li>
                    ))}
                  </ul>
                  <p className="text-neutral-500 text-[10px] tracking-[0.15em] uppercase mb-1 font-mono-light">
                    Technical
                  </p>
                  <p className="text-neutral-700 text-xs leading-[1.9] mb-4 max-w-sm font-mono-light">
                    {f.technical}
                  </p>
                  <p className="text-neutral-600 text-sm italic mb-6 font-mono-light">
                    {f.closing}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {f.notes.map((note) => (
                      <span
                        key={note}
                        className="px-4 py-1.5 border border-neutral-300 text-[10px] tracking-[0.2em] uppercase text-neutral-600"
                      >
                        {note}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Venues ───────────────────────────────────── */}
      <section className={SECTION}>
        <div className="max-w-6xl mx-auto">
          <div className="max-w-2xl mx-auto text-center mb-16 md:mb-24">
            <p className={`${LABEL} mb-4`}>Where It Lives</p>
            <h2 className={`${H2} mb-8`}>Bars. Late Nights. Places That Don't Explain Themselves.</h2>
            <p className={`${BODY} max-w-lg mx-auto`}>
              GUILTY exists in environments that already understand indulgence. The drink was designed for the spaces, not the other way around.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-1">
            {contextImages.map((img) => (
              <img
                key={img.alt}
                src={img.src}
                alt={img.alt}
                className="w-full aspect-[3/4] object-cover"
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── Contraband ───────────────────────────────── */}
      <section className="px-6 md:px-10 py-28 md:py-40 bg-[hsl(20,15%,5%)]">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16 md:mb-24">
            <p className="text-destructive text-[10px] tracking-[0.5em] uppercase font-mono-light mb-4">
              ⬤ Restricted Access
            </p>
            <h2 className={`${H2} mb-6`}>Contraband</h2>
            <p className={`${BODY} max-w-md mx-auto mb-3`}>
              Limited drops. Restricted material. Outside the current range.
            </p>
            <p className="text-muted-foreground/60 text-xs font-mono-light italic">
              Some are monitored. Some are reformed. Some quietly disappear.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {contrabandDrops.map((drop) => (
              <div
                key={drop.code}
                className="border border-muted/20 p-6 md:p-8 relative overflow-hidden group hover:border-muted/40 transition-colors"
              >
                {/* Scan line overlay */}
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,hsl(var(--foreground)/0.1)_2px,hsl(var(--foreground)/0.1)_4px)]" />

                <p className="text-muted-foreground/30 text-[9px] tracking-[0.5em] uppercase font-mono-light mb-6">
                  {drop.code}
                </p>
                <div className="h-24 flex items-center justify-center mb-6">
                  <p className="font-control text-2xl font-bold text-foreground/20 tracking-widest">
                    {drop.label}
                  </p>
                </div>
                <div className="border-t border-muted/15 pt-4 flex items-center justify-between">
                  <span className="text-destructive/70 text-[9px] tracking-[0.3em] uppercase font-mono-light">
                    {drop.status}
                  </span>
                  <span className="text-muted-foreground/30 text-[9px] font-mono-light">
                    {drop.note}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Confessional ─────────────────────────────── */}
      <section
        ref={scanRef}
        className="relative px-6 md:px-10 py-28 md:py-40 bg-[hsl(20,15%,4%)] overflow-hidden"
      >
        {/* Scan line overlay */}
        <div className="absolute inset-0 opacity-[0.04] pointer-events-none bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,hsl(var(--foreground)/0.15)_2px,hsl(var(--foreground)/0.15)_4px)]" />

        <div className="relative z-10 max-w-3xl mx-auto">
          <div className="text-center mb-16 md:mb-20">
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-ritual animate-pulse" />
              <span className="text-ritual text-[10px] tracking-[0.5em] uppercase font-mono-light">
                Live Feed
              </span>
            </div>
            <h2 className={`${H2} mb-6`}>The Confessional</h2>
            <p className={`${BODY} max-w-md mx-auto`}>
              Anonymous confessions. AI verdicts. Some truths don't disappear.
            </p>
          </div>

          {/* Confession previews */}
          <div className="space-y-10 mb-16">
            {confessions.length > 0 ? (
              confessions.map((c, i) => (
                <div
                  key={i}
                  className="border-l border-muted/20 pl-6"
                  style={{ opacity: 1 - i * 0.15 }}
                >
                  <p className="text-muted-foreground/30 text-[9px] tracking-[0.4em] uppercase font-mono-light mb-3">
                    Confessor {c.confessorId}
                  </p>
                  <p className="text-foreground text-sm md:text-base font-mono-light leading-[1.7] mb-4 max-w-[550px]">
                    {c.confession}
                  </p>
                  <div>
                    <p className="text-muted-foreground/30 text-[8px] tracking-[0.5em] uppercase font-mono-light mb-1.5">
                      Verdict
                    </p>
                    <p className="text-ritual/80 text-xs font-mono-light tracking-wide mb-1">
                      {c.verdict}
                    </p>
                    <div className="relative overflow-hidden h-6">
                      <p className="text-muted-foreground/40 text-xs font-mono-light leading-relaxed select-none">
                        {c.verdictHidden}
                      </p>
                      <div className="absolute inset-0 backdrop-blur-[6px]" />
                      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[hsl(20,15%,4%)]" />
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-10">
                <p className="text-muted-foreground/30 text-xs font-mono-light animate-pulse">
                  Loading confessions...
                </p>
              </div>
            )}
          </div>

          {/* CTA */}
          <div className="text-center">
            <Link
              to="/confess"
              className="inline-block px-12 py-4 bg-foreground text-background font-bold text-xs tracking-[0.3em] uppercase transition-all hover:opacity-90 hover:tracking-[0.4em]"
            >
              Enter the Booth
            </Link>
            <p className={`${LABEL} mt-6 opacity-60`}>
              Your confession will be judged.
            </p>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────── */}
      <footer className="px-6 py-14 border-t border-muted/30">
        <div className="max-w-5xl mx-auto flex flex-col items-center gap-4">
          <img src={guiltyLogoRed} alt="GUILTY" className="h-5 opacity-50" />
          <p className={LABEL}>
            © {new Date().getFullYear()} GUILTY. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default World;
