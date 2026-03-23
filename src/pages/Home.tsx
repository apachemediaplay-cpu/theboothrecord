import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import guiltyLogoRed from "@/assets/guilty-logo-red.svg";
import guiltyOvalLogo from "@/assets/guilty-oval-logo.svg";
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
      "Lemon and yuzu juice with citrus oils. Bright citrus acidity with a clean",
    warning: "WARNING: Evidence of indulgence.",
    ingredients: ["Lemon juice", "Yuzu juice", "Raw sugar", "Carbonated"],
    technical:
      "~5.5g sugar per 100ml. Built on Japanese yuzu juice with natural citrus extracts.",
    closing: "The first one rarely needs explaining.",
    notes: ["Citrus", "Light", "Aromatic"],
    image: citrusConfessional,
  },
  {
    name: "Bitter Justice",
    subtitle: "Blood Orange + Ginger",
    description:
      "Blood orange and ginger juice with bitter orange extracts. Dry bitterness with a ginger edge.",
    warning: "WARNING: Evidence of indulgence.",
    ingredients: ["Blood orange juice", "Ginger juice", "Raw sugar", "Carbonated"],
    technical:
      "~6g sugar per 100ml. Built on blood orange juice with bitter orange and juniper extracts.",
    closing: "Justice rarely tastes sweet.",
    notes: ["Bitter", "Dry", "Ginger edge"],
    image: bitterJustice,
  },
  {
    name: "Cola Vice",
    subtitle: "Spiced Cola",
    description:
      "Lime juice, kola nut and warm spice extracts. Cola with warm spice and a structured finish.",
    warning: "WARNING: Evidence of indulgence.",
    ingredients: ["Lime juice", "Kola nut extract", "Raw sugar", "Carbonated"],
    technical:
      "~7.5g sugar per 100ml. Built on kola nut and lime with warm spice extracts for balance.",
    closing: "Some vices age well.",
    notes: ["Cola", "Warm spice", "Structured"],
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


const Home = () => {
  const [confessions, setConfessions] = useState<ConfessionPreview[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [confessionCount, setConfessionCount] = useState(1842);
  const scanRef = useRef<HTMLDivElement>(null);
  const [navVisible, setNavVisible] = useState(true);
  const lastScrollY = useRef(0);
  const heroVideoIndex = useRef(0);
  const [contactOpen, setContactOpen] = useState(false);
  const [contactForm, setContactForm] = useState({ name: "", phone: "", email: "", venue: "", message: "" });
  const [contactErrors, setContactErrors] = useState<Record<string, string>>({});
  const [contactSubmitted, setContactSubmitted] = useState(false);

  // Typewriter effect for hero warning text
  useEffect(() => {
    const text = "IF YOU WITNESS ANY PERSON IN POSITION OF UNAUTHORISED BEVERAGES REPORT THE SUSPECT IMMEDIATELY.";
    const el = document.querySelector<HTMLSpanElement>(".hero-typewriter-text");
    if (!el) return;
    el.classList.add("hero-cursor");
    let i = 0;
    let tid: number;
    const typeNext = () => {
      i++;
      el.textContent = text.slice(0, i);
      if (i >= text.length) {
        // Remove cursor after a beat
        setTimeout(() => el.classList.remove("hero-cursor"), 1500);
        return;
      }
      // Human-like variable speed: base 65ms + random 0-80ms + pause after punctuation/spaces
      let delay = 65 + Math.random() * 80;
      const ch = text[i - 1];
      if (ch === "." || ch === ",") delay += 300;
      else if (ch === " ") delay += 40 + Math.random() * 60;
      tid = window.setTimeout(typeNext, delay);
    };
    const startTimeout = setTimeout(() => typeNext(), 2000);
    return () => { clearTimeout(startTimeout); clearTimeout(tid); };
  }, []);

  // Surveillance note typewriter — triggers on scroll into view
  useEffect(() => {
    const text = "INCIDENTS OF UNAUTHORISED PLEASURE ARE BEING LOGGED.";
    const el = document.querySelector<HTMLSpanElement>(".surveillance-typewriter-text");
    if (!el) return;
    let started = false;
    let i = 0;
    let tid: number;

    const typeNext = () => {
      i++;
      el.textContent = text.slice(0, i);
      if (i >= text.length) {
        setTimeout(() => el.classList.remove("hero-cursor"), 1500);
        return;
      }
      let delay = 65 + Math.random() * 80;
      const ch = text[i - 1];
      if (ch === "." || ch === ",") delay += 300;
      else if (ch === " ") delay += 40 + Math.random() * 60;
      tid = window.setTimeout(typeNext, delay);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          started = true;
          el.classList.add("hero-cursor");
          tid = window.setTimeout(() => typeNext(), 400);
        }
      },
      { threshold: 0.3 }
    );

    const section = el.closest("section");
    if (section) observer.observe(section);

    return () => { observer.disconnect(); clearTimeout(tid); };
  }, []);


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
      <section className="relative h-screen flex flex-col items-center justify-between overflow-hidden">
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
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/40" />

        {/* Top notice */}
        <div className="relative z-10 pt-10 md:pt-14">
          <p className="text-white/80 text-[10px] md:text-xs tracking-[0.4em] uppercase font-mono text-center">
            NOTICE &nbsp;/ &nbsp;REF: 7.4 &nbsp;/STATUS ACTIVE
          </p>
        </div>

        {/* Centre warning text — typewriter */}
        <div className="relative z-10 flex flex-col items-start text-left px-6 md:px-20 w-full max-w-5xl">
          <h1 className="font-mono text-2xl sm:text-3xl md:text-5xl lg:text-6xl font-bold tracking-[0.15em] uppercase text-white leading-[1.4] md:leading-[1.3] hero-typewriter" style={{ textShadow: '0 0 20px rgba(0,0,0,0.8), 0 0 40px rgba(0,0,0,0.6), 0 2px 4px rgba(0,0,0,0.9)' }}>
            <span className="hero-typewriter-text" />
          </h1>
        </div>

        {/* Bottom logo with glitch */}
        <div className="relative z-10 pb-10 md:pb-16 flex flex-col items-center">
          <div className="relative h-16 sm:h-20 md:h-28">
            <img src={guiltyLogoRed} alt="GUILTY" className="h-full w-auto relative z-10" />
            <img src={guiltyLogoRed} alt="" className="absolute inset-0 h-full w-auto opacity-70 animate-warning-glitch-1" aria-hidden="true" />
            <img src={guiltyLogoRed} alt="" className="absolute inset-0 h-full w-auto opacity-70 animate-warning-glitch-2" aria-hidden="true" />
          </div>
        </div>

        <style>{`
          .hero-cursor::after {
            content: '▌';
            animation: cursorBlink 0.7s steps(1) infinite;
            margin-left: 2px;
          }
          @keyframes cursorBlink {
            0%, 50% { opacity: 1; }
            51%, 100% { opacity: 0; }
          }
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
            { label: "CONTACT", target: "contact" },
          ].map((item, i, arr) => (
            <div key={item.target} className="flex flex-col items-center">
              <button
                data-text={item.label}
                onClick={() => {
                  if (item.target === "contact") {
                    setContactOpen(true);
                  } else {
                    document.getElementById(item.target)?.scrollIntoView({ behavior: "smooth" });
                  }
                }}
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
                  
                  <div className="mt-4 space-y-3">
                    <p className={`text-neutral-500 text-sm italic font-mono-light animate-warning-glitch-${i + 1}`}>
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
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-neutral-300">
            {/* Column 1 — Headline + Description */}
            <div className="pb-8 md:pb-0 md:pr-10">
              <h2 className="font-control text-3xl md:text-4xl font-bold text-neutral-900 mb-6">
                For Venues
              </h2>
              <p className="text-neutral-600 text-sm leading-[1.9] font-mono-light max-w-xs">
                Non-alcoholic drinks for serious menus. Built around balance, acidity and flavour.
              </p>
            </div>

            {/* Column 2 — Format */}
            <div className="py-8 md:py-0 md:px-10">
              <p className="text-neutral-500 text-[10px] tracking-[0.35em] uppercase font-mono-light mb-6">
                Format
              </p>
              <div className="space-y-3">
                <p className="text-neutral-900 text-sm font-mono-light">
                  <span className="font-bold">250ml</span> slim can
                </p>
                <p className="text-neutral-900 text-sm font-mono-light">
                  <span className="font-bold">24</span> per carton
                </p>
                <p className="text-neutral-900 text-sm font-mono-light">
                  <span className="font-bold">Carbonated</span> · Shelf stable
                </p>
              </div>
            </div>

            {/* Column 3 — Note + Trade Enquiries */}
            <div className="pt-8 md:pt-0 md:pl-10 flex flex-col justify-between">
              <p className="text-neutral-500 text-xs leading-[1.8] font-mono-light italic text-left mb-8">
                Carbonation levels vary slightly between drinks to suit their flavour profile.
              </p>
              <div className="border-t border-neutral-300 pt-5">
                <p className="text-neutral-500 text-[10px] tracking-[0.35em] uppercase font-mono-light mb-2">
                  Trade Enquiries
                </p>
                <button
                  onClick={() => setContactOpen(true)}
                  className="text-neutral-900 text-sm font-mono-light underline underline-offset-4 hover:opacity-70 transition-opacity"
                >
                  trade@houseofguilty.com ↗
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Contraband ───────────────────────────────── */}
      <section id="contraband" className={`${SECTION} bg-neutral-900 relative`}>
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

        {/* G-Pattern lock overlay */}
        <div className="absolute inset-0 z-20 flex items-center justify-center overflow-hidden">
          {/* SVG G pattern */}
          <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="g-pattern" x="0" y="0" width="100" height="120" patternUnits="userSpaceOnUse" patternTransform="rotate(-15)">
                <circle cx="50" cy="60" r="28" fill="none" stroke="hsl(14, 80%, 45%)" strokeWidth="7" />
                <line x1="50" y1="60" x2="78" y2="60" stroke="hsl(14, 80%, 45%)" strokeWidth="7" />
                <line x1="50" y1="60" x2="50" y2="35" stroke="hsl(14, 80%, 45%)" strokeWidth="7" strokeLinecap="round" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="hsl(0, 0%, 5%)" fillOpacity="0.7" />
            <rect width="100%" height="100%" fill="url(#g-pattern)" opacity="0.85" />
          </svg>
          <button
            onClick={() => setContactOpen(true)}
            className="relative z-10 px-12 py-5 bg-red-600 hover:bg-red-700 text-white font-control text-lg md:text-xl tracking-[0.25em] uppercase font-bold transition-all duration-300 hover:scale-105 shadow-[0_0_40px_rgba(220,38,38,0.4)]"
          >
            <Lock className="inline-block mr-3 -mt-0.5" size={20} />
            Request Access
          </button>
        </div>
      </section>

      {/* ── From the Scene ──────────────────────────── */}
      <section className="bg-white px-0 py-20 md:py-28">
        <div className="max-w-5xl mx-auto px-6 md:px-10">
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
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 border-t border-neutral-200">
          {[
            { src: socialInterrogation, alt: "Interrogation room", caption: "Do you know this person?...", likes: "2,847", handle: "houseofguilty" },
            { src: socialPressConference, alt: "Press conference", caption: "GUILTY of gratification...", likes: "4,112", handle: "houseofguilty" },
            { src: socialAirportCustoms, alt: "Airport customs", caption: "EXHIBIT G: undeclared can...", likes: "3,291", handle: "houseofguilty" },
            { src: socialInterrogation, alt: "Interrogation room", caption: "Wellness State officers...", likes: "1,923", handle: "houseofguilty" },
            { src: socialPressConference, alt: "Press conference", caption: "The promotion of sugar is prohibited...", likes: "3,540", handle: "houseofguilty" },
            { src: socialAirportCustoms, alt: "Airport customs", caption: "under the influence...", likes: "2,108", handle: "houseofguilty" },
          ].map((img, i) => (
            <a
              key={i}
              href="https://instagram.com/houseofguilty"
              target="_blank"
              rel="noopener noreferrer"
              className="border-b border-r border-neutral-200 group flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center gap-2.5 px-4 py-3 border-b border-neutral-200">
                <div className="w-7 h-7 rounded-full bg-red-600 flex items-center justify-center">
                  <span className="text-white text-[9px] font-bold">G</span>
                </div>
                <p className="text-neutral-900 text-xs font-bold tracking-wide">{img.handle}</p>
              </div>

              {/* Image */}
              <div className="relative aspect-square overflow-hidden bg-neutral-100">
                <img
                  src={img.src}
                  alt={img.alt}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
              </div>

              {/* Footer */}
              <div className="px-4 py-3">
                <p className="text-neutral-900 text-xs font-bold mb-1">{img.likes} likes</p>
                <p className="text-neutral-700 text-xs leading-relaxed">
                  <span className="font-bold">{img.handle}</span>{" "}
                  <span className="font-mono-light">{img.caption}</span>
                </p>
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* ── Surveillance Note ────────────────────────── */}
      <section className="bg-neutral-100 px-6 md:px-10 py-24 md:py-36">
        <div className="max-w-4xl mx-auto">
          <p className="text-neutral-400 text-[10px] md:text-xs tracking-[0.35em] uppercase font-mono mb-8">
            SURVEILLANCE NOTE &nbsp;/ &nbsp;REF: 4.1 &nbsp;/ &nbsp;STATUS: RECORDING
          </p>
          <h2 className="font-mono text-2xl sm:text-3xl md:text-5xl lg:text-6xl font-bold tracking-[0.15em] uppercase text-neutral-900 leading-[1.4] md:leading-[1.3]">
            <span className="surveillance-typewriter-text" />
          </h2>
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

      {/* ── Contact Modal ────────────────────────────── */}
      {contactOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setContactOpen(false)} />
          <div className="relative bg-black/90 border border-white/10 rounded-md w-full max-w-md mx-4 p-8 md:p-10 animate-fade-in">
            <button
              onClick={() => setContactOpen(false)}
              className="absolute top-4 right-4 text-white/40 hover:text-white text-lg font-mono transition-colors"
            >
              ✕
            </button>

            {contactSubmitted ? (
              <div className="text-center py-8">
                <p className="text-white/40 text-[10px] tracking-[0.35em] uppercase font-mono mb-4">Transmission Received</p>
                <p className="text-white font-mono text-sm tracking-wide">We'll be in touch.</p>
              </div>
            ) : (
              <>
                <p className="text-white/40 text-[10px] tracking-[0.35em] uppercase font-mono mb-1">Get In Touch</p>
                <h3 className="font-control text-xl md:text-2xl font-bold text-white mb-8">Contact</h3>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const errors: Record<string, string> = {};
                    if (!contactForm.name.trim()) errors.name = "Required";
                    if (!contactForm.phone.trim()) errors.phone = "Required";
                    if (!contactForm.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactForm.email)) errors.email = "Valid email required";
                    if (!contactForm.venue.trim()) errors.venue = "Required";
                    if (Object.keys(errors).length) { setContactErrors(errors); return; }
                    setContactErrors({});
                    setContactSubmitted(true);
                  }}
                  className="space-y-5"
                >
                  {[
                    { key: "name", label: "NAME", placeholder: "Your name", type: "text" },
                    { key: "phone", label: "PHONE", placeholder: "Phone number", type: "tel" },
                    { key: "email", label: "EMAIL", placeholder: "Email address", type: "email" },
                    { key: "venue", label: "VENUE NAME", placeholder: "Venue name", type: "text" },
                  ].map((field) => (
                    <div key={field.key}>
                      <label className="block text-white/50 text-[10px] tracking-[0.3em] uppercase font-mono mb-2">
                        {field.label} <span className="text-red-500">*</span>
                      </label>
                      <input
                        type={field.type}
                        placeholder={field.placeholder}
                        maxLength={255}
                        value={contactForm[field.key as keyof typeof contactForm]}
                        onChange={(e) => setContactForm((f) => ({ ...f, [field.key]: e.target.value }))}
                        className="w-full bg-white/5 border border-white/10 rounded px-4 py-3 text-white text-sm font-mono placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors"
                      />
                      {contactErrors[field.key] && (
                        <p className="text-red-400 text-[10px] font-mono mt-1 tracking-wide">{contactErrors[field.key]}</p>
                      )}
                    </div>
                  ))}

                  <div>
                    <label className="block text-white/50 text-[10px] tracking-[0.3em] uppercase font-mono mb-2">
                      MESSAGE <span className="text-white/20">(optional)</span>
                    </label>
                    <textarea
                      placeholder="Anything else..."
                      maxLength={1000}
                      rows={3}
                      value={contactForm.message}
                      onChange={(e) => setContactForm((f) => ({ ...f, message: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded px-4 py-3 text-white text-sm font-mono placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className="glitch-btn w-full bg-white text-black font-bold text-[11px] tracking-[0.25em] uppercase font-mono py-4 rounded hover:bg-white/90 transition-colors mt-2"
                    data-text="SUBMIT"
                  >
                    SUBMIT
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;
