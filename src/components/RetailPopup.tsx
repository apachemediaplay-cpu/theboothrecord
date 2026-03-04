import { useState, useEffect } from "react";
import { X } from "lucide-react";

const RetailPopup = () => {
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const alreadyShown = sessionStorage.getItem("guilty_retail_popup");
    if (alreadyShown) return;

    const timer = setTimeout(() => {
      setVisible(true);
      sessionStorage.setItem("guilty_retail_popup", "1");
    }, 4000);

    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4 animate-in fade-in duration-500"
      onClick={() => setVisible(false)}
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/70" />

      {/* Modal */}
      <div
        className="relative w-full max-w-md bg-[hsl(35,20%,92%)] text-[hsl(20,12%,9%)] p-10 md:p-14 shadow-[0_20px_60px_rgba(0,0,0,0.4)] animate-in zoom-in-95 fade-in duration-500"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={() => setVisible(false)}
          className="absolute top-4 right-4 p-1 opacity-40 hover:opacity-80 transition-opacity"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {submitted ? (
          <div className="text-center py-6">
            <h2 className="font-playfair text-3xl md:text-4xl font-bold mb-6">
              YOU'RE IN
            </h2>
            <p className="text-sm leading-relaxed opacity-60 font-mono-light max-w-xs mx-auto">
              Check your inbox. Your exclusive offer is waiting.
            </p>
          </div>
        ) : (
          <>
            <h2 className="font-playfair text-3xl md:text-4xl font-bold text-center mb-6 leading-tight">
              THE FIRST SIP ISN'T FOR EVERYONE
            </h2>
            <p className="text-sm text-center leading-relaxed opacity-60 font-mono-light mb-10 max-w-xs mx-auto">
              A limited launch offer is waiting.
              <br />
              Enter your email to unlock early access before the rest of the world catches on.
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email address"
                className="w-full rounded-full border border-black/15 bg-white/70 px-6 py-4 text-sm font-mono-light placeholder:text-black/30 focus:outline-none focus:border-black/40 transition-colors"
              />
              <button
                type="submit"
                className="w-full rounded-full bg-[hsl(20,12%,9%)] text-[hsl(40,10%,92%)] py-4 font-bold text-xs tracking-[0.25em] uppercase transition-opacity hover:opacity-90"
              >
                GET ACCESS
              </button>
            </form>

            <p className="text-[10px] text-center opacity-35 mt-8 font-mono-light leading-relaxed">
              We respect your privacy.
              <br />
              You can unsubscribe at any time.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default RetailPopup;
