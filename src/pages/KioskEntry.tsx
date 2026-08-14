import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { resolveVenueDisplayName } from "@/lib/source";

// ── /k/:slug — PUT THIS DEVICE INTO KIOSK MODE ──────────────────────────────
// The booth tablet is set up by typing one short URL. It writes nothing to the
// database, reads only what is already public (a venue's display name, printed
// on its own table cards), and affects nothing but the device that visits it —
// so it needs no auth. That is the whole reason it exists: the console is
// behind magic-link email, which is unusable on a tablet with no mail account.
//
// NOT LINKED FROM THE CONSOLE as a button for the same reason — the console
// row shows the URL as text to copy onto the tablet instead.
//
// Unknown slug → the gate, with NOTHING written. A typo must never leave a
// device half-configured (source set, kiosk not) — the three keys are written
// together or not at all.
//
// Deliberately does NOT reset the booth session: this is a setup action, and
// the reset helper belongs on the way OUT of a confession (see lib/reset).
const KioskEntry = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [tooSlow, setTooSlow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const s = (slug || "").trim().toLowerCase();
    if (!s) {
      navigate("/", { replace: true });
      return;
    }
    // venues.json resolves synchronously for every existing venue (no DB call);
    // the active-only DB fallback covers console-added ones. Either failure
    // path returns "" → unknown slug.
    resolveVenueDisplayName(s).then((displayName) => {
      if (cancelled) return;
      if (!displayName) {
        navigate("/", { replace: true });
        return;
      }
      sessionStorage.setItem("source", s);
      sessionStorage.setItem("venueName", displayName);
      sessionStorage.setItem("kiosk", "1");
      navigate("/confess", { replace: true });
    });
    // A lookup that hangs (offline tablet mid-setup) gets a line rather than a
    // blank screen — staff need to know it's the network, not the URL.
    const slow = window.setTimeout(() => !cancelled && setTooSlow(true), 4000);
    return () => {
      cancelled = true;
      window.clearTimeout(slow);
    };
  }, [slug, navigate]);

  return (
    <div className="screen-container animate-fade-in">
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground text-[13px] font-mono-light tracking-wide">
          {tooSlow ? "Still trying. Check the tablet's connection." : "Opening the booth…"}
        </p>
      </div>
    </div>
  );
};

export default KioskEntry;
