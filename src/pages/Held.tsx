import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { isKioskSession } from "@/lib/source";
import { resetBoothSession } from "@/lib/reset";
import { KioskStaffReset } from "@/hooks/useKioskTimeout";

// HELD (gate-failed neutral state). Same layout as the Safe State, but neutral copy,
// NO Lifeline line (we don't know it's crisis), and a retry option.
const Held = () => {
  const navigate = useNavigate();
  // KIOSK: no retry. "Try again" re-runs the confession still sitting in
  // sessionStorage — on the booth's device that confession belongs to whoever
  // walked away, and the next person must never be handed a button that
  // resubmits a stranger's words. Close is the only exit, and it resets.
  const [kiosk] = useState(() => isKioskSession());
  const close = () => {
    // On the way OUT to the gate — the one place the booth is handed on. On a
    // phone this is a plain navigate, exactly as before.
    if (kiosk) resetBoothSession();
    navigate("/");
  };

  return (
    <div
      className="min-h-[100dvh] flex flex-col items-center justify-center px-8 text-center"
      style={{ background: "#1b1512" }}
    >
      {/* Primary line — neutral */}
      <p className="font-mono-light" style={{ color: "#f4efe9", fontSize: "17px", lineHeight: 1.6 }}>
        The booth is reviewing this one.
      </p>

      {/* Thin divider */}
      <div style={{ width: "28px", height: "1px", background: "#3a322c", margin: "28px 0" }} />

      {/* Retry (re-runs the confession still held in sessionStorage) */}
      {!kiosk && (
        <button
          onClick={() => navigate("/receiving")}
          className="font-mono-light"
          style={{ color: "#c9bcb1", fontSize: "13px", background: "none", border: "none", cursor: "pointer" }}
        >
          Try again
        </button>
      )}

      {/* Quiet way out */}
      <button
        onClick={close}
        className="font-mono-light"
        style={{
          color: "#5f574f",
          fontSize: "13px",
          marginTop: "32px",
          background: "none",
          border: "none",
          cursor: "pointer",
        }}
      >
        Close
      </button>

      <KioskStaffReset />
    </div>
  );
};

export default Held;
