import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import { useWakeLock } from "@/hooks/useWakeLock";
import { useKioskTimeout, KioskIdleLine, KioskStaffReset } from "@/hooks/useKioskTimeout";
import { isKioskSession, kioskHandoffUrl } from "@/lib/source";
import { resolveShareId, logBoothEvent } from "@/lib/metrics";
import { beginShareResolve, endShareResolve } from "@/lib/reset";
import { getRound, markRevealed, ROUND_WORDS } from "@/lib/round";

// THE STRIP — all N together. Confessions truncate to ONE line (they're
// labels by now; everyone has read them on the reveal cards); verdicts show
// in full. The list may scroll — the reading-out is done by this point.
const RoundStrip = () => {
  const navigate = useNavigate();
  // Hold the screen awake — the brief holds the lock for the WHOLE round,
  // and GO AGAIN restarts from here.
  useWakeLock();
  const [kiosk] = useState(() => isKioskSession());
  // 120s — the longest idle on the booth. This screen is where two or three
  // people take turns getting their phones out; the timer must outlast the
  // slowest of them, and everything here is already filed either way.
  const idleLeft = useKioskTimeout(120, "round_strip");
  const round = getRound();
  // One QR per slot, keyed by slot index: undefined = still resolving, null =
  // failed (that person's line just shows no code), string = the data URL.
  const [qrs, setQrs] = useState<Record<number, string | null>>({});

  // Reaching the strip IS the round ending (see markRevealed): after this,
  // /confess is solo again and /round shows a fresh picker — while the store
  // survives so this screen's own back/forward keeps rendering.
  useEffect(() => {
    markRevealed();
  }, []);

  // KIOSK: resolve one share uuid per slot and draw its QR. Reuses
  // resolveShareId — the SAME owner-gated resolver the solo verdict uses; no
  // second resolver exists anywhere. All N run inside one begin/endShareResolve
  // window so an idle reset can't rotate the session id mid-batch and orphan
  // the rest (see lib/reset).
  useEffect(() => {
    if (!kiosk || !round) return;
    let cancelled = false;
    beginShareResolve();
    (async () => {
      let drawn = 0;
      try {
      for (let i = 0; i < round.slots.length; i++) {
        const slot = round.slots[i];
        if (slot.status !== "done" || !slot.subjectNumber || !slot.verdict) {
          if (!cancelled) setQrs((m) => ({ ...m, [i]: null }));
          continue;
        }
        try {
          const id = await resolveShareId(slot.subjectNumber, slot.verdict);
          if (cancelled) return;
          if (!id) {
            setQrs((m) => ({ ...m, [i]: null }));
            continue;
          }
          // BLACK ON WHITE, margin 3 (~7% quiet zone), sRGB-tagged canvas —
          // identical to the solo verdict's QR and for the identical reason:
          // a phone camera in a dark room is at the edge of its exposure, and
          // contrast is what makes the first scan land. The green-on-dark
          // version was palette-first. (An untagged data URL is read as
          // Display P3 on iPhone; black and white are immune either way.)
          const qrCanvas = document.createElement("canvas");
          qrCanvas.getContext("2d", { colorSpace: "srgb" });
          await QRCode.toCanvas(qrCanvas, kioskHandoffUrl(id), {
            width: 640,
            margin: 3,
            errorCorrectionLevel: "M",
            color: { dark: "#000000", light: "#FFFFFF" },
          });
          const dataUrl = qrCanvas.toDataURL("image/png");
          if (cancelled) return;
          setQrs((m) => ({ ...m, [i]: dataUrl }));
          drawn += 1;
        } catch {
          if (!cancelled) setQrs((m) => ({ ...m, [i]: null }));
        }
      }
      // ONE event for the strip, not one per code: this is a single handoff
      // moment with N codes in it, and per-QR events would inflate the kiosk
      // share numbers against the solo screen's one-per-card.
      if (!cancelled && drawn > 0) {
        logBoothEvent("kiosk_qr", sessionStorage.getItem("source"), {
          screen: "round_strip",
          codes: drawn,
        });
      }
      } finally {
        // ALWAYS — an early return on cancel must not leak the in-flight
        // count, or resetBoothSession would refuse for the rest of the night.
        endShareResolve();
      }
    })();
    return () => {
      cancelled = true;
    };
    // Mount-only: the round is settled by the time this screen renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kiosk]);

  if (!round || round.slots.length === 0) return <Navigate to="/round" replace />;

  // One QR edge length for the whole strip — fewer people, bigger code.
  const qrBox = round.size <= 2 ? "min(35vw, 300px)" : "min(30vw, 260px)";

  return (
    // pb-8 overrides screen-container's pb-32: the strip is a terminal screen
    // with no fixed footer to clear, and five pairs need the room — the strip
    // must NOT scroll at five people on a 375×667 phone.
    // KIOSK adds justify-center and drops flex-1 below so the WHOLE block
    // (count, pairs, GO AGAIN) centres as one unit. With flex-1 the pairs
    // centred in the upper area while the footer stayed pinned to the bottom,
    // leaving a 376px void between them on a tablet. min-h (not h) means an
    // overflowing strip just grows and the page scrolls — no clipped top.
    <div className={`screen-container animate-fade-in pb-8${kiosk ? " justify-center" : ""}`}>
      <div className={`${kiosk ? "" : "flex-1 "}flex flex-col justify-center py-8`}>
        {/* Count header in RITUAL GREEN — THE BOOTH NOTICED's exact mono
            treatment and tracking, but NOT its words: the count is what makes
            the strip read as a conclusion rather than one more verdict screen. */}
        <p className="text-ritual text-[11px] font-mono-light tracking-[0.2em] uppercase mb-6">
          {ROUND_WORDS[round.size] ?? round.size} on record
        </p>
        {/* Pairs are a PREVIEW, not reading matter — everyone has just seen
            each one full size, one at a time. Confessions truncate to one
            line; verdicts show in full but small and tight. */}
        {/* KIOSK: each pair gets its OWN QR — the strip is the only screen
            where several people's records exist at once, and one shared code
            would hand everyone the same verdict. The code sits beside its own
            verdict so there is no ambiguity about whose is whose; a slot whose
            uuid can't be resolved simply shows no code rather than a broken
            one. Non-kiosk renders the pairs exactly as before. */}
        <div className={kiosk ? "space-y-5" : "space-y-3"}>
          {round.slots.map((slot, i) => (
            <div key={i} className={kiosk ? "flex items-center gap-4" : "min-w-0"}>
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono-light text-[10px] text-muted-foreground/80">
                  {slot.confession}
                </p>
                <p className="font-control font-bold text-foreground text-xs leading-tight">
                  {slot.status === "done" && slot.verdict ? slot.verdict : "Nothing on record."}
                </p>
              </div>
              {kiosk ? (
                // SIZED OFF THE VIEWPORT, not a fixed 80px: at 80 these were
                // ~10% of a tablet's width and the real failure was scanning,
                // not layout. Two people get 35vw, three get 30 — the strip
                // trades page length for scannability, and the px caps only
                // bind on a desktop-width screen where vw would run away.
                <div
                  className="shrink-0 flex items-center justify-center"
                  style={{ width: qrBox, height: qrBox }}
                >
                  {qrs[i] ? (
                    <img src={qrs[i] as string} alt="" style={{ width: qrBox, height: qrBox }} />
                  ) : qrs[i] === null ? null : (
                    <span className="text-[9px] font-mono-light text-muted-foreground/50">
                      …
                    </span>
                  )}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <div className="shrink-0 w-full border-t border-muted-foreground/40 pt-6 flex flex-col items-center gap-4">
        {/* NO closing line above the share button — "Filed. Now you can all
            sort it." was removed and must not come back: the Booth states
            things and stops, it doesn't instruct. The screen is already an
            ending without a line saying so, and the table is already talking —
            a caption here describes something happening in front of them. */}
        {/* SHARE THE ROUND — deliberately DISABLED: the strip card render is a
            separate job, briefed separately. The box holds the slot so the
            layout doesn't reflow when it lands. No glow on a dead control.
            HIDDEN ENTIRELY IN KIOSK: sharing from the booth's device is the
            QRs' job, and a dead control on a tablet is a thing strangers press
            all night. */}
        {!kiosk && (
          <button
            disabled
            className="btn-booth border border-muted-foreground/40 bg-transparent text-[13px] text-muted-foreground/50 hover:bg-transparent disabled:opacity-60"
          >
            SHARE THE ROUND
          </button>
        )}
        <button
          onClick={() => navigate("/round")}
          className="text-[13px] text-muted-foreground hover:text-foreground transition-colors tracking-wide"
        >
          GO AGAIN
        </button>
      </div>
      <KioskIdleLine secondsLeft={idleLeft} />
      <KioskStaffReset />
    </div>
  );
};

export default RoundStrip;
