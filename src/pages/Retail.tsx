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
  image: colaVice
},
{
  name: "Citrus Confessional",
  tagline: "What happens when lemon tells the truth.",
  description:
  "Sharp. Bright. Unapologetically fresh. Yuzu slips in quietly — floral, mysterious, slightly wild — turning a familiar citrus soda into something far more interesting. Clean, crisp, and dangerously drinkable.",
  notes: ["Lemon", "Yuzu", "Fresh citrus"],
  image: citrusConfessional
},
{
  name: "Bitter Justice",
  tagline: "This isn't sweet revenge. It's better.",
  description:
  "Blood orange brings the depth. Ginger delivers the bite. A quiet bitterness lingers just long enough to remind you why you came back for another sip. Sharp. Bold. Unapologetically guilty.",
  notes: ["Blood orange", "Ginger", "Bitters"],
  image: bitterJustice
}];


const contextImages = [
{ src: contextBar, alt: "GUILTY Soda on marble bar beside cocktail" },
{ src: contextRetail, alt: "GUILTY Soda in boutique retail fridge" },
{ src: contextSpirits, alt: "GUILTY Soda beside premium spirits" },
{ src: contextStudio, alt: "GUILTY Soda in minimal studio lighting" }];


const productPoints = [
"Premium craft soda",
"Three signature flavours",
"Designed for modern hospitality",
"Limited production runs",
"Strong shelf presence",
"Brand-led consumer demand"];


const retailPoints = [
"High-impact shelf presence",
"Designed for modern hospitality venues",
"Cultural brand positioning",
"Limited distribution model",
"Built-in digital brand ecosystem"];


const Retail = () => {
  const [form, setForm] = useState({
    businessName: "",
    contactName: "",
    email: "",
    phone: "",
    venueType: "",
    monthlyVolume: "",
    location: ""
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
      <section className="relative h-screen flex flex-col items-center justify-end overflow-hidden">
        <img
          src={heroCan}
          alt="GUILTY Soda"
          className="absolute inset-0 w-full h-full object-cover" />
        
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
        <div className="relative z-10 flex flex-col items-center text-center px-6 pb-16 md:pb-24">
          <img src={guiltyLogoRed} alt="GUILTY" className="h-6 mb-10 opacity-60" />
          <h1 className="font-control text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight mb-6">
            Soda
          </h1>
          <p className="text-muted-foreground text-sm md:text-base max-w-md mb-14 font-mono-light tracking-wide">
            A premium craft soda built for modern venues and boutique retail.
          </p>
          <a
            href="#enquiry"
            className="inline-block px-10 py-5 bg-foreground text-background font-bold text-xs tracking-[0.25em] uppercase transition-opacity hover:opacity-90 mb-5">
            
            Retailer Enquiries
          </a>
          <p className="text-muted-foreground text-[11px] font-mono-light tracking-wider">
            Wholesale access and early retail allocations.
          </p>
        </div>
      </section>

      {/* Product Statement */}
      <section className="px-6 py-32 md:py-44">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="font-control text-4xl md:text-5xl lg:text-6xl font-bold mb-10">
            A Different Kind of Soda
          </h2>
          <p className="text-muted-foreground text-sm md:text-base leading-[1.9] font-mono-light max-w-xl mx-auto">
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
          className="w-full h-80 md:h-[500px] lg:h-[600px] object-cover" />
        
      </section>

      {/* Product Overview — image left, text right */}
      <section className="px-6 py-32 md:py-44">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16 md:gap-24 items-center">
          <img
            src={heroCan}
            alt="GUILTY Soda can"
            className="w-full max-w-sm mx-auto md:max-w-none drop-shadow-[0_20px_40px_rgba(0,0,0,0.5)]" />
          
          <div>
            <h2 className="font-control text-4xl md:text-5xl font-bold mb-12">
              Product Overview
            </h2>
            <div className="space-y-5">
              {productPoints.map((point) =>
              <p key={point} className="text-muted-foreground text-sm font-mono-light tracking-wide border-b border-muted/30 pb-5">
                  {point}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Flavour Block */}
      <section className="px-6 py-32 md:py-44 bg-white text-black">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-control text-4xl md:text-5xl lg:text-6xl font-bold text-center mb-24 md:mb-32">
            Three Signature Flavours
          </h2>
          <div className="space-y-32 md:space-y-44">
            {flavours.map((f, i) =>
            <div
              key={f.name}
              className={`grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-center ${
              i % 2 !== 0 ? "md:[direction:rtl]" : ""}`
              }>
              
                <div className="flex justify-center">
                  <img
                  src={f.image}
                  alt={f.name}
                  className="w-56 md:w-72 lg:w-80 drop-shadow-[0_20px_50px_rgba(0,0,0,0.5)]" />
                
                </div>
                <div className={i % 2 !== 0 ? "md:[direction:ltr]" : ""}>
                  <h3 className="font-control text-3xl md:text-4xl font-bold mb-3">{f.name}</h3>
                  <p className="text-black/60 text-sm italic mb-6 font-mono-light">{f.tagline}</p>
                  <p className="text-black/50 text-xs leading-[1.9] mb-8 max-w-sm font-mono-light">
                    {f.description}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {f.notes.map((note) =>
                  <span
                    key={note}
                    className="px-4 py-1.5 border border-black/20 text-[10px] tracking-[0.2em] uppercase text-black/50">
                    
                        {note}
                      </span>
                  )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Product Origin — text left, image right */}
      <section className="px-6 py-32 md:py-44">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16 md:gap-24 items-center">
          <div>
            <h2 className="font-control text-4xl md:text-5xl font-bold mb-10">
              Where It Started
            </h2>
            <p className="text-muted-foreground text-sm leading-[1.9] font-mono-light mb-5">
              GUILTY began as a cultural brand exploring indulgence and behaviour.
            </p>
            <p className="text-muted-foreground text-sm leading-[1.9] font-mono-light mb-5">
              The soda followed naturally — a physical product designed for real-world
              environments where brand, flavour and experience matter equally.
            </p>
            <p className="text-muted-foreground text-sm leading-[1.9] font-mono-light">
              Rather than compete with traditional soft drinks, GUILTY occupies a different
              space: a premium cultural beverage.
            </p>
          </div>
          <img
            src={contextSpirits}
            alt="GUILTY beside premium spirits"
            className="w-full max-w-sm mx-auto md:max-w-none drop-shadow-[0_20px_40px_rgba(0,0,0,0.5)]" />
          
        </div>
      </section>

      {/* Retail Positioning */}
      <section className="px-6 py-32 md:py-44 bg-secondary/30">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="font-control text-4xl md:text-5xl font-bold mb-14">
            Built for Premium Retail
          </h2>
          <div className="space-y-5 inline-block text-left">
            {retailPoints.map((point) =>
            <p key={point} className="text-muted-foreground text-sm font-mono-light tracking-wide border-b border-muted/30 pb-5">
                {point}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Product In Context Gallery — edge to edge */}
      <section className="py-32 md:py-44">
        <p className="text-muted-foreground text-[10px] tracking-[0.35em] uppercase text-center mb-14 font-mono-light">
          Product In Context
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-1">
          {contextImages.map((img) =>
          <img
            key={img.alt}
            src={img.src}
            alt={img.alt}
            className="w-full aspect-[3/4] object-cover" />

          )}
        </div>
      </section>

      {/* Retail Enquiry Block */}
      <section id="enquiry" className="px-6 py-32 md:py-44 bg-secondary/30">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="font-control text-4xl md:text-5xl font-bold mb-8">
            Retail & Distribution Enquiries
          </h2>
          <p className="text-muted-foreground text-sm leading-[1.9] font-mono-light mb-14 max-w-lg mx-auto">
            For wholesale access, venue partnerships or distribution discussions
            please contact the founders directly.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="mailto:founders@guiltyconfess.com"
              className="px-10 py-5 bg-foreground text-background font-bold text-xs tracking-[0.25em] uppercase transition-opacity hover:opacity-90">
              
              Email Founders
            </a>
            <button
              className="px-10 py-5 border border-foreground text-foreground font-bold text-xs tracking-[0.25em] uppercase transition-opacity hover:opacity-80">
              
              Download Retail Pack
            </button>
          </div>
        </div>
      </section>

      {/* Expression of Interest Form */}
      <section className="px-6 py-32 md:py-44">
        <div className="max-w-lg mx-auto">
          <h2 className="font-control text-4xl md:text-5xl font-bold text-center mb-6">
            Pre-Order Expression of Interest
          </h2>
          {submitted ?
          <div className="text-center py-20">
              <p className="font-control text-3xl font-bold mb-5">Thank you.</p>
              <p className="text-muted-foreground text-sm font-mono-light">
                We'll be in touch regarding your allocation.
              </p>
            </div> :

          <form onSubmit={handleSubmit} className="mt-14 space-y-8">
              {[
            { name: "businessName", label: "Business Name", type: "text" },
            { name: "contactName", label: "Contact Name", type: "text" },
            { name: "email", label: "Email", type: "email" },
            { name: "phone", label: "Phone", type: "tel" },
            { name: "venueType", label: "Venue / Retail Type", type: "text" },
            { name: "monthlyVolume", label: "Estimated Monthly Volume", type: "text" },
            { name: "location", label: "Location", type: "text" }].
            map((field) =>
            <div key={field.name}>
                  <label className="block text-[10px] tracking-[0.25em] uppercase text-muted-foreground mb-3 font-mono-light">
                    {field.label}
                  </label>
                  <input
                type={field.type}
                name={field.name}
                value={form[field.name as keyof typeof form]}
                onChange={handleChange}
                required
                className="w-full bg-transparent border-b border-muted py-4 text-sm text-foreground focus:outline-none focus:border-foreground transition-colors font-mono-light" />
              
                </div>
            )}
              <div className="pt-10">
                <button
                type="submit"
                className="w-full py-5 bg-foreground text-background font-bold text-xs tracking-[0.25em] uppercase transition-opacity hover:opacity-90">
                
                  Request Allocation
                </button>
                <p className="text-muted-foreground text-[10px] text-center mt-5 font-mono-light tracking-wider">
                  Early allocations are limited.
                </p>
              </div>
            </form>
          }
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-16 border-t border-muted/30">
        <div className="max-w-5xl mx-auto flex flex-col items-center gap-5">
          <img src={guiltyLogoRed} alt="GUILTY" className="h-5 opacity-50" />
          <p className="text-muted-foreground text-[10px] font-mono-light tracking-widest">
            © {new Date().getFullYear()} GUILTY. All rights reserved.
          </p>
        </div>
      </footer>
    </div>);

};

export default Retail;