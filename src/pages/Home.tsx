import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import SuspectsCarousel from "@/components/SuspectsCarousel";
import guiltyLogoRed from "@/assets/guilty-logo-red.svg";
import guiltyOvalLogo from "@/assets/guilty-oval-logo.svg";
import guiltyLogoWhite from "@/assets/guilty-logo-white.svg";
import heroFallback from "@/assets/hero-fallback.webp";
import drop002Video from "@/assets/drop-002-preview.mp4";
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
      "Lemon and yuzu juice with citrus oils. Bright citrus acidity with a clean finish.",
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
      "Lime juice with kola nut and spice extracts. Tight acidity with a structured finish.",
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
    finished: true,
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
    redactedName: "████████ █ — ████ ████████",
    teaser: "██████████ ██████. ██████ █████████. ████ ██████ ████ ███ ███ ██████.",
    status: "CLASSIFIED" as const,
    lastSeen: "Date: ██.██.██",
    unrevealed: true,
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
  const [contactSending, setContactSending] = useState(false);
  const [contrabandMouse, setContrabandMouse] = useState<{ x: number; y: number } | null>(null);
  const [contrabandParallax, setContrabandParallax] = useState(0);
  const contrabandRef = useRef<HTMLElement>(null);

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
        // Fade out the text 2 seconds after typing completes
        setTimeout(() => {
          el.style.transition = 'opacity 1s ease-out';
          el.style.opacity = '0';
        }, 2000);
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

      // Contraband parallax
      if (contrabandRef.current) {
        const rect = contrabandRef.current.getBoundingClientRect();
        const sectionCenter = rect.top + rect.height / 2;
        const viewCenter = window.innerHeight / 2;
        setContrabandParallax(viewCenter - sectionCenter);
      }
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
      <section className="scroll-stack relative h-screen flex flex-col items-center justify-between overflow-hidden" style={{ zIndex: 1 }}>
        {/* Fallback image — visible while video loads */}
        <img
          src={heroFallback}
          alt="GUILTY Soda"
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Hero video background */}
        <video
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          className="absolute inset-0 w-full h-full object-cover"
          poster={heroFallback}
        >
          <source src="/videos/hero-loop.mp4" type="video/mp4" />
        </video>
        {/* Glitch overlay — flashes on transition */}
        <div className="absolute inset-0 pointer-events-none z-[1] hero-glitch-overlay" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/40" />

        {/* Top notice */}
        <div className="relative z-10 pt-10 md:pt-14">
          <p className="text-white/80 text-[10px] md:text-xs tracking-[0.4em] uppercase font-mono text-center">
            NOTICE &nbsp;/ &nbsp;REF: 7.4 &nbsp;/ <span className="inline-flex items-center gap-1.5"><span className="inline-block w-1.5 h-1.5 rounded-full bg-guilty animate-pulse shadow-[0_0_6px_2px_rgba(255,72,0,0.6)]" />STATUS ACTIVE</span>
          </p>
        </div>

        {/* Centre warning text — typewriter */}
        <div className="relative z-10 flex flex-col items-start text-left px-6 md:px-20 w-full max-w-5xl">
          <h1 className="font-mono text-base sm:text-lg md:text-2xl lg:text-3xl font-bold tracking-[0.15em] uppercase text-white leading-[1.4] md:leading-[1.3] hero-typewriter" style={{ textShadow: '0 0 20px rgba(0,0,0,0.8), 0 0 40px rgba(0,0,0,0.6), 0 2px 4px rgba(0,0,0,0.9)' }}>
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
            text-shadow: 2px 0 #ff4800, -2px 0 #00ffff;
          }
          .glitch-btn:hover::after {
            opacity: 1;
            animation: glitchSlice2 200ms infinite;
            clip-path: inset(60% 0 10% 0);
            text-shadow: -2px 0 #ff4800, 2px 0 #00ffff;
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
      <section id="drinks" className={`relative ${SECTION} bg-white`} style={{ zIndex: 2 }}>
        <div className="max-w-6xl mx-auto">
          <p className={`${LABEL} text-center mb-4`}><p className={`${LABEL} text-center mb-4`}>The Drinks</p></p>
           <h2 className={`${H2} text-center mb-4`}>
              The Suspects
            </h2>
           <p className="text-center text-muted-foreground text-sm md:text-base tracking-wide mb-12 md:mb-16">
             Three drinks. All charged.
           </p>
        </div>

        {/* ── Suspects Carousel ── */}
        <div className="-mx-6 md:-mx-10">
          <SuspectsCarousel />
        </div>

        <div className="max-w-6xl mx-auto mt-20 md:mt-28">
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
      <section id="venues" className="scroll-stack px-6 md:px-10 py-16 md:py-24 bg-neutral-50" style={{ zIndex: 3 }}>
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-neutral-300">
            {/* Column 1 — Headline + Description */}
            <div className="pb-8 md:pb-0 md:pr-10">
              <h2 className="font-control text-3xl md:text-4xl font-bold text-neutral-900 mb-6">
                For Venues
              </h2>
              <p className="text-neutral-600 text-sm leading-[1.9] font-mono-light max-w-xs">
                Structured drinks for serious menus. Built around balance, acidity and flavour.
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
                Carbonation levels vary slightly between drinks to suit their flavour.
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
      <section
        id="contraband"
        className={`relative ${SECTION} bg-neutral-900 relative overflow-hidden`}
        style={{ zIndex: 4 }}
        ref={contrabandRef}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setContrabandMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        }}
        onMouseLeave={() => setContrabandMouse(null)}
      >
        {/* Content layer — headings at z-30 above overlay */}
        <div className="max-w-5xl mx-auto relative z-30">
          <div className="text-center mb-16 md:mb-24">
            <h2 className="font-control text-2xl sm:text-3xl md:text-5xl font-bold text-white mb-6">
              Contraband
            </h2>
            <p className="text-neutral-500 text-xs font-mono-light italic">
              Some are monitored. Some are reformed. Some quietly disappear.
            </p>
          </div>
        </div>

        {/* Cards layer — z-10 so overlay sits partially on top */}
        <div className="max-w-5xl mx-auto relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1.3fr_1fr] gap-4 max-w-4xl mx-auto items-center">
            {contrabandDrops.map((drop, idx) => {
              const dotColor =
                drop.status === "RESTRICTED"
                  ? "bg-guilty"
                  : drop.status === "REFORMED"
                  ? "bg-amber-500"
                  : drop.status === "CLASSIFIED"
                  ? "bg-neutral-600 animate-pulse"
                  : "bg-neutral-500";
              const isMain = idx === 1;

              return (
                <div
                  key={drop.code}
                  className={`contraband-card border relative overflow-hidden group transition-all duration-300 ${isMain ? 'scale-100 bg-white border-white/10 z-30 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)]' : 'p-4 md:p-6 scale-90 opacity-60 border-neutral-700/40'}`}
                >
                  {/* Scan-line overlay */}
                  <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="contraband-scanline absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-guilty/40 to-transparent" />
                  </div>

                  {/* Static noise overlay */}
                  <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(255,255,255,0.08)_2px,rgba(255,255,255,0.08)_4px)]" />

                  {isMain ? (
                    <>
                      {/* Full-bleed video */}
                      <div className="relative w-full overflow-hidden">
                        <video
                          autoPlay
                          loop
                          muted
                          playsInline
                          className="w-full h-auto object-cover"
                          src={drop002Video}
                        />
                      </div>

                      {/* Card content with padding */}
                      <div className="px-6 md:px-8 pt-6 md:pt-8 pb-6 md:pb-8">
                        <h3 className="font-control text-xl md:text-2xl font-bold text-black tracking-[0.15em] uppercase mb-1">
                          DROP–002
                        </h3>
                        <p className="font-control text-[10px] md:text-xs text-neutral-400 tracking-[0.25em] uppercase mb-5">
                          LIMITED TO 1,000 · NO RESTOCK
                        </p>
                        <p className="text-neutral-500 text-[10px] leading-[1.8] font-mono-light mb-6">
                          One of each. Twice. Everything you need to form an opinion and very little you need to feel good about it.
                        </p>

                        <div className="space-y-3 mb-6">
                          <div>
                            <p className="font-control text-sm font-bold text-black tracking-wide">CITRUS CONFESSIONAL</p>
                            <p className="text-neutral-400 text-[10px] font-mono-light">Lemon Yuzu · ×2</p>
                          </div>
                          <div>
                            <p className="font-control text-sm font-bold text-black tracking-wide">BITTER JUSTICE</p>
                            <p className="text-neutral-400 text-[10px] font-mono-light">Blood Orange Ginger · ×2</p>
                          </div>
                          <div>
                            <p className="font-control text-sm font-bold text-black tracking-wide">COLA VICE</p>
                            <p className="text-neutral-400 text-[10px] font-mono-light">Spiced Cola · ×2</p>
                          </div>
                        </div>

                        <div className="border-t border-neutral-200 pt-4 mb-5">
                          <div className="flex items-baseline justify-between mb-1">
                            <span className="font-control text-2xl font-bold text-black tracking-tight">$80</span>
                            <span className="text-neutral-400 text-[9px] font-mono-light tracking-wider uppercase">per issue · 6 × 250ml</span>
                          </div>
                          <p className="text-neutral-400 text-[9px] font-mono-light leading-[1.6]">
                            Free shipping · Limited to 1,000 issues
                          </p>
                        </div>

                        <p className="text-neutral-400 text-[10px] font-mono-light italic mb-5">
                          Against your better judgement, as intended. Open guilty.
                        </p>

                        <button
                          onClick={() => setContactOpen(true)}
                          className="relative flex items-center justify-center gap-2 w-full py-4 bg-guilty text-white font-bold text-xs tracking-[0.2em] uppercase font-control transition-all duration-300 overflow-hidden hover:bg-guilty/90 active:scale-[0.98]"
                        >
                          Order Now — $80
                        </button>
                        <p className="text-center text-neutral-400 text-[8px] font-mono-light mt-2 tracking-wider">
                          SECURE CHECKOUT · SHIPS WORLDWIDE
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Code label */}
                      <p className={`text-[9px] tracking-[0.5em] uppercase font-mono-light mb-4 relative z-10 ${drop.unrevealed ? 'blur-[2px]' : ''} text-neutral-600`}>
                        {drop.unrevealed ? '███-███' : drop.code}
                      </p>

                      {/* Redacted name area */}
                      <div className="min-h-[80px] flex flex-col justify-center mb-4 relative z-10">
                        <p className={`font-control text-lg md:text-xl font-bold text-white/90 tracking-wide leading-tight mb-2 ${drop.finished ? 'line-through opacity-40' : ''}`}>
                          {drop.redactedName}
                        </p>
                        <p className={`text-neutral-500 text-[10px] leading-[1.7] font-mono-light ${drop.finished ? 'line-through opacity-40' : ''}`}>
                          {drop.teaser}
                        </p>
                      </div>

                      {/* Status + metadata */}
                      <div className="border-t border-neutral-700/30 pt-4 space-y-4 relative z-10">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full ${dotColor} contraband-pulse`} />
                            <span className="text-guilty/70 text-[9px] tracking-[0.3em] uppercase font-mono-light">
                              {drop.status}
                            </span>
                          </span>
                          <span className="text-neutral-600 text-[9px] font-mono-light italic">
                            {drop.lastSeen}
                          </span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Branded Blanket Overlay ── z-20: between headings (z-30) and cards (z-10) */}
        <div
          className="absolute inset-0 z-20 pointer-events-none overflow-hidden"
          style={{
            // Gradient mask: lighter in center/top, heavier at edges and bottom
            maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.35) 30%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.85) 100%), radial-gradient(ellipse 60% 50% at 50% 35%, rgba(0,0,0,0) 0%, rgba(0,0,0,0.7) 100%)',
            maskComposite: 'intersect',
            WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.35) 30%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.85) 100%)',
            WebkitMaskComposite: 'source-in',
          }}
        >
          {/* Grain / noise texture */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.06'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'repeat',
              backgroundSize: '128px 128px',
              opacity: 0.4,
            }}
          />

          {/* SVG G pattern — with blur, parallax transform, and reduced opacity */}
          <div
            className="absolute contraband-pattern-drift"
            style={{
              top: '-50%',
              left: '-50%',
              width: '200%',
              height: '200%',
              filter: 'blur(1.5px)',
              transform: `translateY(${contrabandParallax * -0.15}px)`,
              willChange: 'transform',
            }}
          >
            <svg className="w-full h-full contraband-pattern-flicker" xmlns="http://www.w3.org/2000/svg" style={{ opacity: 0.12 }}>
              <defs>
                <pattern id="g-pattern-v2" x="0" y="0" width="80" height="80" patternUnits="userSpaceOnUse" patternTransform="rotate(-15)">
                  {/* Main icon */}
                  <svg viewBox="0 0 2000 2000" width="36" height="36" x="22" y="22" opacity="0.7">
                    <path fill="#ff4800" d="M1616.319,213.027L580.102,1249.369l189.08,189.08,841.902-841.896c76.702,115.79,121.518,254.457,121.518,403.447,0,403.958-328.644,732.602-732.602,732.602s-732.602-328.644-732.602-732.602S596.042,267.398,1000,267.398c74.667,0,146.734,11.293,214.656,32.15l206.431-206.43C1293.029,33.419,1150.354,0,1000,0,448.601,0,0,448.601,0,1000s448.601,1000,1000,1000,1000-448.601,1000-1000c0-319.091-150.237-603.748-383.681-786.973Z"/>
                  </svg>
                </pattern>
                {/* Second pattern layer with slight variation */}
                <pattern id="g-pattern-v2b" x="0" y="0" width="120" height="120" patternUnits="userSpaceOnUse" patternTransform="rotate(-10) scale(1.08)">
                  <svg viewBox="0 0 2000 2000" width="32" height="32" x="44" y="44" opacity="0.35">
                    <path fill="#ff4800" d="M1616.319,213.027L580.102,1249.369l189.08,189.08,841.902-841.896c76.702,115.79,121.518,254.457,121.518,403.447,0,403.958-328.644,732.602-732.602,732.602s-732.602-328.644-732.602-732.602S596.042,267.398,1000,267.398c74.667,0,146.734,11.293,214.656,32.15l206.431-206.43C1293.029,33.419,1150.354,0,1000,0,448.601,0,0,448.601,0,1000s448.601,1000,1000,1000,1000-448.601,1000-1000c0-319.091-150.237-603.748-383.681-786.973Z"/>
                  </svg>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#g-pattern-v2)" />
              <rect width="100%" height="100%" fill="url(#g-pattern-v2b)" />
            </svg>
          </div>

          {/* Hover reveal — radial fade around cursor */}
          {contrabandMouse && (
            <div
              className="absolute inset-0"
              style={{
                background: `radial-gradient(200px circle at ${contrabandMouse.x}px ${contrabandMouse.y}px, rgba(23,23,23,0.95) 0%, transparent 100%)`,
                transition: 'background 0.15s ease-out',
              }}
            />
          )}

          {/* Dark vignette to enhance edge heaviness */}
          <div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(ellipse 70% 60% at 50% 40%, transparent 0%, rgba(10,10,10,0.5) 100%)',
            }}
          />
        </div>

      </section>

      {/* ── From the Scene ──────────────────────────── */}
      <section className="relative bg-white px-0 py-20 md:py-28" style={{ zIndex: 5 }}>
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
                <div className="w-7 h-7 rounded-full bg-guilty-600 flex items-center justify-center">
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
      <section className="scroll-stack bg-neutral-100 px-6 md:px-10 py-24 md:py-36" style={{ zIndex: 6 }}>
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
        className="scroll-stack relative px-6 md:px-10 py-28 md:py-40 bg-neutral-950 overflow-hidden"
        style={{ zIndex: 7 }}
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
              The Booth
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
      <footer className="scroll-stack px-6 py-14 border-t border-neutral-100 bg-white" style={{ zIndex: 8 }}>
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
                
                <h3 className="font-control text-xl md:text-2xl font-bold text-white mb-8">Contact</h3>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const errors: Record<string, string> = {};
                    if (!contactForm.name.trim()) errors.name = "Required";
                    if (!contactForm.phone.trim()) errors.phone = "Required";
                    if (!contactForm.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactForm.email)) errors.email = "Valid email required";
                    if (!contactForm.venue.trim()) errors.venue = "Required";
                    if (Object.keys(errors).length) { setContactErrors(errors); return; }
                    setContactErrors({});
                    setContactSending(true);
                    try {
                      // Store in database
                      await supabase.from('contact_submissions').insert({
                        name: contactForm.name.trim(),
                        phone: contactForm.phone.trim(),
                        email: contactForm.email.trim(),
                        venue: contactForm.venue.trim(),
                        message: contactForm.message.trim() || null,
                      });
                      // Send email notification
                      await supabase.functions.invoke('send-contact-email', {
                        body: {
                          name: contactForm.name.trim(),
                          phone: contactForm.phone.trim(),
                          email: contactForm.email.trim(),
                          venue: contactForm.venue.trim(),
                          message: contactForm.message.trim() || null,
                        },
                      });
                      setContactSubmitted(true);
                    } catch (err) {
                      console.error('Contact form error:', err);
                      setContactSubmitted(true); // Still show success - submission saved to DB
                    } finally {
                      setContactSending(false);
                    }
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
                        {field.label} <span className="text-guilty">*</span>
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
                        <p className="text-guilty-400 text-[10px] font-mono mt-1 tracking-wide">{contactErrors[field.key]}</p>
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
                    disabled={contactSending}
                    className="glitch-btn w-full bg-white text-black font-bold text-[11px] tracking-[0.25em] uppercase font-mono py-4 rounded hover:bg-white/90 transition-colors mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    data-text={contactSending ? "SENDING..." : "SUBMIT"}
                  >
                    {contactSending ? "SENDING..." : "SUBMIT"}
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
