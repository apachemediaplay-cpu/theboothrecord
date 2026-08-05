import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import BoothFooter from "@/components/BoothFooter";
import { supabase } from "@/integrations/supabase/client";
import { tagConfession, logBoothEvent, recoverVerdict } from "@/lib/metrics";

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

// Hard ceiling from REQUEST START — NOT silence detection. There is no stream,
// so silence cannot be detected; a slow-but-alive verdict at 36s will be killed.
// 35s because slow runs already reach 25s, and 30 would kill real verdicts on
// their way back to the client.
const VERDICT_TIMEOUT_MS = 35_000;
// The recovery check gets its own ceiling — never leave someone hanging on a
// failed recovery.
const RECOVERY_TIMEOUT_MS = 5_000;
// Sentinel so the catch can tell the ceiling firing apart from a real error.
const VERDICT_TIMED_OUT = Symbol("verdict-timeout");

const Receiving = () => {
  const navigate = useNavigate();
  const [errored, setErrored] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [typed, setTyped] = useState("");
  const startedRef = useRef(false);

  // The ONE place the success keys are written — shared by the ok response and a
  // successful timeout recovery, so the two paths can never drift.
  const applyVerdict = useCallback(
    (
      verdict: string,
      subjectNumber: number | null,
      rowSource: string,
      stampVenue: boolean,
    ) => {
      sessionStorage.setItem("verdictResponse", verdict);
      if (subjectNumber != null) {
        sessionStorage.setItem("subjectNumber", String(subjectNumber));
        // Fire-and-forget: tag the row with this session's id + test flag.
        // Never blocks navigation to /verdict.
        tagConfession(Number(subjectNumber));
      } else {
        sessionStorage.removeItem("subjectNumber");
      }
      sessionStorage.setItem("verdictSource", rowSource);
      sessionStorage.setItem("stampVenue", stampVenue ? "true" : "false");
      navigate("/verdict");
    },
    [navigate],
  );

  // The 35s ceiling fired. create_confession writes the row BEFORE the AI runs,
  // so a timeout does NOT mean nothing happened — the verdict may exist with only
  // the response lost in transit. Check the DB before admitting anything:
  //   found     → identical writes to the ok path; the person never knows.
  //   not found → the failure screen.
  //   the check itself errors or exceeds its own 5s ceiling → failure screen too.
  const attemptRecovery = useCallback(
    async (confession: string, source: string) => {
      logBoothEvent("verdict_timeout", source);
      const result = await Promise.race([
        recoverVerdict(confession, source),
        new Promise<{ status: "error" }>((resolve) =>
          setTimeout(() => resolve({ status: "error" }), RECOVERY_TIMEOUT_MS),
        ),
      ]);
      if (result.status === "found") {
        logBoothEvent("verdict_recovery", source, { outcome: "recovered" });
        applyVerdict(
          result.row.verdict_text,
          result.row.subject_number ?? null,
          typeof result.row.source === "string" ? result.row.source : "",
          result.row.stamp_venue === true,
        );
        return;
      }
      logBoothEvent("verdict_recovery", source, {
        outcome: result.status === "not_found" ? "not_found" : "error",
      });
      setTimedOut(true);
    },
    [applyVerdict],
  );

  // Call the gatekeeper→verdict Edge Function and route on the response contract:
  //   ok → /verdict · blocked → /blocked · held → /held · error → inline retry
  // Fire the verdict request and route on the response contract:
  //   ok → /verdict · blocked → /blocked · held → /held · error → inline retry
  const run = useCallback(async () => {
    setErrored(false);
    setTimedOut(false);

    const confession = sessionStorage.getItem("confession") || "";
    const source = sessionStorage.getItem("source") || "direct";

    try {
      // Race the invoke against the hard ceiling (see VERDICT_TIMEOUT_MS — this is
      // a ceiling from request start, not silence detection). On timeout the
      // underlying request is abandoned; a late response goes nowhere.
      const { data, error } = (await Promise.race([
        supabase.functions.invoke("generate-verdict", {
          body: { confession, source },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(VERDICT_TIMED_OUT), VERDICT_TIMEOUT_MS),
        ),
      ])) as { data: Record<string, unknown> | null; error: unknown };
      if (error || !data) throw error ?? new Error("No response");

      switch (data.status) {
        case "ok":
          // The share card's FILED AT reads the source persisted to the row (as
          // returned by the function), never the client-captured source.
          // stamp_venue is written unconditionally on every ok so a previous
          // confession's value can never leak; fail closed — anything but an
          // explicit true stores "false" (including an older function build that
          // omits the field). All writes live in applyVerdict, shared with the
          // timeout-recovery path.
          applyVerdict(
            typeof data.verdict === "string" ? data.verdict : "",
            data.subject_number != null ? Number(data.subject_number) : null,
            typeof data.source === "string" ? data.source : "",
            data.stamp_venue === true,
          );
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
    } catch (e) {
      if (e === VERDICT_TIMED_OUT) {
        await attemptRecovery(confession, source);
        return;
      }
      setErrored(true);
    }
  }, [navigate, applyVerdict, attemptRecovery]);

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
    if (errored || timedOut) return;

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
  }, [errored, timedOut]);

  const handleRetry = () => {
    startedRef.current = true;
    run();
  };

  return (
    <div className="screen-container animate-fade-in">
      <div className="flex-1 flex flex-col items-center justify-center gap-6">
        {timedOut ? (
          /* Timeout after a failed recovery. EXACTLY this copy — no error code, no
             "something went wrong", no reload button: the Booth is an authority,
             it never admits fault. NO sessionStorage clear on this path — the
             clear lives in Confess.tsx's handleSubmit and nowhere else; the kept
             "confession" key is what CONFESS AGAIN pre-fills from. */
          <div className="w-full flex flex-col items-start gap-8">
            <div>
              <h2 className="font-control text-3xl md:text-4xl font-bold text-foreground mb-2">
                Nothing on record.
              </h2>
              <p className="text-ritual text-xl font-mono-light tracking-wide">Try again.</p>
            </div>
            <button
              onClick={() => navigate("/confess", { state: { prefill: true } })}
              className="btn-booth"
            >
              CONFESS AGAIN
            </button>
          </div>
        ) : !errored ? (
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

      {/* GUILTY wordmark — Receiving is the one screen EVERY confessor passes
          through (roughly one in four reaches the wall: 44 wall visits against
          189 confessions), so this is the only placement that guarantees nobody
          completes the flow without seeing the word once. NOT on the timeout
          state — "GUILTY" under "Nothing on record. Try again." reads badly. */}
      {!timedOut && <BoothFooter />}
    </div>
  );
};

export default Receiving;
