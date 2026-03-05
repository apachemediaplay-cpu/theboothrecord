import { useState, useEffect } from "react";
import { X } from "lucide-react";

const SESSION_KEY = "guilty_retail_modal_shown";

interface Props {
  open?: boolean;
  onClose?: () => void;
}

const RetailEarlyAccessModal = ({ open, onClose }: Props) => {
  const [autoVisible, setAutoVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    businessName: "",
    email: "",
    mobile: "",
    message: "",
  });

  const visible = open ?? autoVisible;

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY)) return;
    const timer = setTimeout(() => {
      setAutoVisible(true);
      sessionStorage.setItem(SESSION_KEY, "1");
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setClosing(true);
    setTimeout(() => {
      setAutoVisible(false);
      onClose?.();
      setClosing(false);
    }, 300);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value });
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
      aria-label="Retail enquiry"
    >
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={handleClose}
      />

      <div
        className={`relative w-full max-w-md max-h-[92vh] overflow-y-auto bg-secondary p-5 md:p-10 shadow-[0_20px_60px_rgba(0,0,0,0.6)] transition-all duration-300 ${
          closing
            ? "opacity-0 scale-95"
            : "opacity-100 scale-100 animate-[scaleModalIn_0.4s_ease-out]"
        }`}
      >
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-muted-foreground transition-opacity hover:opacity-100 opacity-60"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {submitted ? (
          <div className="text-center py-6">
            <h3 className="font-control text-3xl md:text-4xl font-bold mb-6 text-foreground">
              Request Received
            </h3>
            <p className="text-muted-foreground text-sm leading-[1.9] font-mono-light">
              We review every submission personally.
              <br />
              If it feels like a fit, we'll be in touch.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="text-center">
            <p className="text-muted-foreground text-[10px] tracking-[0.35em] uppercase font-mono-light mb-2">
              Limited Early Access
            </p>
            <h3 className="font-control text-xl md:text-3xl font-bold mb-2 text-foreground">
              Request the First Pour
            </h3>
            <p className="text-muted-foreground text-[11px] md:text-xs leading-[1.6] font-mono-light mb-4 max-w-sm mx-auto">
              We're opening access to a small number of venues and partners who want to pour first. Leave your details and we'll be in touch.
              <span className="italic block mt-1">Limited placements. No mass rollout.</span>
            </p>

            <div className="space-y-4 mb-5 text-left">
              <div>
                <label className="block text-[10px] tracking-[0.25em] uppercase text-muted-foreground mb-2 font-mono-light">Full Name</label>
                <input type="text" name="fullName" value={form.fullName} onChange={handleChange} placeholder="Your name" required className="w-full bg-transparent border-b border-muted py-3 text-sm text-foreground focus:outline-none focus:border-foreground transition-colors font-mono-light" />
              </div>
              <div>
                <label className="block text-[10px] tracking-[0.25em] uppercase text-muted-foreground mb-2 font-mono-light">Business Name</label>
                <input type="text" name="businessName" value={form.businessName} onChange={handleChange} placeholder="Venue / Store / Business name" required className="w-full bg-transparent border-b border-muted py-3 text-sm text-foreground focus:outline-none focus:border-foreground transition-colors font-mono-light" />
              </div>
              <div>
                <label className="block text-[10px] tracking-[0.25em] uppercase text-muted-foreground mb-2 font-mono-light">Email Address</label>
                <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="Email address" required className="w-full bg-transparent border-b border-muted py-3 text-sm text-foreground focus:outline-none focus:border-foreground transition-colors font-mono-light" />
              </div>
              <div>
                <label className="block text-[10px] tracking-[0.25em] uppercase text-muted-foreground mb-2 font-mono-light">Mobile Number</label>
                <input type="tel" name="mobile" value={form.mobile} onChange={handleChange} placeholder="Mobile number" className="w-full bg-transparent border-b border-muted py-3 text-sm text-foreground focus:outline-none focus:border-foreground transition-colors font-mono-light" />
              </div>
              <div>
                <label className="block text-[10px] tracking-[0.25em] uppercase text-muted-foreground mb-2 font-mono-light">Short Message</label>
                <textarea name="message" value={form.message} onChange={handleChange} placeholder="Tell us about your venue or why GUILTY belongs there" rows={2} className="w-full bg-transparent border-b border-muted py-3 text-sm text-foreground focus:outline-none focus:border-foreground transition-colors font-mono-light resize-none" />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-4 bg-foreground text-background font-bold text-xs tracking-[0.25em] uppercase transition-opacity hover:opacity-90 rounded-full"
            >
              Submit Request
            </button>

            <p className="text-muted-foreground text-[10px] mt-4 font-mono-light tracking-wider leading-relaxed">
              We review every request.
              <br />
              If it feels like a fit, we'll reach out.
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
