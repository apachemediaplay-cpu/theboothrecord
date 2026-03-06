import { useState } from "react";
import { X } from "lucide-react";
import RetailEarlyAccessModal from "@/components/RetailEarlyAccessModal";
import guiltyLogoRed from "@/assets/guilty-logo-red.svg";
import guiltyLogoWhite from "@/assets/guilty-logo-white.svg";
import heroCan from "@/assets/retail/hero-can.png";
import colaVice from "@/assets/retail/cola-vice.png";
import citrusConfessional from "@/assets/retail/citrus-confessional.png";
import bitterJustice from "@/assets/retail/bitter-justice.png";
import productLineup from "@/assets/retail/product-lineup.png";
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
  { src: contextBar, alt: "GUILTY Soda on marble bar beside cocktail" },
  { src: contextRetail, alt: "GUILTY Soda in boutique retail fridge" },
  { src: contextSpirits, alt: "GUILTY Soda beside premium spirits" },
  { src: contextStudio, alt: "GUILTY Soda in minimal studio lighting" },
];

const productPoints = [
  "Three signature flavours",
  "Designed for modern hospitality",
  "Strong shelf presence",
  "Limited production runs",
  "Built for bars and boutique retail",
  "Brand-led consumer demand",
];

const retailPoints = [
  "Strong shelf presence",
  "Designed for bars and hospitality venues",
  "Cultural brand positioning",
  "Limited distribution model",
  "Digital brand ecosystem supporting the product",
];

/* ─── Shared styles ───────────────────────────────────── */

const SECTION = "px-6 md:px-10 py-28 md:py-40";
const SECTION_ALT = `${SECTION} bg-secondary/30`;
const H2 = "font-control text-3xl md:text-5xl font-bold";
const LABEL =
  "text-muted-foreground text-[10px] tracking-[0.35em] uppercase font-mono-light";
const BODY =
  "text-muted-foreground text-sm leading-[1.9] font-mono-light";
const LIST_ITEM =
  "text-muted-foreground text-sm font-mono-light tracking-wide border-b border-muted/30 pb-5";
const CTA_PRIMARY =
  "px-10 py-4 bg-foreground text-background font-bold text-xs tracking-[0.25em] uppercase transition-opacity hover:opacity-90";
const CTA_OUTLINE =
  "px-10 py-4 border border-foreground text-foreground font-bold text-xs tracking-[0.25em] uppercase transition-opacity hover:opacity-80";

/* ─── Component ───────────────────────────────────────── */

const Retail = () => {
  const [form, setForm] = useState({
    businessName: "",
    contactName: "",
    email: "",
    phone: "",
    venueType: "",
    monthlyVolume: "",
    location: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [ctaDismissed, setCtaDismissed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <RetailEarlyAccessModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />

      {/* ── Hero ─────────────────────────────────────── */}
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
          <h1 className="font-control text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight mb-6">
            Soda
          </h1>
          <p className={`${BODY} max-w-md mb-14 tracking-wide`}>
            A soda built for bars, restaurants and boutique retail.
          </p>
          <p className={LABEL}>
            Wholesale access and early retail allocations.
          </p>
        </div>
      </section>

      {/* ── Product Statement ────────────────────────── */}
      <section className={SECTION}>
        <div className="max-w-2xl mx-auto text-center">
          <p className={`${LABEL} mb-4`}>The Product</p>
          <h2 className={`${H2} mb-8`}>A Different Kind of Soda</h2>
          <p className={`${BODY} max-w-xl mx-auto mb-5`}>
            GUILTY Soda sits somewhere between soft drink and cultural product.
          </p>
          <p className={`${BODY} max-w-xl mx-auto mb-5`}>
            Created for bars, restaurants and boutique retailers that care about flavour, design and brand presence.
          </p>
          <p className={`${BODY} max-w-xl mx-auto`}>
            The drink is built to stand apart on the shelf and behind the bar.
          </p>
        </div>
      </section>

      {/* ── Full Width Lineup Image ──────────────────── */}
      <section className="w-full">
        <img
          src={productLineup}
          alt="GUILTY Soda product lineup on marble bar"
          className="w-full h-80 md:h-[500px] lg:h-[600px] object-cover"
        />
      </section>

      {/* ── Product Overview ─────────────────────────── */}
      <section className={SECTION}>
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16 md:gap-24 items-center">
          <div>
            <p className={`${LABEL} mb-4`}>At a Glance</p>
            <h2 className={`${H2} mb-10`}>Product Overview</h2>
            <div className="space-y-5">
              {productPoints.map((point) => (
                <p key={point} className={LIST_ITEM}>
                  {point}
                </p>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Flavour Block ────────────────────────────── */}
      <section className="px-6 md:px-10 py-28 md:py-40 bg-white text-neutral-900">
        <div className="max-w-6xl mx-auto">
          <p className="text-neutral-500 text-[10px] tracking-[0.35em] uppercase font-mono-light text-center mb-4">The Range</p>
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

      {/* ── Product Origin ───────────────────────────── */}
      <section className={SECTION}>
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16 md:gap-24 items-center">
          <div>
            <p className={`${LABEL} mb-4`}>The Story</p>
            <h2 className={`${H2} mb-8`}>Where It Started</h2>
            <p className={`${BODY} mb-5`}>
              GUILTY began as a cultural brand exploring indulgence and behaviour.
            </p>
            <p className={`${BODY} mb-5`}>
              The soda followed naturally — a drink designed for the same environments where those ideas already exist.
            </p>
            <p className={BODY}>
              Bars, restaurants and places where people gather.
            </p>
          </div>
          <img
            src={contextSpirits}
            alt="GUILTY beside premium spirits"
            className="w-full max-w-sm mx-auto md:max-w-none drop-shadow-[0_20px_40px_rgba(0,0,0,0.5)]"
          />
        </div>
      </section>

      {/* ── Retail Positioning ───────────────────────── */}
      <section className={SECTION_ALT}>
        <div className="max-w-2xl mx-auto text-center">
          <p className={`${LABEL} mb-4`}>The Opportunity</p>
          <h2 className={`${H2} mb-10`}>Built for Premium Retail</h2>
          <div className="space-y-5 inline-block text-left">
            {retailPoints.map((point) => (
              <p key={point} className={LIST_ITEM}>
                {point}
              </p>
            ))}
          </div>
        </div>
      </section>

      {/* ── Product In Context Gallery ────────────────── */}
      <section className="py-28 md:py-40">
        <p className={`${LABEL} text-center mb-14`}>Product In Context</p>
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
      </section>

      {/* ── Retail Enquiry Block ──────────────────────── */}
      <section id="enquiry" className={SECTION_ALT}>
        <div className="max-w-2xl mx-auto text-center">
          <p className={`${LABEL} mb-4`}>Get In Touch</p>
          <h2 className={`${H2} mb-6`}>
            Retail & Distribution Enquiries
          </h2>
          <p className={`${BODY} mb-12 max-w-lg mx-auto`}>
            For wholesale access, venue partnerships or distribution discussions please contact the founders directly.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="mailto:founders@guiltyconfess.com" className={CTA_PRIMARY}>
              Email Founders
            </a>
            <button className={CTA_OUTLINE}>Download Retail Pack</button>
          </div>
        </div>
      </section>

      {/* ── Expression of Interest Form ──────────────── */}
      <section className={SECTION}>
        <div className="max-w-lg mx-auto">
          <p className={`${LABEL} text-center mb-4`}>Limited Allocations</p>
          <h2 className={`${H2} text-center mb-4`}>
            Pre-Order Expression of Interest
          </h2>
          <p className={`${BODY} text-center mb-5 max-w-sm mx-auto`}>
            Early allocations are limited.
          </p>
          <p className={`${BODY} text-center mb-12 max-w-sm mx-auto`}>
            Submit your details and we will contact you regarding availability.
          </p>

          {submitted ? (
            <div className="text-center py-20">
              <p className="font-control text-3xl font-bold mb-5">
                Thank you.
              </p>
              <p className={BODY}>
                We'll be in touch regarding your allocation.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-7">
              {[
                { name: "businessName", label: "Business Name", type: "text" },
                { name: "contactName", label: "Contact Name", type: "text" },
                { name: "email", label: "Email", type: "email" },
                { name: "phone", label: "Phone", type: "tel" },
                {
                  name: "venueType",
                  label: "Venue / Retail Type",
                  type: "text",
                },
                {
                  name: "monthlyVolume",
                  label: "Estimated Monthly Volume",
                  type: "text",
                },
                { name: "location", label: "Location", type: "text" },
              ].map((field) => (
                <div key={field.name}>
                  <label className={`block ${LABEL} mb-3`}>
                    {field.label}
                  </label>
                  <input
                    type={field.type}
                    name={field.name}
                    value={form[field.name as keyof typeof form]}
                    onChange={handleChange}
                    required
                    className="w-full bg-transparent border-b border-muted py-3 text-sm text-foreground focus:outline-none focus:border-foreground transition-colors font-mono-light"
                  />
                </div>
              ))}
              <div className="pt-8">
                <button type="submit" className={`w-full ${CTA_PRIMARY}`}>
                  Request Allocation
                </button>
                <p className={`${LABEL} text-center mt-5`}>
                  Early allocations are limited.
                </p>
              </div>
            </form>
          )}
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

      {/* ── Sticky CTA Banner ────────────────────────── */}
      {!ctaDismissed && (
        <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 md:px-6 md:pb-6">
          <div className="relative max-w-xl mx-auto bg-foreground text-background px-6 py-4 flex items-center justify-between gap-4 shadow-[0_-4px_30px_rgba(0,0,0,0.3)]">
            <button
              onClick={() => setModalOpen(true)}
              className="flex-1 text-center font-bold text-xs tracking-[0.25em] uppercase transition-opacity hover:opacity-80"
            >
              Retailer Enquiries
            </button>
            <button
              onClick={() => setCtaDismissed(true)}
              className="absolute -top-2.5 -right-2.5 w-6 h-6 bg-muted text-muted-foreground rounded-full flex items-center justify-center transition-opacity hover:opacity-70"
              aria-label="Dismiss"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Retail;
