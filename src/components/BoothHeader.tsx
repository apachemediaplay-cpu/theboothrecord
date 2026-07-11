import { useState } from "react";
import { captureSourceFromUrl, venueDisplayName } from "@/lib/source";

const BoothHeader = () => {
  // Venue for the current ?source= — the SAME source config the confess prompt and the
  // share-card stamp use (venues.json via venueDisplayName). Read once on mount, exactly
  // like the confess page, so a QR param is captured before any redirect to the gate.
  const [source] = useState(() => captureSourceFromUrl());
  const venue = venueDisplayName("", source ?? "");

  // Only render for a known venue. Bare/unknown /confess shows nothing at the gate top.
  if (!venue) return null;

  return (
    <div className="fixed top-0 left-0 right-0 pt-6 pb-4 bg-gradient-to-b from-background via-background to-transparent">
      <div className="max-w-md mx-auto px-6">
        {/* Left-aligned to the same left edge as the "Once you begin…" hero + consent text.
            Reuses the old quote's font + size; whole line is Guilty orange; venue name bold. */}
        <p className="text-xl font-mono-light tracking-wide text-[#FF4800]">
          Location: <span className="font-bold">{venue}</span>
        </p>
      </div>
    </div>
  );
};

export default BoothHeader;
