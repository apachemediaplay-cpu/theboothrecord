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

/* ─── Shared styles (light theme) ─────────────────────── */

const SECTION = "px-6 md:px-10 py-28 md:py-40";
const H2 = "font-control text-3xl md:text-5xl font-bold text-neutral-900";
const LABEL =
  "text-neutral-400 text-[10px] tracking-[0.35em] uppercase font-mono-light";
const BODY =
  "text-neutral-500 text-sm leading-[1.9] font-mono-light";

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
    <div className="min-h-screen bg-white text-neutral-900">
      {/* ── Hero (stays dark — image-based) ──────────── */}
      <section className="relative h-screen flex flex-col items-center justify-end overflow-hidden">
        <img
          src={heroCan}
          alt="GUILTY Soda"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
        <div className="relative z-10 flex flex-col items-center text-center px-6 pb-16 md:pb-24">
          <img
            src={guiltyLogoWhite}
            alt="GUILTY"
            className="h-10 mb-10 opacity-80"
          />
          <h1 className="font-control text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight mb-6 text-white">
            Indulgence has a name.
          </h1>
          <p className="text-white/60 text-sm leading-[1.9] font-mono-light max-w-md mb-6 tracking-wide">
            A world built around flavour, ritual and things that don't explain themselves.
          </p>
        </div>
      </section>

      {/* ── The Drinks ───────────────────────────────── */}
      <section className={`${SECTION} bg-white`}>
        <div className="max-w-6xl mx-auto">
          <p className={`${LABEL} text-center mb-4`}>The Range</p>
          <h2 className={`${H2} text-center mb-20 md:mb-28`}>
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
                  <p className="text-neutral-400 text-sm italic mb-6 font-mono-light">
                    {f.subtitle}
                  </p>
                  <p className="text-neutral-600 text-xs leading-[1.9] mb-4 max-w-sm font-mono-light">
                    {f.description}
                  </p>
                  <p className="text-neutral-800 text-[10px] tracking-[0.2em] uppercase font-bold mb-4 font-mono-light">
                    {f.warning}
                  </p>
                  <ul className="text-neutral-600 text-xs leading-[1.9] mb-4 max-w-sm font-mono-light list-disc list-inside">
                    {f.ingredients.map((ing) => (
                      <li key={ing}>{ing}</li>
                    ))}
                  </ul>
                  <p className="text-neutral-400 text-[10px] tracking-[0.15em] uppercase mb-1 font-mono-light">
                    Technical
                  </p>
                  <p className="text-neutral-600 text-xs leading-[1.9] mb-4 max-w-sm font-mono-light">
                    {f.technical}
                  </p>
                  <p className="text-neutral-500 text-sm italic mb-6 font-mono-light">
                    {f.closing}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {f.notes.map((note) => (
                      <span
                        key={note}
                        className="px-4 py-1.5 border border-neutral-200 text-[10px] tracking-[0.2em] uppercase text-neutral-500"
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
      <section className={`${SECTION} bg-neutral-50`}>
        <div className="max-w-3xl mx-auto">
          <h2 className="font-control text-2xl md:text-4xl font-bold text-neutral-900 mb-1">
            Venues
          </h2>

          <hr className="border-neutral-200 mb-10" />

          <p className="text-neutral-900 text-base leading-[1.8] font-mono-light mb-4">
            Structured non-alcoholic drinks for serious menus.
          </p>
          <p className="text-neutral-900 text-base leading-[1.8] font-mono-light mb-10">
            GUILTY is a range of premium non-alcoholic drinks built around balance, acidity and flavour structure rather than sweetness.
          </p>

          <hr className="border-neutral-200 mb-10" />

          <details className="group mb-10">
            <summary className="cursor-pointer list-none flex items-center gap-2 font-control text-lg md:text-xl font-bold text-neutral-900">
              Drinks
              <span className="text-neutral-400 text-sm transition-transform group-open:rotate-180">▾</span>
            </summary>
            <div className="space-y-6 mt-6">
              <div>
                <p className="text-neutral-900 text-base font-mono-light font-bold">
                  Citrus Confessional — Lemon / Yuzu
                </p>
                <p className="text-neutral-600 text-base font-mono-light">
                  Lemon and yuzu juice with citrus oils.
                </p>
              </div>
              <div>
                <p className="text-neutral-900 text-base font-mono-light font-bold">
                  Bitter Justice — Blood Orange / Ginger
                </p>
                <p className="text-neutral-600 text-base font-mono-light">
                  Blood orange and ginger juice with bitter orange extracts.
                </p>
              </div>
              <div>
                <p className="text-neutral-900 text-base font-mono-light font-bold">
                  Cola Vice — Spiced Cola
                </p>
                <p className="text-neutral-600 text-base font-mono-light">
                  Lime juice, kola nut and warm spice extracts.
                </p>
              </div>
            </div>
          </details>

          <hr className="border-neutral-200 mb-10" />

          <h3 className="font-control text-lg md:text-xl font-bold text-neutral-900 mb-6">
            Product Format
          </h3>
          <div className="space-y-4 mb-4">
            <div>
              <p className="text-neutral-900 text-base font-mono-light">250ml slim can</p>
              <p className="text-neutral-900 text-base font-mono-light">24 cans per carton</p>
            </div>
            <div>
              <p className="text-neutral-900 text-base font-mono-light">Carbonated and ready to serve</p>
              <p className="text-neutral-900 text-base font-mono-light">Shelf stable</p>
            </div>
            <p className="text-neutral-900 text-base font-mono-light">
              Carbonation levels vary slightly between drinks.
            </p>
          </div>

          <hr className="border-neutral-200 mb-10 mt-10" />
          <a
            href="mailto:trade@houseofguilty.com"
            className="inline-block px-10 py-4 bg-neutral-900 text-white font-bold text-xs tracking-[0.3em] uppercase font-mono-light transition-all hover:bg-neutral-800 hover:tracking-[0.4em]"
          >
            Trade Enquiries
          </a>
        </div>
      </section>

      {/* ── Contraband ───────────────────────────────── */}
      <section className={`${SECTION} bg-neutral-900`}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16 md:mb-24">
            <p className="text-red-500 text-[10px] tracking-[0.5em] uppercase font-mono-light mb-4">
              ⬤ Restricted Access
            </p>
            <h2 className="font-control text-3xl md:text-5xl font-bold text-white mb-6">
              Contraband
            </h2>
            <p className="text-neutral-400 text-sm leading-[1.9] font-mono-light max-w-md mx-auto mb-3">
              Limited drops. Restricted material. Outside the current range.
            </p>
            <p className="text-neutral-500 text-xs font-mono-light italic">
              Some are monitored. Some are reformed. Some quietly disappear.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {contrabandDrops.map((drop) => (
              <div
                key={drop.code}
                className="border border-neutral-700/40 p-6 md:p-8 relative overflow-hidden group hover:border-neutral-600 transition-colors"
              >
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(255,255,255,0.08)_2px,rgba(255,255,255,0.08)_4px)]" />

                <p className="text-neutral-600 text-[9px] tracking-[0.5em] uppercase font-mono-light mb-6">
                  {drop.code}
                </p>
                <div className="h-24 flex items-center justify-center mb-6">
                  <p className="font-control text-2xl font-bold text-white/15 tracking-widest">
                    {drop.label}
                  </p>
                </div>
                <div className="border-t border-neutral-700/30 pt-4 flex items-center justify-between">
                  <span className="text-red-500/70 text-[9px] tracking-[0.3em] uppercase font-mono-light">
                    {drop.status}
                  </span>
                  <span className="text-neutral-600 text-[9px] font-mono-light">
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
        className="relative px-6 md:px-10 py-28 md:py-40 bg-neutral-950 overflow-hidden"
      >
        <div className="absolute inset-0 opacity-[0.04] pointer-events-none bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(255,255,255,0.1)_2px,rgba(255,255,255,0.1)_4px)]" />

        <div className="relative z-10 max-w-3xl mx-auto">
          <div className="text-center mb-16 md:mb-20">
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-ritual animate-pulse" />
              <span className="text-ritual text-[10px] tracking-[0.5em] uppercase font-mono-light">
                Live Feed
              </span>
            </div>
            <h2 className="font-control text-3xl md:text-5xl font-bold text-white mb-6">
              The Confessional
            </h2>
            <p className="text-neutral-500 text-sm leading-[1.9] font-mono-light max-w-md mx-auto">
              Anonymous confessions. AI verdicts. Some truths don't disappear.
            </p>
          </div>

          <div className="space-y-10 mb-16">
            {confessions.length > 0 ? (
              confessions.map((c, i) => (
                <div
                  key={i}
                  className="border-l border-neutral-800 pl-6"
                  style={{ opacity: 1 - i * 0.15 }}
                >
                  <p className="text-neutral-600 text-[9px] tracking-[0.4em] uppercase font-mono-light mb-3">
                    Confessor {c.confessorId}
                  </p>
                  <p className="text-neutral-200 text-sm md:text-base font-mono-light leading-[1.7] mb-4 max-w-[550px]">
                    {c.confession}
                  </p>
                  <div>
                    <p className="text-neutral-600 text-[8px] tracking-[0.5em] uppercase font-mono-light mb-1.5">
                      Verdict
                    </p>
                    <p className="text-ritual/80 text-xs font-mono-light tracking-wide mb-1">
                      {c.verdict}
                    </p>
                    <div className="relative overflow-hidden h-6">
                      <p className="text-neutral-500 text-xs font-mono-light leading-relaxed select-none">
                        {c.verdictHidden}
                      </p>
                      <div className="absolute inset-0 backdrop-blur-[6px]" />
                      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-neutral-950" />
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-10">
                <p className="text-neutral-600 text-xs font-mono-light animate-pulse">
                  Loading confessions...
                </p>
              </div>
            )}
          </div>

          <div className="text-center">
            <Link
              to="/confess"
              className="inline-block px-12 py-4 bg-white text-neutral-900 font-bold text-xs tracking-[0.3em] uppercase transition-all hover:opacity-90 hover:tracking-[0.4em]"
            >
              Enter the Booth
            </Link>
            <p className="text-neutral-600 text-[10px] tracking-[0.35em] uppercase font-mono-light mt-6">
              Your confession will be judged.
            </p>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────── */}
      <footer className="px-6 py-14 border-t border-neutral-100 bg-white">
        <div className="max-w-5xl mx-auto flex flex-col items-center gap-4">
          <img src={guiltyLogoRed} alt="GUILTY" className="h-5 opacity-50" />
          <p className="text-neutral-400 text-[10px] tracking-[0.35em] uppercase font-mono-light">
            © {new Date().getFullYear()} GUILTY. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default World;
