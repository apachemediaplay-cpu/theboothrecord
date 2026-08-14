import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { isKioskSession } from "@/lib/source";
import { resetBoothSession } from "@/lib/reset";
import { KioskStaffReset } from "@/hooks/useKioskTimeout";

// SAFE STATE (locked spec). The deliberate absence of the verdict screen's performance:
// no stamp, no verdict, no subject number, no share, no footer. Copy is locked.
//
// NO IDLE TIMEOUT HERE, kiosk or not — deliberately. Every other booth screen
// returns itself to the gate on a timer; this one does not, because someone who
// just wrote something serious does not get the screen pulled out from under
// them while they read a crisis line. Close is the only exit.
const Blocked = () => {
  const navigate = useNavigate();
  const [kiosk] = useState(() => isKioskSession());
  const close = () => {
    // The one way out — and on the booth, the one place the device is handed
    // on, so it resets here. Phone behaviour is the plain navigate it was.
    if (kiosk) resetBoothSession();
    navigate("/");
  };

  return (
    <div
      className="min-h-[100dvh] flex flex-col items-center justify-center px-8 text-center"
      style={{ background: "#1b1512" }}
    >
      {/* Primary line — warm, calm. Leads. */}
      <p className="font-mono-light" style={{ color: "#f4efe9", fontSize: "17px", lineHeight: 1.6 }}>
        This one stays off the record.
      </p>

      {/* Thin divider */}
      <div style={{ width: "28px", height: "1px", background: "#3a322c", margin: "28px 0" }} />

      {/* Secondary line — present, not shouting. Supports underneath. */}
      <p
        className="font-mono-light"
        style={{ color: "#9a8d82", fontSize: "13px", lineHeight: 1.7, maxWidth: "320px" }}
      >
        If you want to talk to someone, Lifeline —{" "}
        <a href="tel:131114" style={{ color: "#c9bcb1" }}>
          13 11 14
        </a>
      </p>

      {/* A quiet way out — no CTA styling */}
      <button
        onClick={close}
        className="font-mono-light"
        style={{
          color: "#5f574f",
          fontSize: "13px",
          marginTop: "56px",
          background: "none",
          border: "none",
          cursor: "pointer",
        }}
      >
        Close
      </button>

      {/* The staff long-press is the ONLY automatic-ish exit this screen has —
          it still carries no idle timer (see the note above). */}
      <KioskStaffReset />
    </div>
  );
};

export default Blocked;
