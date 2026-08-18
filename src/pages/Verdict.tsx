import { useNavigate } from "react-router-dom";
import { useWakeLock } from "@/hooks/useWakeLock";
import { useKioskTimeout, KioskIdleLine, KioskStaffReset } from "@/hooks/useKioskTimeout";
import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import StoryPhotoCrop from "@/components/StoryPhotoCrop";
import { renderShareCard } from "@/lib/shareCard";
import {
  resolveVenueDisplayName,
  mayStampVenue,
  isKioskSession,
  isPhysicalScan,
  kioskHandoffUrl,
} from "@/lib/source";
import { beginShareResolve, endShareResolve } from "@/lib/reset";
import {
  logShare,
  logBoothEvent,
  resolveShareId,
  fetchSharedVerdict,
} from "@/lib/metrics";
import { useToast } from "@/hooks/use-toast";

// Feature flag: email capture is temporarily OFF but kept in code so it can be
// switched back on later. NOTE: persistence now happens server-side in the
// generate-verdict Edge Function, which has no email field — re-enabling email
// will require adding email to the function/RPC, not a client-side insert.
const ENABLE_EMAIL_CAPTURE = false;


const Verdict = () => {
  const navigate = useNavigate();
  // Hold the screen awake on this flow screen (released on unmount / absent
  // API / refusal are all silent) — see useWakeLock.
  useWakeLock();
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

  // ── KIOSK. Read once at mount; every kiosk branch below gates on this and
  // nothing else, so a phone's Verdict screen is untouched.
  const [kiosk] = useState(() => isKioskSession());
  // The handoff QR: resolving → resolved → failed. On the booth the uuid is
  // resolved ON MOUNT rather than on tap, because there is no tap — the QR IS
  // the action, and it has to be on screen by the time they look up.
  const [qr, setQr] = useState<
    { state: "resolving" } | { state: "ready"; dataUrl: string } | { state: "failed" }
  >({ state: "resolving" });
  // Idle reset: 90s here against /confess's 60. Longer than the writing screen
  // on purpose — this is where someone reads the verdict, decides whether they
  // like it, gets their phone out and lines up the QR. 40s cut people off
  // mid-scan; the screen is only "abandoned" once it has sat far past that.
  const idleLeft = useKioskTimeout(90, "verdict");

  // ── POST TO STORY photo step. STATE, not a route, deliberately: the flow's
  // core input is a decoded image held in memory — it can't cross a route
  // boundary without persisting it somewhere, and this feature's contract is
  // that the photo NEVER leaves the device (no upload, no storage, no
  // moderation — nothing but this component's memory and the PNG handed to
  // the share sheet). A route would also be deep-linkable into a state with
  // no verdict behind it. The step sits ON THE PATH of POST TO STORY rather
  // than as a side button: options nobody finds are worth nothing, and the
  // venue benefit (their room in a stranger's story) depends on uptake.
  const [story, setStory] = useState<
    | { step: "choose" }
    | { step: "crop"; img: HTMLImageElement }
    | { step: "preview"; blob: Blob; url: string }
    | null
  >(null);
  // Object URL for the picked photo + the uuid resolved when the card was
  // rendered (the preview share needs it for the travelling /v/ link).
  const storyPhotoUrl = useRef<string | null>(null);
  const storyUuid = useRef<string | null>(null);

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

  // ── KIOSK QR: resolve on mount, draw once. Reuses resolveShareId — the SAME
  // owner-gated resolver both share paths use; there is deliberately no second
  // resolver, because a second one would be a second definition of who owns a
  // confession. The window is marked so an idle reset can't rotate the session
  // id mid-lookup (see lib/reset).
  useEffect(() => {
    if (!kiosk) return;
    if (!subjectNumber || !verdictResponse || verdictResponse === "Entry withheld") {
      setQr({ state: "failed" });
      return;
    }
    let cancelled = false;
    beginShareResolve();
    (async () => {
      try {
        const id = shareId ?? (await resolveShareId(Number(subjectNumber), verdictResponse));
        if (cancelled) return;
        if (!id) {
          setQr({ state: "failed" });
          return;
        }
        if (!shareId) setShareId(id);
        // ?k= carries the offer key VerdictShare looks up, and tags the scan as
        // a kiosk handoff. One definition, shared with the round strip's QRs.
        const url = kioskHandoffUrl(id);
        // BLACK ON WHITE, not the booth's green on its own background. The
        // green version was palette-first and it cost scans: a phone camera in
        // a dark room is working at the edge of its exposure, and maximum
        // contrast is the only thing that makes the first attempt land. The
        // white field IS the card — margin is in MODULES, and 3 lands the
        // quiet zone at ~7% of the image on every side, which is what lets a
        // scanner find the finder patterns against a dark screen. (The ISO
        // recommendation is 4 modules, ~9%; 3 is the briefed 7%.)
        //
        // sRGB, EXPLICITLY: the canvas colour space is set before qrcode takes
        // its own context, so the exported PNG is tagged. An untagged data URL
        // is interpreted as Display P3 on iPhone — which is why the old green
        // read yellow on the booth's own hardware. Black and white are
        // colour-space-proof anyway; the tag keeps it that way if the palette
        // ever comes back.
        const qrCanvas = document.createElement("canvas");
        qrCanvas.getContext("2d", { colorSpace: "srgb" });
        await QRCode.toCanvas(qrCanvas, url, {
          width: 640, // rendered at 2x the on-screen cap — crisp on the tablet
          margin: 3,
          errorCorrectionLevel: "M",
          color: { dark: "#000000", light: "#FFFFFF" },
        });
        const dataUrl = qrCanvas.toDataURL("image/png");
        if (cancelled) return;
        setQr({ state: "ready", dataUrl });
        // Fired on RENDER, not on resolve: a QR nobody could see was never a
        // handoff.
        logBoothEvent("kiosk_qr", rowSource);
      } catch {
        if (!cancelled) setQr({ state: "failed" });
      } finally {
        endShareResolve();
      }
    })();
    return () => {
      cancelled = true;
    };
    // Mount-only: the verdict for this session never changes under the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kiosk]);

  const handleNavigate = (path: string) => {
    navigate(path);
  };

  // CONFESS AGAIN — quiet link in BOTH states: a missed verdict never gets
  // shared, so a post-share-only link would be unreachable by the people most
  // likely to want a re-roll. Plain navigate: NO sessionStorage clear here (the
  // clear lives in Confess.tsx's handleSubmit and NOWHERE else — the mount-clear
  // bug recorded there destroyed unshared verdicts) and NO prefill (that's the
  // timeout-recovery route, where the machine lost their words; here they're
  // choosing to write a new one).
  const handleConfessAgain = () => {
    logBoothEvent("confess_again", rowSource);
    navigate("/confess");
  };


  // TWO RENDERERS, ONE CARD: this canvas renderer (POST TO STORY, drawn
  // client-side) and functions/src/card.mjs (the /v/ link's OG image, rendered
  // server-side) draw the same card independently — a change to one needs the
  // same change in the other, or they drift. They have drifted twice already
  // (footer handle, both times). The footers are now ALIGNED — handle over
  // theboothrecord.com, one step dimmer — and must stay so: this card is the
  // MORE untappable of the two (it lands in an Instagram Story with no link,
  // no preview, no way to act on it — the address is the only route back;
  // the OG card at least sits on a link someone has already tapped).
  // Aligned means CONTENT AND TREATMENT, not position: this footer rides
  // ~160px higher than the OG card's, clear of Instagram's bottom-250px
  // story safe zone (see the footer note below). The OG card is a link
  // preview with no safe zone — do not raise it to match.
  // photo: an optional pre-cropped 1080×1920 canvas (StoryPhotoCrop's output —
  // the user's own picture, which NEVER leaves the device: it exists only in
  // memory here and in the PNG the share sheet hands off). With a photo the
  // card is a different composition (photo → wash → stamp group → plate);
  // without one, the code below the branch runs UNCHANGED — skipping the
  // photo step produces exactly the card that existed before this feature.

  // PRIMARY share: resolve this confession's uuid (owner-gated) and share the single
  // /v/{uuid} link. The link's server-rendered preview carries the verdict + card image —
  // no separate text or attached file. Keep the PNG path (below) as the secondary option.
  const handleShareLink = async () => {
    // Reveal the Instagram follow line on tap (see hasShared note).
    setHasShared(true);
    // Share-INTENT metric (fire-and-forget), keyed on the persisted row source.
    // logShare keeps share_events as the unbroken historical series; the
    // booth_events share_link row alongside it records WHICH share this was —
    // the tappable /v/ link, as opposed to the dead-end card.
    logShare(rowSource);
    logBoothEvent("share_link", rowSource);
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
  // POST TO STORY now opens the PHOTO STEP first (see the story state note);
  // the pieces of the old single-tap handler live on below: resolveCardContext
  // (uuid + stamp gating + venue), generateShareCard, and shareStoryBlob (the
  // share sheet / download). Skip runs them back-to-back — exactly the old
  // handler — so skipping produces the card that existed before this feature.
  const handlePostToStory = () => setStory({ step: "choose" });

  // The card's inputs, gathered from THIS session. Everything the renderer used
  // to read out of sessionStorage itself now arrives here, which is the whole
  // point of the extraction: /v/:id will build the same record from a DB row.
  // Read at call time, exactly as the renderer read them at draw time — the
  // values, and therefore the PNG, are identical.
  const cardRecord = (filedVenue: string) => ({
    confession: sessionStorage.getItem("confession") || "",
    verdict: verdictResponse,
    subjectNumber,
    filedVenue,
    filedAt: Number(sessionStorage.getItem("filedAt")),
  });

  // Resolve our own uuid (owner-gated) ONCE. It does two jobs: stamp_venue for the
  // card, and the /v/{uuid} link that travels with the PNG.
  const resolveCardContext = async (): Promise<{ uuid: string | null; filedVenue: string }> => {
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
    // AND NOT IN THE ROOM. "AS CHARGED AT X" is a claim about where something
    // happened, and a session that arrived by ?source= alone was never at X:
    // YOUR TURN on a shared card, an Instagram link, any inbound that carries
    // attribution but not a printed card. isPhysicalScan() is exactly that
    // distinction and has been recorded per row since the physical-flag
    // migration — this is the first thing to read it. Applied HERE, after the
    // fallback block above, because that block reassigns `suppress` from the
    // refetched row and would overwrite it.
    // SOURCE IS UNTOUCHED: the venue still gets the scan, the share, the
    // confession and the next YOUR TURN. It just stops getting the stamp.
    // (The row-level half of this lives in tag_confession — /v/:id and the OG
    // image read stamp_venue off the row, not this session.)
    return { uuid, filedVenue: await computeFiledVenue(suppress || !isPhysicalScan()) };
  };

  // The actual handoff to the share sheet (or the desktop download fallback).
  // Share-INTENT metrics moved here from the POST TO STORY tap: with the photo
  // step in between, the tap only opens a chooser — the honest intent moment
  // is when the sheet opens. logShare keeps the historical series; share_card
  // alongside it records this was the PNG card (not tappable), splitting
  // reach-with-a-path from reach without.
  const shareStoryBlob = async (blob: Blob, uuid: string | null) => {
    // Reveal the Instagram follow line on tap (SAVE IMAGE gives no completion callback).
    setHasShared(true);
    logShare(rowSource);
    logBoothEvent("share_card", rowSource);
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
  };

  // Close the photo flow and release every object URL it holds. The photo
  // lives ONLY behind these URLs and the in-memory canvases — nothing is
  // uploaded, stored, or sent anywhere, so closing the flow is the end of it.
  const closeStory = () => {
    if (storyPhotoUrl.current) {
      URL.revokeObjectURL(storyPhotoUrl.current);
      storyPhotoUrl.current = null;
    }
    setStory((s) => {
      if (s?.step === "preview") URL.revokeObjectURL(s.url);
      return null;
    });
  };

  // skip → the old single-tap path, unchanged card, then out.
  const skipPhoto = async () => {
    setSharing(true);
    try {
      const { uuid, filedVenue } = await resolveCardContext();
      const blob = await renderShareCard(cardRecord(filedVenue));
      await shareStoryBlob(blob, uuid);
    } catch {
      // User cancelled the share sheet, or generation failed.
    } finally {
      setSharing(false);
      closeStory();
    }
  };

  // A photo was picked (camera or library input) — decode it and move to crop.
  const onStoryFile = async (f: File | null | undefined) => {
    if (!f) return;
    try {
      const url = URL.createObjectURL(f);
      const img = new Image();
      // onload/onerror rather than img.decode(): decode() can stall on
      // detached images in some engines. Listeners attach BEFORE src so a
      // cached load can't slip past them.
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("unreadable image"));
        img.src = url;
      });
      if (storyPhotoUrl.current) URL.revokeObjectURL(storyPhotoUrl.current);
      storyPhotoUrl.current = url;
      setStory({ step: "crop", img });
    } catch {
      toast({
        title: "Couldn't read that photo",
        description: "Try another one.",
        variant: "destructive",
      });
    }
  };

  // Crop confirmed → render the full card once and show it (RETAKE replaces
  // any framing guide: they judge the result rather than imagining it).
  const onCropDone = async (photoCanvas: HTMLCanvasElement) => {
    setSharing(true);
    try {
      const { uuid, filedVenue } = await resolveCardContext();
      storyUuid.current = uuid;
      const blob = await renderShareCard(cardRecord(filedVenue), photoCanvas);
      setStory((s) => {
        if (s?.step === "preview") URL.revokeObjectURL(s.url);
        return { step: "preview", blob, url: URL.createObjectURL(blob) };
      });
    } catch {
      toast({
        title: "Couldn't build the card",
        description: "Give it a second and try again.",
        variant: "destructive",
      });
    } finally {
      setSharing(false);
    }
  };

  const shareStoryPreview = async (blob: Blob) => {
    setSharing(true);
    try {
      await shareStoryBlob(blob, storyUuid.current);
    } catch {
      // User cancelled the share sheet — stay on the preview so they can retry.
      return;
    } finally {
      setSharing(false);
    }
    closeStory();
  };

  // Action-area type rule: 13px is the FUNCTIONAL tier — anything you can press
  // (SHARE VERDICT, SEE THE RECORD, and this underlined pair). 11px is the LABEL
  // tier — anything you read ("Your words. Not your name.", FIRST OFFENCE).
  // shareSecondary is the underlined text-link treatment shared by POST TO STORY
  // and (post-share) SHARE AGAIN.
  const shareSecondary =
    "type-action text-foreground/80 underline underline-offset-4 hover:text-foreground transition-colors tracking-wide";
  // SEE THE RECORD pre-share — quiet exit, one step above the 11px action scale
  // but still muted and boxless so it never competes with the share action
  // (sharing is the perishable one). Post-share it's promoted to the boxed
  // primary instead, at the same 13px.
  const wallLink =
    "type-action text-muted-foreground hover:text-foreground transition-colors tracking-wide";

  return (
    // KIOSK CENTRING: screen-container's pb-32 exists to clear the phone's
    // fixed action block, which the booth doesn't have — on a tablet it left
    // the record 306px from the top and 128px from the bottom, off-centre and
    // sitting low. In kiosk the bottom padding drops to match the top and the
    // container centres its children as one block instead of letting the
    // content stretch. min-h (not h) keeps it safe on a phone: taller content
    // just grows the container and the page scrolls, never clipping the top.
    <div className={`screen-container animate-fade-in${kiosk ? " pb-8 justify-center" : ""}`}>
      {/* pb-8 in kiosk: with the action wrapper's pt-6 also dropped below, the
          verdict-to-SUBJECT # gap lands at 56px (24 from the verdict's own mb-6
          + 32 here). It was 88 — the record and the handoff read as two
          unrelated screens stacked on one. */}
      <div
        className={`${kiosk ? "" : "flex-1 "}flex flex-col justify-center items-start text-left ${
          kiosk ? "pb-8" : "pb-10"
        }`}
      >
        {/* System stamp, not a headline — smallest text on the screen. 12px below,
            matching the share page: stamp + confession read as one block. */}
        <p className="text-ritual type-filing font-mono-light tracking-[0.2em] mb-3 min-h-[1em] relative">
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
          <p className="text-muted-foreground type-confession font-mono-light leading-relaxed tracking-wide mb-8 max-w-[600px] whitespace-pre-line">
            {confession}
          </p>
        )}

        <div className="font-control type-verdict font-bold text-foreground mb-6 whitespace-pre-line">
          {verdictResponse}
        </div>
      </div>

      {/* NO divider rule above this block — REMOVED, deliberately, from all three
          static verdict screens (both states here + VerdictShare found). This
          page doesn't scroll: three signals already separate the record from
          the actions — the large gap, the switch from Control to mono, and
          the change from left-aligned record to centred actions — and a
          fourth saying the same thing was furniture. The wall's rule STAYS:
          there it marks where a scrolling feed meets a pinned bar, a real
          boundary — don't remove that one for consistency. The pt-6 is kept:
          it was always the breathing room; the rule only underlined it. */}
      <div
        className={`shrink-0 w-full ${kiosk ? "pt-0" : "pt-6"} flex flex-col items-center gap-6`}
      >
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

        {kiosk ? (
          /* ── KIOSK HANDOFF. The booth's device replaces every action with one
             QR: SHARE VERDICT, POST TO STORY, CONFESS AGAIN and SEE THE RECORD
             are all phone actions — they'd hand the venue's hardware to a
             stranger, open the booth's own camera, or walk the booth away from
             the gate. The QR is the only way the record leaves the room.
             All three states reserve the SAME height, so the screen never
             jumps between resolving and resolved — on a booth the movement is
             the only thing anyone would notice. */
          /* NO max-w-xs on this group: the QR below is sized as a PERCENTAGE
             OF THE COLUMN, and a 320px cap here would have quietly made it a
             percentage of 320 instead of the ~400px the record is set in.
             gap-[18px] = the spacing inside the group, the reveal card's own
             rhythm; the 56px above it comes off the record block's own padding
             (see the content div's pb). */
          <div className="w-full flex flex-col items-center gap-[18px]">
            {/* CONFESSOR #N — kiosk only, between the verdict and the QR, and
                now in the SAME treatment as the line below the code and as
                CONFESSOR N on the reveal card: this is a pair that brackets a
                code in a dark room, not a footnote on a document. It was the
                11px filing tier, which was the right call while the line under
                the code was 11px too; with that line at 22px the small one read
                as leftover rather than as the other half of anything.
                It keeps the NUMBER because this is the only place a person sees
                their filing reference — it is what they look for on the wall,
                where records are labelled "#1121". The # is also what separates
                it from the reveal card's CONFESSOR N, which counts people in a
                round rather than records in the register. */}
            {subjectNumber ? (
              <p className="venue-glow-text type-handoff font-mono-light tracking-[0.18em] uppercase">
                Confessor #{subjectNumber}
              </p>
            ) : null}
            {/* 55% OF THE COLUMN. min(40vw, 320px) was pinned at 320px on every
                tablet — 80% of a 400px column, which made the code the largest
                object on a screen whose subject is a sentence. A percentage of
                the column lands the same proportion on both devices (220px on
                the booth, 180px on a phone, where it GROWS from 46%). Height
                from aspect-ratio, not a percentage: a percentage height would
                resolve against an auto-height parent. All three states reserve
                identical space, so nothing jumps as the code resolves. */}
            <div
              className="flex items-center justify-center"
              style={{ width: "clamp(180px, 34vw, 400px)", aspectRatio: "1 / 1" }}
            >
              {qr.state === "ready" ? (
                <img
                  src={qr.dataUrl}
                  alt="Scan to open this verdict"
                  style={{ width: "100%", height: "100%" }}
                />
              ) : (
                <p className="max-w-xs text-muted-foreground/60 text-[13px] font-mono-light tracking-wide text-center">
                  {qr.state === "resolving"
                    ? "FILING…"
                    : /* Failed: a FLAT TECHNICAL line and nothing else. No
                         toast, no retry — a retry button on a booth is a
                         button the next person inherits. The copy is
                         deliberately mechanical: the earlier "This one stays
                         in the booth." read as a judgment on the confession
                         and sat too close to Blocked's "This one stays off the
                         record." A failed uuid lookup is a broken link, not a
                         verdict, and pointing at a human is the only useful
                         thing the screen can do. */
                      "Couldn't make the link. Ask at the bar."}
                </p>
              )}
            </div>
            {/* BELOW the code, not above it: the line describes the code, and
                sitting under SUBJECT #N it read as an instruction about the
                number — the one thing on this screen you can't take with you.
                IDENTICAL TO THE REVEAL CARD'S (see RoundReveal): same room,
                same light, same job — notice the code and take it. It was
                11.5px lowercase grey here and 22px uppercase State Blue two
                screens away, which made the solo booth quieter than the group
                one for no reason anybody in the room could have named. The
                earlier argument for lowercase — that Söhne Mono is the app's
                human voice and caps read as signage — loses to the room: this
                IS signage, read at table distance in the dark, and it is the
                last thing standing between a verdict and the phone that
                carries it out.
                SUBJECT #N above the code KEEPS the filing tier: it is a
                reference number, not an instruction, and it is not the same
                object as the reveal card's CONFESSOR N. */}
            <p className="venue-glow-text type-handoff font-mono-light tracking-[0.18em] uppercase">
              Take it with you
            </p>
          </div>
        ) : (
          <>
        {!hasShared ? (
          /* Pre-share: promise line + SHARE VERDICT (boxed, the perishable action) with
             POST TO STORY beneath. The disclosure line IS the consent. */
          <div className="w-full max-w-xs flex flex-col items-center gap-3">
            {/* Grey caption, NOT green: green marks live and machine things (the
                listening dot, the stamp, the placeholder, primary actions) — a
                caption is neither. Same slot and job as "Reoffend." post-share. */}
            <p className="text-muted-foreground text-[11px] font-mono-light tracking-wide text-center">
              Your words. Not your name.
            </p>
            {/* THE PRIMARY-ACTION RULE (see index.css): glowing label, 1px grey
                hairline (muted-foreground/40, the divider's own rule),
                transparent — the glow is the only colour in the box. */}
            <button
              onClick={handleShareLink}
              disabled={sharingLink}
              className="btn-booth border border-muted-foreground/40 bg-transparent type-action hover:bg-transparent disabled:opacity-50"
            >
              <span className="enter-glow-text text-[hsl(var(--ritual-green))]">
                {sharingLink ? "FILING…" : "SHARE VERDICT"}
              </span>
            </button>
            <div className="flex items-center gap-6">
              <button onClick={handlePostToStory} disabled={sharing} className={shareSecondary}>
                {sharing ? "PREPARING…" : "POST TO STORY"}
              </button>
              <button onClick={handleConfessAgain} className={shareSecondary}>
                CONFESS AGAIN
              </button>
            </div>
          </div>
        ) : (
          /* Post-share: CONFESS AGAIN is the boxed primary — the sharing job is
             done, so the box holds the next confession. The share actions drop
             to an equal-weight text-link row (still fully working for repeat
             shares); SEE THE RECORD closes the screen as a quiet link.
             Pre-share hierarchy is deliberately unchanged: SHARE VERDICT keeps
             the box there — sharing is the growth loop.
             THE PURCHASE BLOCK IS GONE — DELIBERATE: "Reoffend." and THE FIRST
             OFFENCE — $55 were removed here, and this was the LAST purchase
             link in the app. There is now no route from the Booth to the shop
             on any screen. (offence_events and log_offence_tap stay in the
             database; nothing writes to them any more.) */
          <div className="w-full max-w-xs flex flex-col items-center gap-5">
            {/* Caption marks the STATE, not the action: pre- and post-share now
                differ only by which action sits in the box, and an empty
                caption slot made the flip easy to miss (the orange buy box
                used to make it unmissable). KNOWN LIMITATION, accepted:
                hasShared flips when SHARE VERDICT is TAPPED, not when the
                share completes — the share sheet doesn't reliably report
                completion — so someone who taps then cancels sees a line
                asserting something that didn't happen. The alternative is no
                confirmation at all. Do NOT write copy that leans harder on
                the claim. */}
            <p className="text-muted-foreground text-[11px] font-mono-light tracking-wide text-center">
              It's out there now.
            </p>
            {/* THE PRIMARY-ACTION RULE (see index.css): glowing label, 1px grey
                hairline, transparent. The caption above frames the STATE (see
                its note), not this action — CONFESS AGAIN still says what it
                does. Same handler and confess_again logging as the old link. */}
            <button
              onClick={handleConfessAgain}
              className="btn-booth border border-muted-foreground/40 bg-transparent type-action-14 text-center hover:bg-transparent"
            >
              <span className="enter-glow-text text-[hsl(var(--ritual-green))]">
                CONFESS AGAIN
              </span>
            </button>
            {/* Link row: POST TO STORY · SHARE VERDICT — with CONFESS AGAIN
                promoted to the box, SHARE VERDICT drops to the row on the same
                handler the pre-share box uses (repeat shares keep working). */}
            <div className="flex items-center gap-6">
              <button onClick={handlePostToStory} disabled={sharing} className={shareSecondary}>
                {sharing ? "PREPARING…" : "POST TO STORY"}
              </button>
              <button onClick={handleShareLink} disabled={sharingLink} className={shareSecondary}>
                {sharingLink ? "FILING…" : "SHARE VERDICT"}
              </button>
            </div>
            {verdictResponse !== "Entry withheld" && (
              <button onClick={() => handleNavigate("/thewall")} className={wallLink}>
                SEE THE RECORD →
              </button>
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
              SEE THE RECORD →
            </button>
          </div>
        )}
          </>
        )}
      </div>
      <KioskIdleLine secondsLeft={idleLeft} />
      <KioskStaffReset />

      {/* ── POST TO STORY photo flow (see the story state note). Full-screen
          overlay: choose → crop → preview. skip at the bottom of choose runs
          the old single-tap path — today's card, byte for byte. */}
      {/* iOS SAFARI FIX (confirmed on a real phone): with `inset-0` alone
          the overlay sizes to the LARGE viewport (toolbar hidden), so its
          bottom controls — chooser's skip, crop's back, preview's RETAKE —
          sat under Safari's bottom toolbar with no visible way out of the
          flow. height:100dvh sizes to the DYNAMIC viewport (ends above the
          toolbar; the top:0 of inset-0 + explicit height wins over bottom:0,
          and browsers without dvh, pre-2022, ignore the invalid height and
          fall back to inset-0). The safe-area inset handles the home
          indicator once the toolbar minimises. screen-container already does
          both (100dvh + pb-32); this overlay was the one unprotected
          container in the flow. */}
      {/* NEVER in kiosk: the chooser's TAKE A PHOTO opens the BOOTH'S camera,
          pointed at whatever the booth is pointed at, and "or pick one" opens
          the booth's library. Both are the wrong device and the wrong person's
          photos. The kiosk branch above renders no entry point to this flow;
          this gate is the second layer. */}
      {story && !kiosk ? (
        <div
          className="fixed inset-0 z-50 bg-background flex flex-col items-center px-6 pt-10 overflow-hidden animate-fade-in"
          style={{
            height: "100dvh",
            paddingBottom: "calc(2rem + env(safe-area-inset-bottom))",
          }}
        >
          {story.step === "choose" ? (
            <>
              <div className="flex-1 w-full max-w-xs flex flex-col items-center justify-center gap-5">
                {/* Framing caption (THE PRIMARY-ACTION RULE): the evidence
                    register — the photo is exhibit material, same voice as
                    AS CHARGED. Replaced "WHERE IT HAPPENED." (a statement
                    about the place; this is an instruction to the confessor),
                    which itself replaced "THE ROOM, NOT YOUR DINNER" (assumed
                    a restaurant, and was framing advice). */}
                <p className="text-muted-foreground text-[11px] font-mono-light tracking-wide text-center">
                  GET THE EVIDENCE
                </p>
                {/* capture="environment" opens the back camera directly; the
                    library lives behind the quiet link below (its input has no
                    capture attribute). */}
                <label className="btn-booth block w-full border border-muted-foreground/40 bg-transparent text-sm text-center hover:bg-transparent cursor-pointer">
                  <span className="enter-glow-text text-[hsl(var(--ritual-green))]">
                    TAKE A PHOTO
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => onStoryFile(e.target.files?.[0])}
                  />
                </label>
                <label className={`${shareSecondary} cursor-pointer`}>
                  or pick one
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => onStoryFile(e.target.files?.[0])}
                  />
                </label>
              </div>
              <button onClick={skipPhoto} disabled={sharing} className={shareSecondary}>
                skip
              </button>
            </>
          ) : story.step === "crop" ? (
            <StoryPhotoCrop
              img={story.img}
              busy={sharing}
              onUse={onCropDone}
              onBack={() => setStory({ step: "choose" })}
            />
          ) : (
            <>
              {/* The finished card IS the framing guide — they judge the
                  result, not a description of it. */}
              <div className="flex-1 w-full max-w-md flex flex-col items-center justify-center gap-5">
                <img
                  src={story.url}
                  alt="Your story card"
                  className="border border-muted-foreground/40"
                  style={{ width: "min(75vw, 34vh)", aspectRatio: "9 / 16" }}
                />
                <button
                  onClick={() => shareStoryPreview(story.blob)}
                  disabled={sharing}
                  className="btn-booth block w-full max-w-xs border border-muted-foreground/40 bg-transparent text-sm text-center hover:bg-transparent"
                >
                  <span className="enter-glow-text text-[hsl(var(--ritual-green))]">
                    {sharing ? "OPENING…" : "POST TO STORY"}
                  </span>
                </button>
                <button
                  onClick={() => {
                    setStory((s) => {
                      if (s?.step === "preview") URL.revokeObjectURL(s.url);
                      return { step: "choose" };
                    });
                  }}
                  disabled={sharing}
                  className={shareSecondary}
                >
                  RETAKE
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default Verdict;
