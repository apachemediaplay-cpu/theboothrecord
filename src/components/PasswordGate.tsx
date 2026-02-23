import { useState, useEffect } from "react";
import GuiltyLogo from "@/components/GuiltyLogo";

const SITE_PASSWORD = "Matthew";

const PasswordGate = ({ children }: { children: React.ReactNode }) => {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("guilty_auth") === "true") {
      setAuthenticated(true);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === SITE_PASSWORD) {
      sessionStorage.setItem("guilty_auth", "true");
      setAuthenticated(true);
    } else {
      setError(true);
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
  };

  if (authenticated) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 bg-background">
      <div className="max-w-md w-full flex flex-col items-center gap-10">
        <GuiltyLogo />

        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-6">
          <div className={`transition-transform ${shake ? "animate-shake" : ""}`}>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(false);
              }}
              placeholder="Enter password"
              autoFocus
              className="w-full bg-transparent border-b border-muted-foreground py-3 text-lg tracking-widest text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground transition-colors font-mono"
            />
            {error && (
              <p className="text-destructive text-sm mt-2 tracking-wider font-mono">
                Access denied.
              </p>
            )}
          </div>

          <button type="submit" className="btn-booth-primary">
            ENTER
          </button>
        </form>
      </div>
    </div>
  );
};

export default PasswordGate;
