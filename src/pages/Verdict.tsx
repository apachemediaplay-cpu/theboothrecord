import { useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import guiltyWordmark from "@/assets/Guilty_Wordmark_RGB_Orange.svg";
import { resolveVenueDisplayName, isPhysicalScan, mayStampVenue } from "@/lib/source";
import { logShare, logOffenceTap, resolveShareId, fetchSharedVerdict } from "@/lib/metrics";
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
  // stamp_venue for THIS confession, seeded from what the Edge Function returned (stored by
  // Receiving). FAIL CLOSED: only an explicit true permits stamping — undefined means "not
  // positively confirmed" and suppresses the venue on the POST TO STORY card.
  const [stampVenue, setStampVenue] = useState<boolean | undefined>(
    sessionStorage.getItem("stampVenue") === "true" ? true : undefined,
  );
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

  // Share card "AS CHARGED AT" venue, resolved from the PERSISTED ROW SOURCE only — the
  // ?venue= URL param is never trusted for display. venues.json first (unchanged, no DB
  // call for existing venues), then the active-only venues-table fallback for
  // console-added venues; unknown slug / inactive row / any error → "" → the card
  // renders LOCATION WITHHELD. The venue stamp is decided at POST TO STORY time so the
  // card is rendered once with the correct value — see handleOnRecordConfirm.
  // suppress === true → "" → LOCATION WITHHELD (no lookup at all).
  const rowSource = sessionStorage.getItem("verdictSource") || "";
  const computeFiledVenue = async (suppress: boolean) =>
    (suppress ? "" : await resolveVenueDisplayName(rowSource)).toUpperCase();

  // Feature 2: optional email capture — gated behind ENABLE_EMAIL_CAPTURE, kept for later.
  // (Dormant: confessions are now saved by the Edge Function, which has no email field.)
  const [email, setEmail] = useState("");
  const [claimState, setClaimState] = useState<"idle" | "saving" | "claimed" | "skipped">("idle");

  // ON RECORD share flow (single-tap: the disclosure line is the consent)
  const [sharing, setSharing] = useState(false);

  // True once the user taps EITHER share action. Set on tap, not on success: the Web
  // Share API can't reliably confirm completion and SAVE IMAGE gives no iOS callback.
  // Gates the post-share Instagram reveal; the share block stays visible regardless.
  const [hasShared, setHasShared] = useState(false);

  // This confession's share uuid. Resolved once (owner-gated) and reused by BOTH share
  // paths: SHARE VERDICT sends /v/{uuid} as the link; SAVE IMAGE sends the same /v/{uuid}
  // as the url travelling alongside the PNG. Cached so repeat taps don't re-resolve.
  const [shareId, setShareId] = useState<string | null>(null);

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
    // Reveal the Instagram follow line on tap (see hasShared note).
    setHasShared(true);
    // Share-INTENT metric (fire-and-forget), keyed on the persisted row source.
    logShare(rowSource);
    setSharingLink(true);
    try {
      const id = shareId ?? (await resolveShareId(Number(subjectNumber), verdictResponse));
      if (!id) {
        toast({
          title: "Couldn't create the link",
          description: "Give it a second and try again.",
          variant: "destructive",
        });
        return;
      }
      if (!shareId) setShareId(id);
      const url = `https://theboothrecord.com/v/${id}`;
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: "GUILTY",
          text: url,
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
    // Reveal the Instagram follow line on tap (SAVE IMAGE gives no completion callback).
    setHasShared(true);
    // Share-INTENT metric, keyed on the persisted row source — same as SHARE VERDICT.
    // SAVE IMAGE is a share: Stories are the venue's UGC channel. Previously unlogged,
    // which made share-rate blind to the exact channel the venue pitch is built on.
    logShare(rowSource);
    setSharing(true);
    try {
      // Resolve our own uuid (owner-gated) ONCE. It does two jobs: stamp_venue for the
      // card, and the /v/{uuid} link that travels with the PNG.
      let uuid = shareId;
      if (!uuid && subjectNumber && verdictResponse) {
        uuid = await resolveShareId(Number(subjectNumber), verdictResponse);
        if (uuid) setShareId(uuid);
      }
      // stamp_venue is seeded from the Edge Function response (stored by Receiving), so the
      // card is drawn ONCE with the correct venue and never swaps. This fetch is now only a
      // FALLBACK for a function build that omits the field; it can only ever UNLOCK stamping,
      // never re-suppress. FAIL CLOSED: on any failure suppress stays TRUE → venue withheld.
      let suppress = !mayStampVenue(stampVenue);
      if (stampVenue === undefined && uuid) {
        const row = await fetchSharedVerdict(uuid);
        if (row) {
          setStampVenue(row.stamp_venue);
          suppress = !mayStampVenue(row.stamp_venue);
        }
      }
      const blob = await generateShareCard(await computeFiledVenue(suppress));
      const file = new File([blob], "guilty-on-record.png", { type: "image/png" });

      const canShareFiles =
        typeof navigator !== "undefined" &&
        !!navigator.canShare &&
        navigator.canShare({ files: [file] });

      // The url travels WITH the image. It MUST be /v/{uuid}, not the homepage:
      //   1. VerdictShare's CTA is `/confess?source=<venue>` — so a confession referred by
      //      a shared Story is CREDITED TO THE VENUE. A homepage link lands as `direct`,
      //      silently leaking the venue's own UGC referrals out of its own numbers.
      //   2. The recipient lands on the exact verdict they just saw, not a cold front door.
      // Homepage only as a fallback if the uuid can't be resolved.
      const shareUrl = uuid ? `https://theboothrecord.com/v/${uuid}` : "https://theboothrecord.com";

      if (canShareFiles) {
        await navigator.share({ files: [file], title: "GUILTY", text: shareUrl });
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

  // Action-area type rule: 13px is the FUNCTIONAL tier — anything you can press
  // (SHARE VERDICT, SEE THE GUILTY, and this underlined pair). 11px is the LABEL
  // tier — anything you read ("Your words. Not your name.", FIRST OFFENCE).
  // shareSecondary is the underlined text-link treatment shared by POST TO STORY
  // and (post-share) SHARE AGAIN.
  const shareSecondary =
    "text-[13px] text-foreground/80 underline underline-offset-4 hover:text-foreground transition-colors tracking-wide";
  // SEE THE GUILTY pre-share — quiet exit, one step above the 11px action scale
  // but still muted and boxless so it never competes with the share action
  // (sharing is the perishable one). Post-share it's promoted to the boxed
  // primary instead, at the same 13px.
  const wallLink =
    "text-[13px] text-muted-foreground hover:text-foreground transition-colors tracking-wide";

  return (
    <div className="screen-container animate-fade-in">
      <div className="flex-1 flex flex-col justify-center items-start text-left pb-10">
        {/* System stamp, not a headline — smallest text on the screen. 12px below,
            matching the share page: stamp + confession read as one block. */}
        <p className="text-ritual text-[11px] font-mono-light tracking-[0.2em] mb-3 min-h-[1em] relative">
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

        {/* 32px below the confession — matching the share page, and deliberately
            the WIDEST break in the block: the gap between what a person typed and
            what the machine said. */}
        {confession && (
          <p className="text-muted-foreground text-base md:text-lg font-mono-light leading-relaxed tracking-wide mb-8 max-w-[600px] whitespace-pre-line">
            {confession}
          </p>
        )}

        <div className="font-control text-3xl md:text-4xl font-bold text-foreground mb-6 whitespace-pre-line">
          {verdictResponse}
        </div>
      </div>

      {/* Hairline rule — same treatment as the confess input rule — separating the
          record above (left-aligned) from the actions below (centred). */}
      <div className="shrink-0 w-full border-t border-muted-foreground/40 pt-6 flex flex-col items-center gap-6">
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

        {!hasShared ? (
          /* Pre-share: promise line + SHARE VERDICT (boxed, the perishable action) with
             POST TO STORY beneath. The disclosure line IS the consent. */
          <div className="w-full max-w-xs flex flex-col items-center gap-3">
            <p className="text-ritual text-[11px] font-mono-light tracking-wide text-center">
              Your words. Not your name.
            </p>
            {/* 13px, matching SEE THE GUILTY: the boxed primary should lead on its
                box, border and position, not by having smaller text than the link
                beneath it. 11px was small for a primary action. */}
            <button
              onClick={handleShareLink}
              disabled={sharingLink}
              className="btn-booth text-[13px] disabled:opacity-50"
            >
              {sharingLink ? "FILING…" : "SHARE VERDICT"}
            </button>
            <button onClick={handleOnRecordConfirm} disabled={sharing} className={shareSecondary}>
              {sharing ? "PREPARING…" : "POST TO STORY"}
            </button>
          </div>
        ) : (
          /* Post-share: the wall becomes the boxed primary; the two share actions drop
             to an equal-weight text-link pair (both still fully working for repeat
             shares); FIRST OFFENCE closes the screen. No Instagram, no promise line. */
          <div className="w-full max-w-xs flex flex-col items-center gap-5">
            {verdictResponse !== "Entry withheld" && (
              <button
                onClick={() => handleNavigate("/thewall")}
                className="btn-booth text-[13px]"
              >
                SEE THE GUILTY →
              </button>
            )}
            <div className="flex items-center gap-6">
              <button onClick={handleShareLink} disabled={sharingLink} className={shareSecondary}>
                {sharingLink ? "FILING…" : "SHARE AGAIN"}
              </button>
              <button onClick={handleOnRecordConfirm} disabled={sharing} className={shareSecondary}>
                {sharing ? "PREPARING…" : "POST TO STORY"}
              </button>
            </div>
            {/* Sampler CTA — NOT for in-venue scanners (physical ?venue= card): showing a
                "buy online" link there poaches the host. isPhysicalScan() is false for
                direct / Instagram / share-through, so those do get it. Unlike the shared
                card (VerdictShare), this is gated — that viewer is never in-venue.
                onClick is a fire-and-forget tap metric — never preventDefault,
                never await: the navigation proceeds regardless of the RPC's fate. */}
            {!isPhysicalScan() && (
              <a
                href="https://houseofguilty.com/contraband?source=booth-verdict"
                target="_blank"
                rel="noopener"
                onClick={() => logOffenceTap(rowSource)}
                className="text-[11px] font-mono-light tracking-wide"
              >
                <span className="text-muted-foreground">Reoffend.</span>{" "}
                <span className="offence-glow-text text-[#FF4800] hover:opacity-80 transition-colors">
                  THE FIRST OFFENCE — $55
                </span>
              </a>
            )}
          </div>
        )}

        {/* Pre-share only: the quiet wall exit. One tier up from a footer, never
            competing with SHARE VERDICT — sharing is the PERISHABLE action; once they
            leave for the wall, Confess.tsx's mount reset wipes the card and it can
            never be shared. Post-share the wall is the boxed primary above instead. */}
        {!hasShared && verdictResponse !== "Entry withheld" && (
          <div className="mt-10 flex flex-col items-center">
            <button onClick={() => handleNavigate("/thewall")} className={wallLink}>
              SEE THE GUILTY →
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Verdict;
