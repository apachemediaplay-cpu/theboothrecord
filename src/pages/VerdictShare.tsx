import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import BoothFooter from "@/components/BoothFooter";
import { fetchSharedVerdict, type SharedVerdict } from "@/lib/metrics";
import { venueDisplayName, mayStampVenue } from "@/lib/source";

// Public landing for a shared verdict link (/v/:id). A recipient — not the confessor —
// lands here. Reads the verdict by its unguessable uuid via get_share_verdict; an unknown
// or non-uuid id resolves to nothing and shows the not-found state. No names, venue only.
const VerdictShare = () => {
  const { id } = useParams<{ id: string }>();
  const [status, setStatus] = useState<"loading" | "found" | "notfound">("loading");
  const [row, setRow] = useState<SharedVerdict | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    fetchSharedVerdict(id).then((r) => {
      if (cancelled) return;
      setRow(r);
      setStatus(r ? "found" : "notfound");
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // CTA carries the venue source so a scan-through from the shared link still attributes.
  const source = row?.source ?? "";
  const ctaHref =
    source && source !== "direct" ? `/confess?source=${encodeURIComponent(source)}` : "/confess";
  // FAIL CLOSED: only an explicit stamp_venue === true shows the venue. A missing field (older
  // get_share_verdict), a null row, or a failed fetch all fall through to "" → the existing
  // "Location withheld". Venue name resolves from the source slug via venues.json only.
  const venue = mayStampVenue(row?.stamp_venue) ? venueDisplayName("", source) : "";

  if (status === "loading") {
    return (
      <main className="screen-container animate-fade-in">
        <div className="flex-1 flex items-center justify-center">
          <p className="text-ritual text-lg font-mono-light tracking-wide">Pulling the record…</p>
        </div>
        <BoothFooter />
      </main>
    );
  }

  if (status === "notfound") {
    return (
      <main className="screen-container animate-fade-in">
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
          <p className="text-muted-foreground text-base font-mono-light">This record doesn't exist.</p>
        </div>
        <div className="fixed bottom-32 left-0 right-0 flex justify-center px-6">
          <Link to="/confess" className="btn-booth text-center">
            ENTER THE BOOTH →
          </Link>
        </div>
        <BoothFooter />
      </main>
    );
  }

  return (
    <main className="screen-container animate-fade-in">
      <div className="flex-1 flex flex-col justify-center items-start text-left pb-40">
        <p className="text-ritual text-sm font-mono-light tracking-[0.2em] uppercase mb-6">
          The booth noticed.
        </p>
        {row?.confession_text ? (
          <p className="text-muted-foreground text-base font-mono-light whitespace-pre-wrap mb-8">
            {row.confession_text}
          </p>
        ) : null}
        <p className="font-control font-bold text-[#F4F0EA] text-2xl md:text-3xl leading-tight mb-8">
          {row?.verdict_text}
        </p>
        <p className="text-muted-foreground/60 text-xs font-mono-light tracking-[0.2em] uppercase">
          {venue ? `As charged at ${venue}` : "Location withheld"}
          {row?.subject_number ? ` · Subject #${row.subject_number}` : ""}
        </p>
      </div>

      <div className="fixed bottom-32 left-0 right-0 flex flex-col items-center gap-3 px-6">
        <p className="text-ritual text-sm font-mono-light tracking-wide text-center">
          Your turn.
        </p>
        <Link to={ctaHref} className="btn-booth text-center">
          ENTER THE BOOTH →
        </Link>
        <a
          href="https://houseofguilty.com/contraband?source=booth-share"
          target="_blank"
          rel="noopener"
          className="text-sm font-mono-light tracking-wide text-[#FF4800] hover:opacity-80 transition-colors"
        >
          THE FIRST OFFENCE — $45 →
        </a>
      </div>

      <BoothFooter />
    </main>
  );
};

export default VerdictShare;
