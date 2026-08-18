import { useEffect, useRef, useState } from "react";
import StoryPhotoCrop from "@/components/StoryPhotoCrop";
import { renderShareCard, type ShareCardRecord } from "@/lib/shareCard";
import { useToast } from "@/hooks/use-toast";

// ── THE POST TO STORY FLOW ──────────────────────────────────────────────────
// choose → crop → preview → share sheet, plus the skip path that goes straight
// to the card. Lifted out of Verdict.tsx unchanged so /v/:id can mount the SAME
// screen rather than a second copy of it: this is the most-iterated surface in
// the app (film grade, crop gesture, dvh sizing, band spacing — a dozen briefs)
// and the codebase has already been bitten once by two implementations of one
// card drifting apart (see the TWO RENDERERS note in lib/shareCard).
//
// STATE, not a route, deliberately: the flow's core input is a decoded image
// held in memory — it can't cross a route boundary without persisting it
// somewhere, and this feature's contract is that the photo NEVER leaves the
// device (no upload, no storage, no moderation — nothing but this component's
// memory and the PNG handed to the share sheet). A route would also be
// deep-linkable into a state with no verdict behind it.
//
// The PAGE owns three things this component cannot know:
//   resolve()      what to draw, and where the card's link points. Async
//                  because the verdict screen has to resolve its own uuid and
//                  venue at this moment; /v/:id already holds a row.
//   onShared()     what a share MEANS on that page — metrics keyed to the
//                  page's own source, and (on /verdict) the post-share state.
//   secondaryClass the treatment for skip / RETAKE, so both pages' quiet
//                  actions match their own screen.
export type StoryFlowProps = {
  open: boolean;
  onClose: () => void;
  /** Everything the card needs, resolved at the moment of drawing. null = give up quietly. */
  resolve: () => Promise<{ record: ShareCardRecord; shareUrl: string } | null>;
  /** Fired once the PNG has reached the share sheet (or the desktop download). */
  onShared?: () => void;
  /** Treatment for the flow's own text buttons (skip, RETAKE). */
  secondaryClass: string;
};

const StoryFlow = ({ open, onClose, resolve, onShared, secondaryClass }: StoryFlowProps) => {
  const { toast } = useToast();
  const [story, setStory] = useState<
    | { step: "choose" }
    | { step: "crop"; img: HTMLImageElement }
    | { step: "preview"; blob: Blob; url: string }
    | null
  >(null);
  const [sharing, setSharing] = useState(false);
  // Object URL for the picked photo + the share url resolved when the card was
  // rendered (the preview share needs it for the travelling /v/ link).
  const storyPhotoUrl = useRef<string | null>(null);
  const storyShareUrl = useRef<string | null>(null);

  // The PAGE owns open/closed; the step machine inside always starts at
  // "choose". Kept in an effect rather than derived during render so the state
  // update can never land mid-render of the parent.
  useEffect(() => {
    setStory((s) => (open ? s ?? { step: "choose" } : null));
  }, [open]);

  // The actual handoff to the share sheet (or the desktop download fallback).
  // Share-INTENT metrics live on the PAGE (see onShared): what a share means
  // differs between the confessor's own verdict and a page a stranger opened.
  const shareStoryBlob = async (blob: Blob, shareUrl: string | null) => {
    onShared?.();
    const file = new File([blob], "guilty-on-record.png", { type: "image/png" });

    const canShareFiles =
      typeof navigator !== "undefined" &&
      !!navigator.canShare &&
      navigator.canShare({ files: [file] });

    if (canShareFiles) {
      await navigator.share({
        files: [file],
        title: "GUILTY",
        text: shareUrl ?? "https://theboothrecord.com",
      });
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

  // Close the flow and release every object URL it holds. The photo lives ONLY
  // behind these URLs and the in-memory canvases — nothing is uploaded, stored,
  // or sent anywhere, so closing the flow is the end of it.
  const closeStory = () => {
    if (storyPhotoUrl.current) {
      URL.revokeObjectURL(storyPhotoUrl.current);
      storyPhotoUrl.current = null;
    }
    setStory((s) => {
      if (s?.step === "preview") URL.revokeObjectURL(s.url);
      return null;
    });
    onClose();
  };

  // skip → the single-tap path: today's card, byte for byte.
  const skipPhoto = async () => {
    setSharing(true);
    try {
      const ctx = await resolve();
      if (!ctx) return;
      const blob = await renderShareCard(ctx.record);
      await shareStoryBlob(blob, ctx.shareUrl);
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
      await new Promise<void>((resolve2, reject) => {
        img.onload = () => resolve2();
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
      const ctx = await resolve();
      if (!ctx) return;
      storyShareUrl.current = ctx.shareUrl;
      const blob = await renderShareCard(ctx.record, photoCanvas);
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
      await shareStoryBlob(blob, storyShareUrl.current);
    } catch {
      // User cancelled the share sheet — stay on the preview so they can retry.
      return;
    } finally {
      setSharing(false);
    }
    closeStory();
  };

  return (
    <>
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
  {story ? (
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
            <label className={`${secondaryClass} cursor-pointer`}>
              or pick one
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onStoryFile(e.target.files?.[0])}
              />
            </label>
          </div>
          <button onClick={skipPhoto} disabled={sharing} className={secondaryClass}>
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
              className={secondaryClass}
            >
              RETAKE
            </button>
          </div>
        </>
      )}
    </div>
  ) : null}
    </>
  );
};

export default StoryFlow;
