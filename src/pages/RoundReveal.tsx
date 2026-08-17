import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import { useWakeLock } from "@/hooks/useWakeLock";
import { useKioskTimeout, KioskIdleLine, KioskStaffReset } from "@/hooks/useKioskTimeout";
import { isKioskSession, kioskHandoffUrl } from "@/lib/source";
import { resolveShareId, logBoothEvent } from "@/lib/metrics";
import { beginShareResolve, endShareResolve } from "@/lib/reset";
import { getRound, markRevealed, roundSettled } from "@/lib/round";

// REVEAL — one verdict per screen, N times. One at a time is what keeps the
// whole table reading the same thing at the same moment, and it means a long
// verdict never overflows. Same proportions as the solo verdict screen.
// The index is plain component state: by the time this screen mounts every
// slot has settled (Deliberating guarantees it; the guard below re-asserts),
// so the data is static and back/forward just re-enters at the first card.
//
// KIOSK: this screen now carries the CODE as well as the verdict — one screen
// per person, start to finish. Every verdict used to be shown twice, full size
// here and again at 18px on the strip with a second copy of the same code; the
// strip predated this screen and no longer had a job in the booth's flow. It
// keeps its route and its phone rendering (see RoundStrip) — kiosk simply
// stops walking there, and the last card ends the round instead.
const RoundReveal = () => {
  const navigate = useNavigate();
  // Hold the screen awake — reveals are read aloud, taps can be slow.
  useWakeLock();
  // Read once at mount, like every other kiosk branch.
  const [kiosk] = useState(() => isKioskSession());
  const round = getRound();
  const [idx, setIdx] = useState(0);
  // One QR per CARD, keyed by slot index: undefined = still resolving, null =
  // failed (that card just shows no code), string = the data URL. Cached, so
  // stepping back to a card you've already seen doesn't re-resolve it.
  const [qrs, setQrs] = useState<Record<number, string | null>>({});
  const last = !!round && idx >= round.slots.length - 1;

  // 120s ON THE LAST CARD — the strip's timeout, inherited with the strip's
  // job. The last reveal is the terminal screen now, and it is the one screen
  // where three people take turns getting their phones out; at 90 the third
  // person's code could vanish mid-scan. Earlier cards keep 90: someone is
  // reading aloud and the table is talking, but nobody is scanning yet.
  const idleLeft = useKioskTimeout(last ? 120 : 90, "round_reveal");

  // REACHING THE LAST CARD IS THE ROUND ENDING, in kiosk — the job the strip's
  // mount used to do (see markRevealed). Without this the round would stay
  // "in flight" forever on the booth: /confess would keep forwarding the next
  // person into the finished round's pipeline, and /round would never show a
  // fresh picker for GO AGAIN. Non-kiosk still ends on the strip.
  useEffect(() => {
    if (kiosk && last) markRevealed();
  }, [kiosk, last]);

  // KIOSK: resolve THIS card's share uuid and draw its code. Reuses
  // resolveShareId — the SAME owner-gated resolver the solo verdict and the
  // strip use; there is no second resolver anywhere. Wrapped in
  // begin/endShareResolve so an idle reset can't rotate the session id
  // mid-resolve and orphan the record (see lib/reset).
  useEffect(() => {
    if (!kiosk || !round) return;
    const slot = round.slots[idx];
    if (!slot || slot.status !== "done" || !slot.subjectNumber || !slot.verdict) {
      setQrs((m) => ({ ...m, [idx]: null }));
      return;
    }
    if (qrs[idx] !== undefined) return; // already drawn (or already failed)
    let cancelled = false;
    beginShareResolve();
    (async () => {
      try {
        const id = await resolveShareId(slot.subjectNumber, slot.verdict);
        if (cancelled) return;
        if (!id) {
          setQrs((m) => ({ ...m, [idx]: null }));
          return;
        }
        // BLACK ON WHITE, margin 3 (~7% quiet zone), sRGB-tagged canvas —
        // the solo verdict's construction exactly, for the same reason: a
        // phone camera in a dark room is at the edge of its exposure, and
        // contrast is what makes the first scan land. (An untagged data URL
        // is read as Display P3 on iPhone; black and white are immune.)
        const qrCanvas = document.createElement("canvas");
        qrCanvas.getContext("2d", { colorSpace: "srgb" });
        await QRCode.toCanvas(qrCanvas, kioskHandoffUrl(id), {
          width: 640,
          margin: 3,
          errorCorrectionLevel: "M",
          color: { dark: "#000000", light: "#FFFFFF" },
        });
        if (cancelled) return;
        setQrs((m) => ({ ...m, [idx]: qrCanvas.toDataURL("image/png") }));
        // One event per CARD — each card is its own handoff moment, which
        // matches the solo verdict's one-per-code. (The strip logged one
        // event for N codes because it showed them all at once.)
        logBoothEvent("kiosk_qr", sessionStorage.getItem("source"), {
          screen: "round_reveal",
          card: idx + 1,
        });
      } catch {
        if (!cancelled) setQrs((m) => ({ ...m, [idx]: null }));
      } finally {
        // ALWAYS — an early return on cancel must not leak the in-flight
        // count, or resetBoothSession would refuse for the rest of the night.
        endShareResolve();
      }
    })();
    return () => {
      cancelled = true;
    };
    // Per-card: qrs is read for the cache check but must not re-trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kiosk, idx]);

  if (!round || round.slots.length === 0) return <Navigate to="/round" replace />;
  if (!roundSettled()) return <Navigate to="/round/deliberating" replace />;

  const slot = round.slots[Math.min(idx, round.slots.length - 1)];

  return (
    // KIOSK CENTRING — the same fix already made on the strip and the kiosk
    // verdict, which this screen was missed out of: flex-1 stretched the card
    // to fill the space and pinned the footer to the bottom edge, leaving a
    // 400px void mid-screen between the verdict and the rule. min-h (not h)
    // means a long verdict just grows the page instead of clipping.
    <div className={`screen-container animate-fade-in${kiosk ? " pb-8 justify-center" : ""}`}>
      {/* pb-8 in kiosk: with the footer's pt-6 that makes the record-to-action
          gap 56px — the same break the kiosk verdict uses, and the reason the
          hairline below could go. */}
      <div
        className={`${kiosk ? "" : "flex-1 "}flex flex-col justify-center items-start text-left ${
          kiosk ? "pb-8" : "pb-10"
        }`}
      >
        {/* Stamp + counter on one line — stamp in ritual (the share page's
            treatment), counter in State Blue metadata. */}
        <div className="mb-3 flex w-full items-baseline justify-between">
          <p className="text-ritual type-filing font-mono-light tracking-[0.2em] uppercase">
            The booth noticed.
          </p>
          <p className="text-[hsl(var(--state-blue)/0.75)] type-filing font-mono-light tracking-[0.2em] uppercase">
            {idx + 1} of {round.slots.length}
          </p>
        </div>
        <p className="text-muted-foreground type-confession font-mono-light whitespace-pre-wrap mb-8">
          {slot.confession}
        </p>
        {/* type-verdict (see index.css): the whole table reads this at once,
            from three different distances, so it takes the scale's top tier and
            grows with the screen instead of stepping once at 768. */}
        {slot.status === "done" && slot.verdict ? (
          <p
            className="font-control type-verdict font-bold text-[#F4F0EA] leading-tight"
          >
            {slot.verdict}
          </p>
        ) : (
          // Failed / timed-out slot: the solo timeout's copy, reused. The
          // round CONTINUES — NEXT advances past it like any other card.
          <p className="font-control type-verdict font-bold text-foreground leading-tight">
            Nothing on record.
          </p>
        )}
        {/* THE CODE, KIOSK ONLY — centred on the column while the record stays
            left-aligned, exactly as on the solo verdict screen. 56px above the
            group, 18px between the code and each of the two lines that bracket
            it. A card whose uuid can't be resolved simply shows no code (no
            error, no retry): the verdict has already been read out, and a
            broken button on a booth is a button the next table inherits.
            THE PAIR — CONFESSOR N above, TAKE IT WITH YOU below — is one
            treatment used twice, deliberately: they are the same voice doing
            the same job (whose code this is, and what to do with it), and
            splitting them across two tiers made the code look like it belonged
            to the verdict above rather than to a person at the table. State
            Blue on venue-glow-text, the gate strip's static treatment reused
            rather than duplicated — this is the State's apparatus labelling a
            record, the same voice as the venue stamp. UPPERCASE at this size,
            against the solo verdict's lowercase caption: that one is a phone
            instruction read by the person holding the device, this is signage
            read across a table, and caps at 22px is what carries. */}
        {kiosk ? (
          <div className="mt-14 flex w-full flex-col items-center gap-[18px]">
            {/* SIZED OFF THE VIEWPORT, NOT THE COLUMN — a code has no line
                length, so the cap that keeps sentences readable has no business
                deciding how big a camera target is. Same expression as the solo
                verdict's code; height from aspect-ratio so all three states
                reserve identical space and nothing jumps as it resolves. */}
            {/* CONFESSOR N — the round's own numbering (this card's position),
                NOT the subject number: at a table of three, "whose code is
                this?" is answered by the order people took their turn, and the
                subject number is a filing reference that means nothing to them
                until they scan. It rides ABOVE the code so the label is read
                before the thing it labels. */}
            {qrs[idx] ? (
              <p className="venue-glow-text type-handoff font-mono-light tracking-[0.18em] uppercase">
                Confessor {idx + 1}
              </p>
            ) : null}
            <div
              className="flex items-center justify-center"
              style={{ width: "clamp(180px, 34vw, 400px)", aspectRatio: "1 / 1" }}
            >
              {qrs[idx] ? (
                <img
                  src={qrs[idx] as string}
                  alt="Scan to open this verdict"
                  className="h-full w-full"
                />
              ) : qrs[idx] === null ? null : (
                <p className="text-muted-foreground/60 text-[13px] font-mono-light tracking-wide">
                  FILING…
                </p>
              )}
            </div>
            {qrs[idx] ? (
              <p className="venue-glow-text type-handoff font-mono-light tracking-[0.18em] uppercase">
                Take it with you
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      {/* NO hairline above the action in kiosk: the 56px gap, the switch from
          Control to mono and the change from left-aligned record to centred
          control already mark the boundary three times over — the rule was a
          fourth. The phone keeps it: its record and its button sit much closer
          together. (Same call as the three static verdict screens.) */}
      <div
        className={`shrink-0 w-full pt-6 flex flex-col items-center gap-3 ${
          kiosk ? "" : "border-t border-muted-foreground/40"
        }`}
      >
        {/* THE PRIMARY-ACTION RULE (see index.css). The last card's button
            changes job, so it changes label — and the job is now different per
            device: on a phone the round still ends at the strip (SEE THEM ALL),
            on the booth this IS the end, so it offers the next round. */}
        <button
          onClick={() =>
            last ? navigate(kiosk ? "/round" : "/round/strip") : setIdx((i) => i + 1)
          }
          className="btn-booth border border-muted-foreground/40 bg-transparent type-action hover:bg-transparent"
        >
          <span className="enter-glow-text text-[hsl(var(--ritual-green))]">
            {last ? (kiosk ? "GO AGAIN" : "SEE THEM ALL") : "NEXT →"}
          </span>
        </button>
        {/* BACK — kiosk only, and only where there IS a card behind: the codes
            live on the cards now, so someone who let theirs go past has no
            other way to reach it. Quiet text under the box, never a second
            box (one primary action per screen). Lowercase: it's an aside, not
            a step in the ritual. */}
        {kiosk && idx > 0 ? (
          <button
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            className="type-action text-muted-foreground hover:text-foreground transition-colors tracking-wide"
          >
            back
          </button>
        ) : null}
      </div>
      <KioskIdleLine secondsLeft={idleLeft} />
      <KioskStaffReset />
    </div>
  );
};

export default RoundReveal;
