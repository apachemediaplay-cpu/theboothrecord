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
import socialInterrogation from "@/assets/social/interrogation.png";
import socialPressConference from "@/assets/social/press-conference.png";
import socialAirportCustoms from "@/assets/social/airport-customs.png";

/* ─── Data ────────────────────────────────────────────── */

const flavours = [
  {
    name: "Citrus Confessional",
    subtitle: "Lemon + Yuzu",
    description:
      "Bright yuzu citrus with a clean finish. Light, aromatic and refreshing. Some things are easier to confess than others.",
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
      "Blood orange bitterness with a ginger edge. Dry with a hint of juniper. A crime worth the sentence.",
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
      "Cola with warm spice. More structured than typical cola. Vice rarely waits for permission.",
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
const H2 = "font-control text-2xl sm:text-3xl md:text-5xl font-bold text-neutral-900";
const LABEL =
  "text-neutral-400 text-[10px] tracking-[0.35em] uppercase font-mono-light";
const BODY =
  "text-neutral-500 text-sm leading-[1.9] font-mono-light";

/* ─── Component ───────────────────────────────────────── */

const World = () => {
  const [confessions, setConfessions] = useState<ConfessionPreview[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [confessionCount, setConfessionCount] = useState(1842);
  const scanRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const baseUrl = import.meta.env.VITE_BASE_URL;
    fetch(`${baseUrl}/v1/confessions`)
      .then((res) => res.json())
      .then((data) => {
        const items = (data?.data?.confessions || [])
          .slice(0, 6)
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

  // Cycle through confessions to simulate live feed
  useEffect(() => {
    if (confessions.length === 0) return;
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % confessions.length);
      setConfessionCount((prev) => prev + 1);
    }, 4000);
    return () => clearInterval(interval);
  }, [confessions.length]);

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      {/* ── Hero (stays dark — image-based) ──────────── */}
      <section className="relative h-screen flex flex-col items-center justify-end overflow-hidden">
        {/* Logo tab at top center */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20 bg-white px-8 py-4">
          <img
            src={guiltyLogoRed}
            alt="GUILTY"
            className="h-8 md:h-10"
          />
        </div>
        <img
          src={heroCan}
          alt="GUILTY Soda"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
        <div className="relative z-10 flex flex-col items-center text-center px-6 pb-16 md:pb-24">
          <h1 className="font-control text-3xl sm:text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight mb-6 text-white">
            Indulgence has a name.
          </h1>
          <p className="text-white/60 text-sm leading-[1.9] font-mono-light max-w-md mb-10 tracking-wide">
            A world built around flavour, ritual and things that don't explain themselves.
          </p>
          <style>{`
            .glitch-btn {
              position: relative;
              overflow: hidden;
            }
            .glitch-btn::before,
            .glitch-btn::after {
              content: attr(data-text);
              position: absolute;
              inset: 0;
              display: flex;
              align-items: center;
              justify-content: center;
              background: white;
              color: #171717;
              opacity: 0;
              pointer-events: none;
            }
            .glitch-btn:hover::before {
              opacity: 1;
              animation: glitchSlice1 200ms infinite;
              clip-path: inset(20% 0 50% 0);
              text-shadow: 2px 0 #ff0000, -2px 0 #00ffff;
            }
            .glitch-btn:hover::after {
              opacity: 1;
              animation: glitchSlice2 200ms infinite;
              clip-path: inset(60% 0 10% 0);
              text-shadow: -2px 0 #ff0000, 2px 0 #00ffff;
            }
            @keyframes glitchSlice1 {
              0% { transform: translateX(0); }
              20% { transform: translateX(-4px); }
              40% { transform: translateX(6px); }
              60% { transform: translateX(-2px); }
              80% { transform: translateX(4px); }
              100% { transform: translateX(0); }
            }
            @keyframes glitchSlice2 {
              0% { transform: translateX(0); }
              20% { transform: translateX(5px); }
              40% { transform: translateX(-3px); }
              60% { transform: translateX(4px); }
              80% { transform: translateX(-6px); }
              100% { transform: translateX(0); }
            }
          `}</style>
          <div className="flex gap-2 md:gap-3">
            {[
              { label: "Drinks", target: "drinks" },
              { label: "Venues", target: "venues" },
              { label: "Contraband", target: "contraband" },
              { label: "The Confessional", target: "confessional" },
            ].map((item) => (
              <button
                key={item.target}
                data-text={item.label}
                onClick={() => document.getElementById(item.target)?.scrollIntoView({ behavior: "smooth" })}
                className="glitch-btn px-8 py-4 bg-white text-neutral-900 font-bold text-xs tracking-[0.3em] uppercase transition-all hover:tracking-[0.4em]"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── The Drinks ───────────────────────────────── */}
      <section id="drinks" className={`${SECTION} bg-white`}>
        <div className="max-w-6xl mx-auto">
          <p className={`${LABEL} text-center mb-4`}>The Range</p>
           <h2 className={`${H2} text-center mb-4`}>
             The Usual Suspects
           </h2>
           <p className="text-center text-muted-foreground text-sm md:text-base tracking-wide mb-20 md:mb-28">
             Three drinks. Built for flavour rather than sweetness.
           </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8">
            {flavours.map((f, i) => (
              <div key={f.name} className="flex flex-col items-center text-center">
                <div className="flex justify-center mb-8">
                  <img
                    src={f.image}
                    alt={f.name}
                    className="w-48 md:w-52 lg:w-60"
                  />
                </div>
                <h3 className="font-control text-xl md:text-2xl font-bold text-neutral-900 mb-1">
                  {f.name}
                </h3>
                <p className="text-neutral-400 text-sm italic mb-2 font-mono-light">
                  {f.subtitle}
                </p>
                <p className="text-neutral-600 text-xs leading-[1.9] mb-2 font-mono-light">
                  {f.description}
                </p>
                <details className="group w-full mt-2">
                  <summary className="cursor-pointer list-none flex items-center justify-center gap-1.5 text-neutral-800 text-[10px] tracking-[0.2em] uppercase font-bold font-mono-light hover:text-neutral-600 transition-colors">
                     <span className={`underline animate-warning-glitch-${i + 1}`}>{f.warning}</span>
                     <span className="text-neutral-800 text-xs transition-transform group-open:rotate-180">▾</span>
                  </summary>
                  <div className="mt-4 space-y-3">
                    <p className="text-neutral-500 text-sm italic font-mono-light">
                      {f.closing}
                    </p>
                    <div className="flex flex-wrap justify-center gap-2 pt-1">
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
                </details>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Venues ───────────────────────────────────── */}
      <section id="venues" className={`${SECTION} bg-neutral-50`}>
        <div className="max-w-3xl mx-auto text-center">
          <p className={`${LABEL} mb-4`}>For Trade</p>
          <h2 className={`${H2} mb-20 md:mb-28`}>
            Venues
          </h2>

          <p className="text-neutral-900 text-base leading-[1.8] font-mono-light mb-4">
            Structured non-alcoholic drinks for serious menus.
          </p>
          <p className="text-neutral-900 text-base leading-[1.8] font-mono-light mb-10">
            GUILTY is a range of premium non-alcoholic drinks built around balance, acidity and flavour structure rather than sweetness.
          </p>

          <hr className="border-neutral-200 mb-10" />

          <details className="group mb-10">
            <summary className="cursor-pointer list-none flex items-center justify-center gap-2 font-control text-lg md:text-xl font-bold text-neutral-900">
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

          <details className="group mb-10">
            <summary className="cursor-pointer list-none flex items-center justify-center gap-2 font-control text-lg md:text-xl font-bold text-neutral-900">
              Product Format
              <span className="text-neutral-400 text-sm transition-transform group-open:rotate-180">▾</span>
            </summary>
            <div className="space-y-4 mt-6">
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
          </details>

          <hr className="border-neutral-200 mb-10" />
          <a
            href="mailto:trade@houseofguilty.com"
            className="inline-block px-10 py-4 bg-neutral-900 text-white font-bold text-xs tracking-[0.3em] uppercase font-mono-light transition-all hover:bg-neutral-800 hover:tracking-[0.4em]"
          >
            Trade Enquiries
          </a>
        </div>
      </section>

      {/* ── From the Scene ──────────────────────────── */}
      <section className={`${SECTION} bg-white`}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16 md:mb-20">
            <p className="text-neutral-400 text-[10px] tracking-[0.5em] uppercase font-mono-light mb-4">
              @houseofguilty
            </p>
            <h2 className="font-control text-2xl sm:text-3xl md:text-5xl font-bold text-neutral-900 mb-6">
              From the Scene
            </h2>
            <p className="text-neutral-500 text-sm leading-[1.9] font-mono-light max-w-md mx-auto">
              Evidence collected. Case ongoing.
            </p>
          </div>

          <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide snap-x snap-mandatory -mx-6 px-6">
            {[
              { src: socialInterrogation, alt: "Interrogation room", caption: "Evidence recovered from the scene.", likes: "2,847", time: "3h" },
              { src: socialPressConference, alt: "Press conference", caption: "No further questions.", likes: "4,112", time: "1d" },
              { src: socialAirportCustoms, alt: "Airport customs", caption: "Detained at the border. Worth it.", likes: "3,291", time: "3d" },
              { src: socialInterrogation, alt: "Interrogation room", caption: "Caught in the act.", likes: "1,923", time: "5d" },
              { src: socialPressConference, alt: "Press conference", caption: "The evidence speaks for itself.", likes: "3,540", time: "1w" },
              { src: socialAirportCustoms, alt: "Airport customs", caption: "Crossing lines since day one.", likes: "2,108", time: "2w" },
            ].map((img, i) => (
              <a
                key={i}
                href="https://instagram.com/houseofguilty"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 w-36 snap-start group"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-5 h-5 rounded-full bg-neutral-900 flex items-center justify-center">
                    <span className="text-white text-[6px] font-bold tracking-wider">G</span>
                  </div>
                  <p className="text-neutral-900 text-[10px] font-bold tracking-wide">houseofguilty</p>
                  <p className="text-neutral-400 text-[9px] font-mono-light ml-auto">{img.time}</p>
                </div>

                <div className="relative aspect-[4/5] overflow-hidden rounded-sm mb-2">
                  <img
                    src={img.src}
                    alt={img.alt}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                  />
                </div>

                <p className="text-neutral-900 text-[9px] font-bold mb-0.5">{img.likes} likes</p>
                <p className="text-neutral-600 text-[9px] leading-relaxed line-clamp-2">{img.caption}</p>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ── Contraband ───────────────────────────────── */}
      <section id="contraband" className={`${SECTION} bg-neutral-900`}>
        <div className="max-w-5xl mx-auto">

          {/* Contraband */}
          <div className="text-center mb-16 md:mb-24">
            <p className="text-red-500 text-[10px] tracking-[0.5em] uppercase font-mono-light mb-4">
              ⬤ Restricted Access
            </p>
            <h2 className="font-control text-2xl sm:text-3xl md:text-5xl font-bold text-white mb-6">
              Contraband
            </h2>
            <p className="text-neutral-400 text-sm leading-[1.9] font-mono-light max-w-md mx-auto mb-3">
              Limited drops. Restricted material. Outside the current range.
            </p>
            <p className="text-neutral-500 text-xs font-mono-light italic">
              Some are monitored. Some are reformed. Some quietly disappear.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
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
                <div className="border-t border-neutral-700/30 pt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-red-500/70 text-[9px] tracking-[0.3em] uppercase font-mono-light">
                      {drop.status}
                    </span>
                    <span className="text-neutral-600 text-[9px] font-mono-light">
                      {drop.note}
                    </span>
                  </div>
                  <a
                    href="mailto:contraband@houseofguilty.com?subject=Access%20Request%20—%20" 
                    className="block w-full text-center py-2.5 border border-neutral-600 text-neutral-400 text-[9px] tracking-[0.3em] uppercase font-mono-light transition-all hover:border-red-500/60 hover:text-red-400 hover:bg-red-500/5"
                  >
                    Request Access
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Confessional ─────────────────────────────── */}
      <section
        id="confessional"
        ref={scanRef}
        className="relative px-6 md:px-10 py-28 md:py-40 bg-neutral-950 overflow-hidden"
      >
        {/* Scan lines */}
        <div className="absolute inset-0 opacity-[0.04] pointer-events-none bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(255,255,255,0.1)_2px,rgba(255,255,255,0.1)_4px)]" />
        {/* Slow moving scan line */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div
            className="absolute left-0 right-0 h-px bg-ritual/20"
            style={{
              animation: "scanMove 8s linear infinite",
            }}
          />
        </div>

        <style>{`
          @keyframes scanMove {
            0% { top: -2%; }
            100% { top: 102%; }
          }
          @keyframes fadeSlideIn {
            0% { opacity: 0; transform: translateY(12px); }
            100% { opacity: 1; transform: translateY(0); }
          }
          @keyframes borderPulse {
            0%, 100% { border-color: rgba(255,255,255,0.08); }
            50% { border-color: rgba(255,255,255,0.2); }
          }
        `}</style>

        <div className="relative z-10 max-w-3xl mx-auto">
          <div className="text-center mb-16 md:mb-20">
            <div className="flex items-center justify-center gap-3 mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-ritual animate-pulse" />
              <span className="text-ritual text-[10px] tracking-[0.5em] uppercase font-mono-light">
                Live Feed
              </span>
              <span className="text-neutral-600 text-[10px] font-mono-light">
                — {confessionCount.toLocaleString()} confessions logged
              </span>
            </div>
            <h2 className="font-control text-3xl md:text-5xl font-bold text-white mb-6">
              The Confessional
            </h2>
            <p className="text-neutral-500 text-sm leading-[1.9] font-mono-light max-w-md mx-auto">
              Anonymous confessions. Some truths don't disappear.
            </p>
          </div>

          {/* Active confession - highlighted */}
          <div className="mb-10">
            {confessions.length > 0 ? (
              <div
                key={activeIndex}
                className="border-l-2 border-ritual/40 pl-6 py-2"
                style={{
                  animation: "fadeSlideIn 0.6s ease-out, borderPulse 2s ease-in-out infinite",
                }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-1 h-1 rounded-full bg-ritual animate-pulse" />
                  <p className="text-neutral-500 text-[9px] tracking-[0.4em] uppercase font-mono-light">
                    Confessor {confessions[activeIndex]?.confessorId}
                  </p>
                  <span className="text-neutral-700 text-[9px] font-mono-light">
                    just now
                  </span>
                </div>
                <p className="text-neutral-100 text-sm md:text-base font-mono-light leading-[1.7] mb-4 max-w-[550px]">
                  {confessions[activeIndex]?.confession}
                </p>
                <div>
                  <p className="text-neutral-600 text-[8px] tracking-[0.5em] uppercase font-mono-light mb-1.5">
                    Verdict
                  </p>
                  <p className="text-ritual/80 text-xs font-mono-light tracking-wide mb-1">
                    {confessions[activeIndex]?.verdict}
                  </p>
                  <div className="relative overflow-hidden h-6">
                    <p className="text-neutral-500 text-xs font-mono-light leading-relaxed select-none">
                      {confessions[activeIndex]?.verdictHidden}
                    </p>
                    <div className="absolute inset-0 backdrop-blur-[6px]" />
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-neutral-950" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-10">
                <p className="text-neutral-600 text-xs font-mono-light animate-pulse">
                  Intercepting confessions...
                </p>
              </div>
            )}
          </div>

          {/* Previous confessions - faded queue */}
          {confessions.length > 1 && (
            <div className="space-y-4 mb-16 opacity-40">
              {[1, 2].map((offset) => {
                const idx = (activeIndex - offset + confessions.length) % confessions.length;
                const c = confessions[idx];
                if (!c) return null;
                return (
                  <div
                    key={`prev-${offset}`}
                    className="border-l border-neutral-800/50 pl-6"
                    style={{ opacity: 1 - offset * 0.3 }}
                  >
                    <p className="text-neutral-700 text-[9px] tracking-[0.4em] uppercase font-mono-light mb-1">
                      Confessor {c.confessorId}
                    </p>
                    <p className="text-neutral-600 text-xs font-mono-light leading-[1.7] line-clamp-1 max-w-[450px]">
                      {c.confession}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

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
