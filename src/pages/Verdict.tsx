import { useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import guiltyWordmark from "@/assets/Guilty_Wordmark_RGB_Orange.svg";
import { venueDisplayName } from "@/lib/source";
import { logShare, resolveShareId, fetchSharedVerdict } from "@/lib/metrics";
import { useToast } from "@/hooks/use-toast";

// Feature flag: email capture is temporarily OFF but kept in code so it can be
// switched back on later. NOTE: persistence now happens server-side in the
// generate-verdict Edge Function, which has no email field — re-enabling email
// will require adding email to the function/RPC, not a client-side insert.
const ENABLE_EMAIL_CAPTURE = false;

const Verdict = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [sharingLink, setSharingLink] = useState(false);
  // stamp_venue for THIS confession. undefined until fetched → treated as "show venue"
  // (default/true). Only false suppresses the venue on the SAVE IMAGE card.
  const [stampVenue, setStampVenue] = useState<boolean | undefined>(undefined);
  const [typedText, setTypedText] = useState("");
  const [showCursor, setShowCursor] = useState(true);
  const [isGlitching, setIsGlitching] = useState(false);
  const [glitchOffset, setGlitchOffset] = useState(0);
  const [glitchOffset2, setGlitchOffset2] = useState(0);
  const [glitchTop, setGlitchTop] = useState(30);
  const [glitchTop2, setGlitchTop2] = useState(60);
  const glitchIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const confession = sessionStorage.getItem("confession") || "";
  const verdictResponse = sessionStorage.getItem("verdictResponse") || "";
  const subjectNumber = sessionStorage.getItem("subjectNumber") || "";
  const fullText = "The booth noticed.";

  // Share card "AS CHARGED AT" venue, resolved in priority order by venueDisplayName:
  //   1. an explicit ?venue= captured from the URL (used directly), else
  //   2. the frozen table lookup on the persisted row source, else
  //   3. "" → the card renders LOCATION WITHHELD (never a raw slug).
  // The venue stamp is decided at SAVE IMAGE time (after stamp_venue loads) so the card is
  // rendered once with the correct value — see handleOnRecordConfirm. suppress === true (i.e.
  // stamp_venue === false) → "" → the card's existing LOCATION WITHHELD path.
  const venueName = sessionStorage.getItem("venueName") || "";
  const rowSource = sessionStorage.getItem("verdictSource") || "";
  const computeFiledVenue = (suppress: boolean) =>
    (suppress ? "" : venueDisplayName(venueName, rowSource)).toUpperCase();

  // Feature 2: optional email capture — gated behind ENABLE_EMAIL_CAPTURE, kept for later.
  // (Dormant: confessions are now saved by the Edge Function, which has no email field.)
  const [email, setEmail] = useState("");
  const [claimState, setClaimState] = useState<"idle" | "saving" | "claimed" | "skipped">("idle");

  // ON RECORD share flow (single-tap: the disclosure line is the consent)
  const [sharing, setSharing] = useState(false);

  const handleClaim = () => {
    const value = email.trim();
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    if (!valid) return;
    // TODO: persistence requires email support in the Edge Function/RPC (see note above).
    setClaimState("claimed");
  };

  const handleSkipEmail = () => {
    setClaimState("skipped");
  };

  const triggerGlitch = () => {
    const offset = (Math.random() > 0.5 ? 1 : -1) * (6 + Math.random() * 8);
    const top = 15 + Math.random() * 20;
    const offset2 = -offset * (0.5 + Math.random() * 0.5);
    const top2 = 55 + Math.random() * 25;

    setGlitchOffset(offset);
    setGlitchTop(top);
    setGlitchOffset2(offset2);
    setGlitchTop2(top2);
    setIsGlitching(true);

    const duration = 100 + Math.random() * 80;
    setTimeout(() => setIsGlitching(false), duration);
  };

  useEffect(() => {
    let index = 0;
    const typeInterval = setInterval(() => {
      if (index < fullText.length) {
        setTypedText(fullText.slice(0, index + 1));
        index++;
      } else {
        clearInterval(typeInterval);
        setShowCursor(false);
      }
    }, 60);

    return () => clearInterval(typeInterval);
  }, []);

  // Random glitch interval for the "The booth noticed." line
  useEffect(() => {
    if (typedText.length === fullText.length) {
      const scheduleGlitch = () => {
        const delay = 2000 + Math.random() * 3000;
        glitchIntervalRef.current = setTimeout(() => {
          triggerGlitch();
          scheduleGlitch();
        }, delay);
      };
      scheduleGlitch();
    }

    return () => {
      if (glitchIntervalRef.current) clearTimeout(glitchIntervalRef.current);
    };
  }, [typedText]);

  const handleNavigate = (path: string) => {
    navigate(path);
  };

  const handleConfessAgain = () => {
    sessionStorage.removeItem("confession");
    sessionStorage.removeItem("subjectNumber");
    sessionStorage.removeItem("verdictSource");
    sessionStorage.removeItem("venueName");
    navigate("/return");
  };

  // --- ON RECORD share card generation (1080×1920 PNG) ---

  const loadImage = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });

  const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  };

  const generateShareCard = async (filedVenue: string): Promise<Blob> => {
    const W = 1080;
    const H = 1920;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");

    // Make sure custom fonts are ready before drawing.
    try {
      await document.fonts.ready;
      await Promise.all([
        document.fonts.load("300 42px 'Söhne Mono'"),
        document.fonts.load("400 28px 'Söhne Mono'"),
        document.fonts.load("700 70px 'Control Upright'"),
      ]);
    } catch {
      /* fall back to whatever is available */
    }

    const setLS = (v: string) => {
      try {
        (ctx as unknown as { letterSpacing: string }).letterSpacing = v;
      } catch {
        /* letterSpacing unsupported — ignore */
      }
    };

    const pad = 110;
    const maxW = W - pad * 2;

    // Background
    ctx.fillStyle = "#171513";
    ctx.fillRect(0, 0, W, H);

    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";

    // Reuse the verdict screen's CSS tokens so the card matches (no hardcoded hex):
    // --ritual-green is what .text-ritual uses; --muted-foreground is the on-screen grey.
    const root = getComputedStyle(document.documentElement);
    const ritualGreen = `hsl(${root.getPropertyValue("--ritual-green").trim()})`;
    const mutedGrey = `hsl(${root.getPropertyValue("--muted-foreground").trim()})`;

    // Label — same green as the screen's "The booth noticed."
    setLS("6px");
    ctx.fillStyle = ritualGreen;
    ctx.font = "400 26px 'Söhne Mono', monospace";
    ctx.fillText("THE BOOTH NOTICED.", pad, 210);
    setLS("0px");

    // Confession — same grey as on screen, light weight (sits below the verdict).
    ctx.fillStyle = mutedGrey;
    ctx.font = "300 42px 'Söhne Mono', monospace";
    const confession = sessionStorage.getItem("confession") || "";
    let y = 300;
    const cLH = 58;
    for (const ln of wrapText(ctx, confession, maxW)) {
      ctx.fillText(ln, pad, y);
      y += cLH;
    }

    // Verdict
    y += 80;
    ctx.fillStyle = "#F4F0EA";
    ctx.font = "700 70px 'Control Upright', sans-serif";
    const vLH = 84;
    for (const ln of wrapText(ctx, verdictResponse, maxW)) {
      ctx.fillText(ln, pad, y);
      y += vLH;
    }

    // ── Lower composition: TWO GROUPS ──
    // Group 1 (centred): GUILTY wordmark + AS CHARGED stamp, centred in the space below
    //   the verdict so the larger wordmark breathes.
    // Group 2 (footer, pinned to the bottom): SUBJECT # + @houseofguilty.
    const img = await loadImage(guiltyWordmark);
    const stampW = 560;
    const ratio = img.height && img.width ? img.height / img.width : 335.5 / 1000;
    const stampH = stampW * ratio;

    const gapStampToCharge = 64;
    const chargeLH = 44;
    const groupH = stampH + gapStampToCharge + chargeLH; // wordmark + AS CHARGED (2 lines)

    // Centre group 1 between the verdict and the pinned footer.
    const regionTop = y + 70;
    const regionBottom = H - 220; // leave room for the bottom-pinned footer
    const stampTopY = regionTop + Math.max(0, (regionBottom - regionTop - groupH) / 2);

    const cx = W / 2;
    const cy = stampTopY + stampH / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((-10 * Math.PI) / 180);
    ctx.drawImage(img, -stampW / 2, -stampH / 2, stampW, stampH);
    ctx.restore();

    ctx.textAlign = "center";

    // AS CHARGED — two lines, directly under the wordmark (group 1).
    //   line 1: "AS CHARGED" · line 2: "AT <VENUE>" or "LOCATION WITHHELD".
    const chargeLine1 = "AS CHARGED";
    const chargeLine2 = filedVenue ? `AT ${filedVenue}` : "LOCATION WITHHELD";
    const charge1Y = stampTopY + stampH + gapStampToCharge;
    setLS("6px");
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "400 30px 'Söhne Mono', monospace";
    ctx.fillText(chargeLine1, cx, charge1Y);
    ctx.fillText(chargeLine2, cx, charge1Y + chargeLH);
    setLS("0px");

    // Group 2 — footer pinned to the bottom: SUBJECT # then @houseofguilty.
    if (subjectNumber) {
      setLS("4px");
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.font = "400 24px 'Söhne Mono', monospace";
      ctx.fillText(`SUBJECT #${subjectNumber}`, cx, H - 170);
      setLS("0px");
    }

    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "400 28px 'Söhne Mono', monospace";
    ctx.fillText("@houseofguilty", cx, H - 110);
    ctx.textAlign = "left";

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Failed to render image"))),
        "image/png"
      );
    });
  };

  // PRIMARY share: resolve this confession's uuid (owner-gated) and share the single
  // /v/{uuid} link. The link's server-rendered preview carries the verdict + card image —
  // no separate text or attached file. Keep the PNG path (below) as the secondary option.
  const handleShareLink = async () => {
    // Share-INTENT metric (fire-and-forget), keyed on the persisted row source.
    logShare(rowSource);
    setSharingLink(true);
    try {
      const id = await resolveShareId(Number(subjectNumber), verdictResponse);
      if (!id) {
        toast({
          title: "Couldn't create the link",
          description: "Give it a second and try again.",
          variant: "destructive",
        });
        return;
      }
      const url = `https://theboothrecord.com/v/${id}`;
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: "GUILTY",
          text: "You've been summoned. You know what you did.",
          url,
        });
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        toast({ title: "Link copied", description: "Paste it anywhere." });
      }
    } catch {
      // User dismissed the native share sheet — no-op.
    } finally {
      setSharingLink(false);
    }
  };

  // SECONDARY "Save image": the client-rendered PNG, for Stories (which don't unfurl links).
  const handleOnRecordConfirm = async () => {
    setSharing(true);
    try {
      // Load stamp_venue BEFORE rendering, so the card is drawn ONCE with the correct venue
      // (it never shows the venue and then swaps). The Edge Function response doesn't include
      // it, so resolve our own uuid (owner-gated) then read the row. Cached in state for
      // repeat taps; on any failure suppress stays false → the venue shows as normal.
      let suppress = stampVenue === false;
      if (stampVenue === undefined && subjectNumber && verdictResponse) {
        const uuid = await resolveShareId(Number(subjectNumber), verdictResponse);
        const row = uuid ? await fetchSharedVerdict(uuid) : null;
        if (row) {
          setStampVenue(row.stamp_venue);
          suppress = row.stamp_venue === false;
        }
      }
      const blob = await generateShareCard(computeFiledVenue(suppress));
      const file = new File([blob], "guilty-on-record.png", { type: "image/png" });

      const canShareFiles =
        typeof navigator !== "undefined" &&
        !!navigator.canShare &&
        navigator.canShare({ files: [file] });

      if (canShareFiles) {
        await navigator.share({ files: [file], title: "GUILTY", text: "You've been summoned. You know what you did.", url: "https://theboothrecord.com" });
      } else {
        // Desktop fallback: download the PNG.
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "guilty-on-record.png";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
    } catch {
      // User cancelled the share sheet, or generation failed.
    } finally {
      setSharing(false);
    }
  };

  const secondaryLink =
    "text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors tracking-wide";

  return (
    <div className="screen-container animate-fade-in">
      <div className="flex-1 flex flex-col justify-center items-start text-left pb-48">
        <p className="text-ritual text-xl font-mono-light tracking-wide mb-6 min-h-[1.75rem] relative">
          <span className="relative inline-block">
            {typedText}
            {showCursor && <span className="animate-pulse">|</span>}
            {/* Glitch slice overlays */}
            {isGlitching && typedText && (
              <>
                <span
                  aria-hidden="true"
                  className="absolute left-0 text-ritual"
                  style={{
                    top: 0,
                    transform: `translateX(${glitchOffset}px)`,
                    clipPath: `inset(${glitchTop}% 0 ${100 - glitchTop - 20}% 0)`,
                    textShadow: '2px 0 #ff0000, -2px 0 #00ffff',
                  }}
                >
                  {typedText}
                </span>
                <span
                  aria-hidden="true"
                  className="absolute left-0 text-ritual"
                  style={{
                    top: 0,
                    transform: `translateX(${glitchOffset2}px)`,
                    clipPath: `inset(${glitchTop2}% 0 ${100 - glitchTop2 - 15}% 0)`,
                    textShadow: '-2px 0 #ff0000, 2px 0 #00ffff',
                  }}
                >
                  {typedText}
                </span>
              </>
            )}
          </span>
        </p>

        {confession && (
          <p className="text-muted-foreground text-base md:text-lg font-mono-light leading-relaxed tracking-wide mb-5 max-w-[600px] whitespace-pre-line">
            {confession}
          </p>
        )}

        <div className="font-control text-3xl md:text-4xl font-bold text-foreground mb-6 whitespace-pre-line">
          {verdictResponse}
        </div>
      </div>

      <div className="fixed bottom-20 left-0 right-0 px-6 flex flex-col items-center gap-6">
        {/* Feature 2 — email capture (currently gated OFF via ENABLE_EMAIL_CAPTURE) */}
        {ENABLE_EMAIL_CAPTURE &&
          (claimState === "claimed" ? (
            <p className="text-ritual text-sm font-mono-light tracking-wide text-center max-w-xs">
              Your case is on file. The booth knows where to find you.
            </p>
          ) : claimState !== "skipped" ? (
            <div className="w-full max-w-xs flex flex-col items-center gap-3">
              <p className="text-muted-foreground text-xs font-mono-light tracking-wide text-center">
                Claim your case. Leave a way to be reached.
              </p>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleClaim();
                }}
                placeholder="your@email.com"
                className="w-full bg-transparent border-b border-border/40 text-center text-ritual text-base font-mono-light tracking-wide py-1 outline-none focus:border-ritual/60 transition-colors"
              />
              <div className="flex items-center gap-6">
                <button
                  onClick={handleClaim}
                  disabled={claimState === "saving"}
                  className="text-sm text-foreground underline underline-offset-4 hover:text-ritual transition-colors tracking-wide disabled:opacity-50"
                >
                  {claimState === "saving" ? "FILING…" : "CLAIM YOUR CASE"}
                </button>
                <button
                  onClick={handleSkipEmail}
                  className="text-sm text-muted-foreground/60 hover:text-muted-foreground transition-colors tracking-wide"
                >
                  NOT NOW
                </button>
              </div>
            </div>
          ) : null)}

        {/* Primary action: ON RECORD — single tap shares the /v/{uuid} link, whose preview
            carries the verdict card. The disclosure line above IS the consent. */}
        <div className="w-full max-w-xs flex flex-col items-center gap-3">
          <p className="text-ritual text-sm font-mono-light tracking-wide text-center">
            Your words. Not your name.
          </p>
          <button
            onClick={handleShareLink}
            disabled={sharingLink}
            className="btn-booth disabled:opacity-50"
          >
            {sharingLink ? "FILING…" : "ON RECORD"}
          </button>
        </div>

        {/* Demoted secondary actions */}
        <button onClick={handleOnRecordConfirm} disabled={sharing} className={secondaryLink}>
          {sharing ? "SAVING…" : "SAVE IMAGE"}
        </button>
        <button onClick={handleConfessAgain} className={secondaryLink}>
          CONFESS AGAIN
        </button>
        {verdictResponse !== "Entry withheld" && (
          <button onClick={() => handleNavigate("/thewall")} className={secondaryLink}>
            THE PUBLIC RECORD
          </button>
        )}
      </div>
    </div>
  );
};

export default Verdict;
