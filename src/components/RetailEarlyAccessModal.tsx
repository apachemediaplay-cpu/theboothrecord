import { useState, useEffect } from "react";
import { X } from "lucide-react";

const SESSION_KEY = "guilty_retail_modal_shown";

const RetailEarlyAccessModal = () => {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY)) return;
    const timer = setTimeout(() => {
      setVisible(true);
      sessionStorage.setItem(SESSION_KEY, "1");
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setClosing(true);
    setTimeout(() => setVisible(false), 300);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-[60] flex items-center justify-center px-4 transition-opacity duration-300 ${
        closing ? "opacity-0" : "opacity-100"
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="Early access offer"
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div
        className={`relative w-full max-w-md bg-secondary p-10 md:p-14 shadow-[0_20px_60px_rgba(0,0,0,0.6)] transition-all duration-300 ${
          closing
            ? "opacity-0 scale-95"
            : "opacity-100 scale-100 animate-[scaleModalIn_0.4s_ease-out]"
        }`}
      >
        {/* Close */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-muted-foreground transition-opacity hover:opacity-100 opacity-60"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {submitted ? (
          /* Confirmation State */
          <div className="text-center py-6">
            <h3 className="font-control text-3xl md:text-4xl font-bold mb-6 text-foreground">
              You're In
            </h3>
            <p className="text-muted-foreground text-sm leading-[1.9] font-mono-light">
              Check your inbox.
              <br />
              Your exclusive launch offer is waiting.
            </p>
          </div>
        ) : (
          /* Form State */
          <form onSubmit={handleSubmit} className="text-center">
            <p className="text-muted-foreground text-[10px] tracking-[0.35em] uppercase font-mono-light mb-6">
              Limited Early Access
            </p>
            <h3 className="font-control text-3xl md:text-4xl font-bold mb-6 text-foreground">
              Unlock the First Pour
            </h3>
            <p className="text-muted-foreground text-sm leading-[1.9] font-mono-light mb-10 max-w-sm mx-auto">
              Before GUILTY hits shelves, a limited number of early offers are
              being released. Join the list to unlock an exclusive launch deal
              and early access to our first retail drop.
            </p>

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email address"
              required
              className="w-full bg-transparent border-b border-muted py-4 text-sm text-foreground focus:outline-none focus:border-foreground transition-colors font-mono-light mb-8 text-center placeholder:text-muted-foreground"
            />

            <button
              type="submit"
              className="w-full py-5 bg-foreground text-background font-bold text-xs tracking-[0.25em] uppercase transition-opacity hover:opacity-90 rounded-full"
            >
              Unlock the Offer
            </button>

            <p className="text-muted-foreground text-[10px] mt-6 font-mono-light tracking-wider leading-relaxed">
              We respect your privacy.
              <br />
              Unsubscribe at any time.
            </p>
          </form>
        )}
      </div>

      <style>{`
        @keyframes scaleModalIn {
          0% { opacity: 0; transform: scale(0.92); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
};

export default RetailEarlyAccessModal;
