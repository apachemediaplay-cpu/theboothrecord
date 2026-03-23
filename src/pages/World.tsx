import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
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
    name: "BATCH 77 — BURNT SERMON",
    redactedName: "BATCH 77 — ████ SERMON",
    teaser: "Dark roast. Smoke and sacrament. Never meant for general release.",
    status: "RESTRICTED" as const,
    lastSeen: "Last sighted: 14.02.26",
  },
  {
    code: "DROP-002",
    name: "TRIAL 13 — ABSOLUTION TONIC",
    redactedName: "TRIAL 13 — ████████ TONIC",
    teaser: "Bitter herbs. A remedy or a sentence — depends who's drinking.",
    status: "REFORMED" as const,
    lastSeen: "Last sighted: 03.11.25",
  },
  {
    code: "DROP-003",
    name: "EXHIBIT R — NIGHT COUNSEL",
    redactedName: "EXHIBIT R — ████ ████████",
    teaser: "Whispered about. Never confirmed. Some things stay off the record.",
    status: "DISAPPEARED" as const,
    lastSeen: "Last sighted: Unknown",
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

const fallbackConfessions: ConfessionPreview[] = [
  { confession: "I told them I was fine. I wasn't.", verdict: "Guilt confirmed.", verdictHidden: "The silence was louder than the lie.", confessorId: "#1841" },
  { confession: "I take credit for work I didn't do.", verdict: "The system sees everything.", verdictHidden: "Recognition built on sand.", confessorId: "#1839" },
  { confession: "I read their messages when they left the room.", verdict: "Trust violated.", verdictHidden: "What you found was your own insecurity.", confessorId: "#1837" },
  { confession: "I pretend to care about things I don't.", verdict: "Performance noted.", verdictHidden: "The mask fits too well now.", confessorId: "#1835" },
  { confession: "I threw away the letter without reading it.", verdict: "Some doors close themselves.", verdictHidden: "You already knew what it said.", confessorId: "#1833" },
  { confession: "I smile at people I've already decided to cut off.", verdict: "Calculated withdrawal.", verdictHidden: "The goodbye was said in silence.", confessorId: "#1831" },
];


const World = () => {
  const [confessions, setConfessions] = useState<ConfessionPreview[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [confessionCount, setConfessionCount] = useState(1842);
  const scanRef = useRef<HTMLDivElement>(null);
  const [navVisible, setNavVisible] = useState(true);
  const lastScrollY = useRef(0);
  const heroVideoIndex = useRef(0);

  // Cycle hero videos — rapid 2s clips with glitch
  useEffect(() => {
    const videos = document.querySelectorAll<HTMLVideoElement>(".hero-video");
    const glitchOverlay = document.querySelector<HTMLElement>(".hero-glitch-overlay");
    if (videos.length < 2) return;

    // Start each video at a random point
    videos.forEach((v) => {
      v.currentTime = Math.random() * (v.duration || 5);
    });

    const cycle = () => {
      const prev = heroVideoIndex.current;
      heroVideoIndex.current = (prev + 1) % videos.length;
      const next = heroVideoIndex.current;

      // Glitch flash
      if (glitchOverlay) {
        glitchOverlay.classList.add("hero-glitch-active");
        setTimeout(() => glitchOverlay.classList.remove("hero-glitch-active"), 250);
      }

      // Swap — jump to random timestamp for variety
      videos[prev].classList.remove("hero-video-active");
      videos[next].classList.add("hero-video-active");
      const dur = videos[next].duration || 10;
      videos[next].currentTime = Math.random() * Math.max(0, dur - 2);
      videos[next].play().catch(() => {});
    };

    const interval = setInterval(cycle, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;
      setNavVisible(currentY < 10 || currentY < lastScrollY.current);
      lastScrollY.current = currentY;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

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
      {/* ── Hero (stays dark — video-based) ──────────── */}
      <section className="relative h-screen flex flex-col items-center justify-end overflow-hidden">
        {/* Static fallback image — always visible behind videos */}
        <img
          src={heroCan}
          alt="GUILTY Soda"
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Multi-video background with glitch transitions */}
        {["/videos/hero-loop.mp4", "/videos/hero-loop-2.mp4", "/videos/hero-loop-3.mp4"].map((src, i) => (
          <video
            key={src}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            className={`absolute inset-0 w-full h-full object-cover hero-video ${i === 0 ? "hero-video-active" : ""}`}
            data-hero-index={i}
          >
            <source src={src} type="video/mp4" />
          </video>
        ))}
        {/* Glitch overlay — flashes on transition */}
        <div className="absolute inset-0 pointer-events-none z-[1] hero-glitch-overlay" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
        <div className="relative z-10 flex flex-col items-center text-center px-6 pb-16 md:pb-24">
          <div className="relative h-16 sm:h-20 md:h-28 mb-8">
            <img src={guiltyLogoRed} alt="GUILTY" className="h-full w-auto relative z-10" />
            <img src={guiltyLogoRed} alt="" className="absolute inset-0 h-full w-auto opacity-70 animate-warning-glitch-1" aria-hidden="true" />
            <img src={guiltyLogoRed} alt="" className="absolute inset-0 h-full w-auto opacity-70 animate-warning-glitch-2" aria-hidden="true" />
          </div>
          <h1 className="font-control text-2xl sm:text-3xl md:text-5xl font-bold tracking-tight mb-6 text-white">
            of Indulgence.
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
              background: transparent;
              color: white;
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
        </div>

      </section>

      {/* Vertical nav – fixed left side, visible across all sections */}
      <div className={`fixed left-0 top-1/2 -translate-y-1/2 z-50 flex flex-col items-stretch rounded-r-md overflow-hidden transition-opacity duration-300 ${navVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        {/* Logo tab */}
        <div className="bg-white p-1.5 md:p-2.5 flex items-center justify-center">
          <img src={guiltyLogoRed} alt="GUILTY" className="h-3 md:h-4 w-auto" />
        </div>
        <div className="bg-black/70 backdrop-blur-sm py-1 md:py-2 w-full">
          {[
            { label: "DRINKS", target: "drinks" },
            { label: "VENUES", target: "venues" },
            { label: "CONTRABAND", target: "contraband" },
            { label: "THE BOOTH", target: "confessional" },
          ].map((item, i, arr) => (
            <div key={item.target} className="flex flex-col items-center">
              <button
                data-text={item.label}
                onClick={() => document.getElementById(item.target)?.scrollIntoView({ behavior: "smooth" })}
                 className="glitch-btn py-3 md:py-6 px-2 md:px-5 text-white font-bold text-[7px] md:text-[10px] tracking-[0.2em] md:tracking-[0.25em] uppercase transition-all hover:bg-white/10"
                style={{ writingMode: "vertical-lr" }}
              >
                {item.label}
              </button>
              {i < arr.length - 1 && (
                <div className="w-3 md:w-4 border-t border-white/30 my-0.5 md:my-1" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── The Drinks ───────────────────────────────── */}
      <section id="drinks" className={`${SECTION} bg-white`}>
        <div className="max-w-6xl mx-auto">
          <p className={`${LABEL} text-center mb-4`}>The Range</p>
           <h2 className={`${H2} text-center mb-4`}>
              The Suspects
            </h2>
           <p className="text-center text-muted-foreground text-sm md:text-base tracking-wide mb-20 md:mb-28">
             Three drinks. All changed.
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
                <div className="w-full mt-2">
                  <p className={`text-neutral-800 text-[10px] tracking-[0.2em] uppercase font-bold font-mono-light underline animate-warning-glitch-${i + 1}`}>{f.warning}</p>
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
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Venues ───────────────────────────────────── */}
      <section id="venues" className="px-6 md:px-10 py-16 md:py-24 bg-neutral-50">
        <div className="max-w-3xl mx-auto text-center">
          <p className={`${LABEL} mb-4`}>For Trade</p>
          <h2 className={`${H2} mb-10 md:mb-14`}>
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
            {contrabandDrops.map((drop) => {
              const dotColor =
                drop.status === "RESTRICTED"
                  ? "bg-red-500"
                  : drop.status === "REFORMED"
                  ? "bg-amber-500"
                  : "bg-neutral-500";

              return (
                <div
                  key={drop.code}
                  className="contraband-card border border-neutral-700/40 p-6 md:p-8 relative overflow-hidden group transition-all duration-300"
                >
                  {/* Scan-line overlay */}
                  <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="contraband-scanline absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-red-500/40 to-transparent" />
                  </div>

                  {/* Static noise overlay */}
                  <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(255,255,255,0.08)_2px,rgba(255,255,255,0.08)_4px)]" />

                  {/* Code label */}
                  <p className="text-neutral-600 text-[9px] tracking-[0.5em] uppercase font-mono-light mb-4 relative z-10">
                    {drop.code}
                  </p>

                  {/* Redacted name area */}
                  <div className="min-h-[80px] flex flex-col justify-center mb-4 relative z-10">
                    <p className="font-control text-lg md:text-xl font-bold text-white/90 tracking-wide leading-tight mb-2">
                      {drop.redactedName}
                    </p>
                    <p className="text-neutral-500 text-[10px] leading-[1.7] font-mono-light">
                      {drop.teaser}
                    </p>
                  </div>

                  {/* Status + metadata */}
                  <div className="border-t border-neutral-700/30 pt-4 space-y-4 relative z-10">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${dotColor} contraband-pulse`} />
                        <span className="text-red-500/70 text-[9px] tracking-[0.3em] uppercase font-mono-light">
                          {drop.status}
                        </span>
                      </span>
                      <span className="text-neutral-600 text-[9px] font-mono-light italic">
                        {drop.lastSeen}
                      </span>
                    </div>

                    {/* Request Access button */}
                    <a
                      href={`mailto:contraband@houseofguilty.com?subject=Access%20Request%20—%20${drop.code}`}
                      className="contraband-btn group/btn flex items-center justify-center gap-2 w-full py-2.5 border border-neutral-600 text-neutral-400 text-[9px] tracking-[0.3em] uppercase font-mono-light transition-all duration-300 hover:border-red-500/60 hover:text-red-400 hover:bg-red-500/5"
                    >
                      <Lock size={10} className="opacity-60" />
                      <span className="group-hover/btn:hidden">Request Access</span>
                      <span className="hidden group-hover/btn:inline">Submit Request ›</span>
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
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

      {/* ── Confessional ─────────────────────────────── */}
      <section
        id="confessional"
        ref={scanRef}
        className="relative px-6 md:px-10 py-28 md:py-40 bg-neutral-950 overflow-hidden"
      >
        {/* Background confession stream */}
        {(() => {
          const streamData = confessions.length > 0 ? confessions : fallbackConfessions;
          return (
            <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-[0.12]">
              <div
                className="absolute left-0 right-0 flex flex-col gap-6 px-8 md:px-16"
                style={{
                  animation: "confessionScroll 40s linear infinite",
                }}
              >
                {[...streamData, ...streamData, ...streamData, ...streamData].map((c, i) => (
                  <div key={`bg-${i}`} className="py-3 border-l border-white/20 pl-4">
                    <p className="text-white text-[9px] tracking-[0.4em] uppercase font-mono-light mb-1">
                      Confessor {c.confessorId}
                    </p>
                    <p className="text-white text-xs font-mono-light leading-relaxed">
                      {c.confession}
                    </p>
                    <p className="text-white/60 text-[10px] font-mono-light mt-1">
                      {c.verdict}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

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
          @keyframes confessionScroll {
            0% { transform: translateY(0); }
            100% { transform: translateY(-50%); }
          }
        `}</style>

        <div className="relative z-10 max-w-3xl mx-auto">
          <div className="text-center mb-10 md:mb-14">
            <div className="flex items-center justify-center gap-3 mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-ritual animate-pulse" />
              <span className="text-ritual text-[10px] tracking-[0.5em] uppercase font-mono-light">
                Live Feed
              </span>
              <span className="text-neutral-600 text-[10px] font-mono-light">
                — {confessionCount.toLocaleString()} confessions logged
              </span>
            </div>
            <h2 className="font-control text-2xl sm:text-3xl md:text-5xl font-bold text-white mb-6">
              The Confessional
            </h2>
            <p className="text-neutral-500 text-sm leading-[1.9] font-mono-light max-w-md mx-auto">
              Anonymous confessions. Some truths don't disappear.
            </p>
          </div>

          {/* Active confession - highlighted */}
          <div className="mb-6">
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
              <div className="text-center py-4">
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
          
          <p className="text-neutral-400 text-[10px] tracking-[0.35em] uppercase font-mono-light">
            © {new Date().getFullYear()} GUILTY. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default World;
