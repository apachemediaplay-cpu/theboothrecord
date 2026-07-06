import { useNavigate } from "react-router-dom";

// HELD (gate-failed neutral state). Same layout as the Safe State, but neutral copy,
// NO Lifeline line (we don't know it's crisis), and a retry option.
const Held = () => {
  const navigate = useNavigate();

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
      <button
        onClick={() => navigate("/receiving")}
        className="font-mono-light"
        style={{ color: "#c9bcb1", fontSize: "13px", background: "none", border: "none", cursor: "pointer" }}
      >
        Try again
      </button>

      {/* Quiet way out */}
      <button
        onClick={() => navigate("/")}
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
    </div>
  );
};

export default Held;
