import { useState, useEffect } from "react";
import { captureSourceFromUrl, venueDisplayName, resolveVenueDisplayName } from "@/lib/source";

const BoothHeader = () => {
  // Venue for the current ?source= — the SAME source config the confess prompt and the
  // share-card stamp use. Read once on mount, exactly like the confess page, so a QR
  // param is captured before any redirect to the gate.
  const [source] = useState(() => captureSourceFromUrl());
  // venues.json resolves synchronously (existing venues: instant, exactly as before,
  // NO DB call). A console-added (DB-only) venue starts with no line and it appears
  // when the fallback resolves; any failure leaves "" → no line, as before.
  const [venue, setVenue] = useState(() => venueDisplayName("", source ?? ""));
  useEffect(() => {
    if (venue) return; // resolved from venues.json — the DB fallback never runs
    let cancelled = false;
    resolveVenueDisplayName(source).then((name) => {
      if (!cancelled && name) setVenue(name);
    });
    return () => {
      cancelled = true;
    };
  }, [venue, source]);

  // Only render for a known venue. Bare/unknown /confess shows nothing at the gate top.
  if (!venue) return null;

  return (
    <div className="fixed top-0 left-0 right-0 pt-6 pb-4 bg-gradient-to-b from-background via-background to-transparent">
      <div className="column-cap mx-auto px-6">
        {/* Left-aligned to the same left edge as the "Once you begin…" hero + consent text.
            "AT <VENUE>" — no label, no colon, no bold: the preposition carries it,
            matching the app's other metadata voice (AS CHARGED AT, LOCATION
            WITHHELD, SUBJECT #). State Blue with a STATIC glow (venue-glow-text
            in index.css — static by design, see its note before animating it). */}
        <p className="venue-glow-text text-[17px] font-mono-light uppercase tracking-wide">
          AT {venue}
        </p>
      </div>
    </div>
  );
};

export default BoothHeader;
