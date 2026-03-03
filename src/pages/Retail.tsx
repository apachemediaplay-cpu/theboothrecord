import { useState } from "react";
import guiltyLogoRed from "@/assets/guilty-logo-red.svg";
import heroCan from "@/assets/retail/hero-can.png";
import colaVice from "@/assets/retail/cola-vice.png";
import citrusConfessional from "@/assets/retail/citrus-confessional.png";
import bitterJustice from "@/assets/retail/bitter-justice.png";
import productLineup from "@/assets/retail/product-lineup.png";
import contextBar from "@/assets/retail/context-bar.png";
import contextRetail from "@/assets/retail/context-retail.png";
import contextSpirits from "@/assets/retail/context-spirits.png";
import contextStudio from "@/assets/retail/context-studio.png";

const flavours = [
  {
    name: "Cola Vice",
    tagline: "Cola with a past.",
    description:
      "Dark spice. Real citrus. A smooth hit of vanilla. Every sip reveals something new — warmth, depth, a little trouble. Classic cola rewritten with better ingredients and fewer apologies.",
    notes: ["Dark spice", "Citrus", "Vanilla"],
    image: colaVice,
  },
  {
    name: "Citrus Confessional",
    tagline: "What happens when lemon tells the truth.",
    description:
      "Sharp. Bright. Unapologetically fresh. Yuzu slips in quietly — floral, mysterious, slightly wild — turning a familiar citrus soda into something far more interesting. Clean, crisp, and dangerously drinkable.",
    notes: ["Lemon", "Yuzu", "Fresh citrus"],
    image: citrusConfessional,
  },
  {
    name: "Bitter Justice",
    tagline: "This isn't sweet revenge. It's better.",
    description:
      "Blood orange brings the depth. Ginger delivers the bite. A quiet bitterness lingers just long enough to remind you why you came back for another sip. Sharp. Bold. Unapologetically guilty.",
    notes: ["Blood orange", "Ginger", "Bitters"],
    image: bitterJustice,
  },
];

const contextImages = [
  { src: contextBar, alt: "GUILTY Soda on marble bar beside cocktail" },
  { src: contextRetail, alt: "GUILTY Soda in boutique retail fridge" },
  { src: contextSpirits, alt: "GUILTY Soda beside premium spirits" },
  { src: contextStudio, alt: "GUILTY Soda in minimal studio lighting" },
];

const retailPoints = [
  "High-impact shelf presence",
  "Designed for modern hospitality venues",
  "Cultural brand positioning",
  "Limited distribution model",
  "Built-in digital brand ecosystem",
];

const productPoints = [
  "Premium craft soda",
  "Three signature flavours",
  "Designed for hospitality and boutique retail",
  "Limited production runs",
  "Strong shelf presence",
  "Brand-led consumer demand",
];

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-black via-background to-background" />
        <div className="relative z-10 flex flex-col items-center text-center max-w-3xl mx-auto">
          <img src={guiltyLogoRed} alt="GUILTY" className="h-8 mb-12 opacity-80" />
          <img
            src={heroCan}
            alt="GUILTY Soda"
            className="w-56 md:w-72 lg:w-80 mb-12 drop-shadow-2xl"
          />
          <h1 className="font-control text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-4">
            GUILTY Soda
          </h1>
          <p className="text-muted-foreground text-sm md:text-base max-w-md mb-10 font-mono-light">
            A premium craft soda built for modern venues and boutique retail.
          </p>
          <a
            href="#enquiry"
            className="inline-block px-8 py-4 bg-foreground text-background font-bold text-sm tracking-[0.2em] uppercase transition-opacity hover:opacity-90 mb-4"
          >
            Retailer Enquiries
          </a>
          <p className="text-muted-foreground text-xs font-mono-light">
            Wholesale access and early retail allocations.
          </p>
        </div>
      </section>

      {/* Product Statement */}
      <section className="px-6 py-24 md:py-32">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="font-control text-3xl md:text-4xl font-bold mb-8">
            A Different Kind of Soda
          </h2>
          <p className="text-muted-foreground text-sm md:text-base leading-relaxed font-mono-light">
            GUILTY Soda sits somewhere between premium soft drink and cultural product.
            Created for bars, restaurants and boutique retailers that care about brand,
            design and flavour, the product is built to stand apart on the shelf and behind the bar.
          </p>
        </div>
      </section>

      {/* Full Width Lineup Image */}
      <section className="w-full">
        <img
          src={productLineup}
          alt="GUILTY Soda product lineup on marble bar"
          className="w-full h-64 md:h-96 lg:h-[500px] object-cover"
        />
      </section>

      {/* Product Overview — image left, text right */}
      <section className="px-6 py-24 md:py-32">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-center">
          <img
            src={heroCan}
            alt="GUILTY Soda can"
            className="w-full max-w-xs mx-auto md:max-w-none"
          />
          <div>
            <h2 className="font-control text-3xl md:text-4xl font-bold mb-8">
              Product Overview
            </h2>
            <ul className="space-y-4">
              {productPoints.map((point) => (
                <li key={point} className="flex items-start gap-3 text-muted-foreground text-sm font-mono-light">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-foreground shrink-0" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Flavour Block */}
      <section className="px-6 py-24 md:py-32 bg-secondary/30">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-control text-3xl md:text-4xl font-bold text-center mb-16">
            Three Signature Flavours
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-6">
            {flavours.map((f) => (
              <div key={f.name} className="flex flex-col items-center text-center">
                <img
                  src={f.image}
                  alt={f.name}
                  className="w-44 md:w-52 mb-8 drop-shadow-lg"
                />
                <h3 className="font-control text-2xl font-bold mb-2">{f.name}</h3>
                <p className="text-foreground/70 text-sm italic mb-4 font-mono-light">{f.tagline}</p>
                <p className="text-muted-foreground text-xs leading-relaxed mb-6 max-w-xs font-mono-light">
                  {f.description}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {f.notes.map((note) => (
                    <span
                      key={note}
                      className="px-3 py-1 border border-muted text-[10px] tracking-[0.15em] uppercase text-muted-foreground"
                    >
                      {note}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Product Origin — text left, image right */}
      <section className="px-6 py-24 md:py-32">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-center">
          <div>
            <h2 className="font-control text-3xl md:text-4xl font-bold mb-8">
              Where It Started
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed font-mono-light mb-4">
              GUILTY began as a cultural brand exploring indulgence and behaviour.
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed font-mono-light mb-4">
              The soda followed naturally — a physical product designed for real-world
              environments where brand, flavour and experience matter equally.
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed font-mono-light">
              Rather than compete with traditional soft drinks, GUILTY occupies a different
              space: a premium cultural beverage.
            </p>
          </div>
          <img
            src={contextSpirits}
            alt="GUILTY beside premium spirits"
            className="w-full max-w-xs mx-auto md:max-w-none"
          />
        </div>
      </section>

      {/* Retail Positioning */}
      <section className="px-6 py-24 md:py-32 bg-secondary/30">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="font-control text-3xl md:text-4xl font-bold mb-10">
            Built for Premium Retail
          </h2>
          <ul className="space-y-4 inline-block text-left">
            {retailPoints.map((point) => (
              <li key={point} className="flex items-start gap-3 text-muted-foreground text-sm font-mono-light">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-foreground shrink-0" />
                {point}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Product In Context Gallery */}
      <section className="px-6 py-24 md:py-32">
        <div className="max-w-6xl mx-auto">
          <p className="text-muted-foreground text-[10px] tracking-[0.3em] uppercase text-center mb-12 font-mono-light">
            Product In Context
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            {contextImages.map((img) => (
              <img
                key={img.alt}
                src={img.src}
                alt={img.alt}
                className="w-full aspect-square object-cover"
              />
            ))}
          </div>
        </div>
      </section>

      {/* Retail Enquiry Block */}
      <section id="enquiry" className="px-6 py-24 md:py-32 bg-secondary/30">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="font-control text-3xl md:text-4xl font-bold mb-6">
            Retail & Distribution Enquiries
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed font-mono-light mb-10">
            For wholesale access, venue partnerships or distribution discussions
            please contact the founders directly.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="mailto:founders@guiltyconfess.com"
              className="px-8 py-4 bg-foreground text-background font-bold text-sm tracking-[0.2em] uppercase transition-opacity hover:opacity-90"
            >
              Email Founders
            </a>
            <button
              className="px-8 py-4 border border-foreground text-foreground font-bold text-sm tracking-[0.2em] uppercase transition-opacity hover:opacity-80"
            >
              Download Retail Pack
            </button>
          </div>
        </div>
      </section>

      {/* Expression of Interest Form */}
      <section className="px-6 py-24 md:py-32">
        <div className="max-w-lg mx-auto">
          <h2 className="font-control text-3xl md:text-4xl font-bold text-center mb-4">
            Pre-Order Expression of Interest
          </h2>
          {submitted ? (
            <div className="text-center py-16">
              <p className="font-control text-2xl font-bold mb-4">Thank you.</p>
              <p className="text-muted-foreground text-sm font-mono-light">
                We'll be in touch regarding your allocation.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-10 space-y-5">
              {[
                { name: "businessName", label: "Business Name", type: "text" },
                { name: "contactName", label: "Contact Name", type: "text" },
                { name: "email", label: "Email", type: "email" },
                { name: "phone", label: "Phone", type: "tel" },
                { name: "venueType", label: "Venue / Retail Type", type: "text" },
                { name: "monthlyVolume", label: "Estimated Monthly Volume", type: "text" },
                { name: "location", label: "Location", type: "text" },
              ].map((field) => (
                <div key={field.name}>
                  <label className="block text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-2 font-mono-light">
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
              <div className="pt-6">
                <button
                  type="submit"
                  className="w-full py-4 bg-foreground text-background font-bold text-sm tracking-[0.2em] uppercase transition-opacity hover:opacity-90"
                >
                  Request Allocation
                </button>
                <p className="text-muted-foreground text-[10px] text-center mt-4 font-mono-light">
                  Early allocations are limited.
                </p>
              </div>
            </form>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-12 border-t border-muted">
        <div className="max-w-5xl mx-auto flex flex-col items-center gap-4">
          <img src={guiltyLogoRed} alt="GUILTY" className="h-5 opacity-60" />
          <p className="text-muted-foreground text-[10px] font-mono-light tracking-wide">
            © {new Date().getFullYear()} GUILTY. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Retail;
