import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import BoothFooter from "@/components/BoothFooter";
import { supabase } from "@/integrations/supabase/client";
import { tagConfession } from "@/lib/metrics";

// Three-beat loader copy. Each beat types out, then holds while a thin caret blinks.
// Beat 1 ≈5s total (≈3.4s hold), beat 2 ≈6s total (≈4.7s hold) → beat 3 at ≈11s.
// Beat 3 is the terminal hold — no fixed duration; it waits for the verdict.
// Three-beat loader copy. Each beat types out, then holds while a thin caret blinks.
//
// VOICE: the Booth observes the CONFESSOR — it never narrates its own progress.
// Beat 1 disarms (presumption: nothing here was news). Beat 2 states the actual
// verdict mechanism (the gap between stated and unstated), so the verdict lands as
// fair rather than as a trick. Beat 3 is a standing fact, not a countdown — it must
// read well whether the verdict arrives 2s or 20s after it appears.
//
// Every beat uses a HARD line break (rendered via whitespace-pre-line) so each is
// always exactly two lines on mobile — it never flickers between 1 and 2 lines as
// it types.
//
// Beat 1 ≈5s total (≈3.4s hold), beat 2 ≈6s total (≈4.7s hold) → beat 3 at ≈11s.
// Beat 3 is the terminal hold — no fixed duration; it waits for the verdict.
const BEATS = [
  { text: "Received.\nWe already knew.", hold: 3400 },
  { text: "Looking for what\nyou left out.", hold: 4700 },
  { text: "You already know\nwhat this says.", hold: Number.POSITIVE_INFINITY },
] as const;
const CHAR_MS = 60; // typewriter feel

const Receiving = () => {
  const navigate = useNavigate();
  const [errored, setErrored] = useState(false);
  const [typed, setTyped] = useState("");
  const startedRef = useRef(false);

  // Call the gatekeeper→verdict Edge Function and route on the response contract:
  //   ok → /verdict · blocked → /blocked · held → /held · error → inline retry
  // Fire the verdict request and route on the response contract:
  //   ok → /verdict · blocked → /blocked · held → /held · error → inline retry
  const run = useCallback(async () => {
    setErrored(false);

    const confession = sessionStorage.getItem("confession") || "";
    const source = sessionStorage.getItem("source") || "direct";

    try {
      const { data, error } = await supabase.functions.invoke("generate-verdict", {
        body: { confession, source },
      });
      if (error || !data) throw error ?? new Error("No response");

      switch (data.status) {
        case "ok":
          sessionStorage.setItem("verdictResponse", data.verdict || "");
          if (data.subject_number != null) {
            sessionStorage.setItem("subjectNumber", String(data.subject_number));
            // Fire-and-forget: tag the row the Edge Function just created with this
            // session's id + test flag. Never blocks navigation to /verdict.
            tagConfession(Number(data.subject_number));
          } else {
            sessionStorage.removeItem("subjectNumber");
          }
          // The share card's FILED AT reads THIS (the source persisted to the row,
          // as returned by the function), never the client-captured source.
          sessionStorage.setItem("verdictSource", typeof data.source === "string" ? data.source : "");
          // stamp_venue for THIS confession, so the save-image path doesn't depend on the
          // fallback fetch. Written unconditionally on every ok, so a previous confession's
          // value can never leak into this one. Fail closed: anything but an explicit true
          // stores "false" (including an older function build that omits the field).
          sessionStorage.setItem("stampVenue", data.stamp_venue === true ? "true" : "false");
          navigate("/verdict");
          break;
        case "blocked":
          navigate("/blocked");
          break;
        case "held":
          navigate("/held");
          break;
        default:
          // "error" (verdict failed / rate-limited / invalid) → offer a retry, no held/crisis state.
          setErrored(true);
      }
    } catch {
      setErrored(true);
    }
  }, [navigate]);

  // HARD RULE 1: fire the request ONCE on mount, decoupled from the copy pacing —
  // the typewriter must never gate the network call.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    run();
  }, [run]);

  // Three-beat loader, independent of the request. Each beat types out char-by-char,
  // then HOLDS while the blinking caret (CSS-only) keeps animating. Advances once (no
  // loop); beat 3 holds open until the verdict lands and we navigate away.
  useEffect(() => {
    if (errored) return;

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const typeBeat = (i: number) => {
      if (cancelled) return;
      setTyped("");
      const text = BEATS[i].text;
      let ch = 0;
      const typeTimer = setInterval(() => {
        if (cancelled) {
          clearInterval(typeTimer);
          return;
        }
        ch++;
        setTyped(text.slice(0, ch));
        if (ch >= text.length) {
          clearInterval(typeTimer);
          const { hold } = BEATS[i];
          if (Number.isFinite(hold) && i < BEATS.length - 1) {
            timers.push(setTimeout(() => typeBeat(i + 1), hold));
          }
          // terminal beat: no timeout — the caret keeps blinking until navigation
        }
      }, CHAR_MS);
      timers.push(typeTimer);
    };

    typeBeat(0);

    return () => {
      cancelled = true;
      timers.forEach((id) => {
        clearTimeout(id);
        clearInterval(id);
      });
    };
  }, [errored]);

  const handleRetry = () => {
    startedRef.current = true;
    run();
  };

  return (
    <div className="screen-container animate-fade-in">
      <div className="flex-1 flex flex-col items-center justify-center gap-6">
        {!errored ? (
          <p className="text-ritual text-xl font-mono-light tracking-wide min-h-[3.5rem] self-start text-left whitespace-pre-line">
            {typed}
            <span className="type-caret" aria-hidden="true" />
          </p>
        ) : (
          <>
            <p className="text-ritual text-lg font-mono-light tracking-wide text-center">
              Something went wrong — try again.
            </p>
            <button onClick={handleRetry} className="btn-booth">
              TRY AGAIN
            </button>
            <button
              onClick={() => navigate("/confess")}
              className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors tracking-wide"
            >
              BACK
            </button>
          </>
        )}
      </div>

      <BoothFooter />
    </div>
  );
};

export default Receiving;
