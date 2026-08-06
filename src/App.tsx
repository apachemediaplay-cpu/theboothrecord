import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { captureSourceFromUrl } from "@/lib/source";

import Index from "./pages/Index";
import Confess from "./pages/Confess";
import Receiving from "./pages/Receiving";
import Verdict from "./pages/Verdict";
import Blocked from "./pages/Blocked";
import Held from "./pages/Held";
import Privacy from "./pages/Privacy";
import Support from "./pages/Support";
import Terms from "./pages/Terms";
import Return from "./pages/Return";
import Summon from "./pages/Summon";
import Answer from "./pages/Answer";
import Landing from "./pages/Landing";
// import PasswordGate from "./components/PasswordGate";


// import Home from "./pages/Home";
import TheWall from "./pages/TheWall";
import Moderate from "./pages/Moderate";
import VerdictShare from "./pages/VerdictShare";
import RoundStart from "./pages/RoundStart";
import RoundPass from "./pages/RoundPass";
import RoundDeliberating from "./pages/RoundDeliberating";
import RoundReveal from "./pages/RoundReveal";
import RoundStrip from "./pages/RoundStrip";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => {
  // Venue attribution: capture ?source= on every full load, before any confession.
  // Param always overwrites stored; no param falls back to stored.
  useEffect(() => {
    captureSourceFromUrl();
  }, []);

  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* <Route path="/" element={<PasswordGate><Home /></PasswordGate>} /> */}
          <Route path="/" element={<Index />} />
          {/* The threshold screen is merged into the gate (/) — this redirect keeps
              old links working without sitting in back-button history. */}
          <Route path="/confidentiality" element={<Navigate to="/" replace />} />
          <Route path="/confess" element={<Confess />} />
          <Route path="/receiving" element={<Receiving />} />
          {/* The round — group format. /confess is SHARED with solo (round
              mode via the round module, not the URL); these are the screens
              around it. Guards inside each redirect stray deep-links back to
              /round, so none of these 404 or render on stale state. */}
          <Route path="/round" element={<RoundStart />} />
          <Route path="/round/pass" element={<RoundPass />} />
          <Route path="/round/deliberating" element={<RoundDeliberating />} />
          <Route path="/round/reveal" element={<RoundReveal />} />
          <Route path="/round/strip" element={<RoundStrip />} />
          <Route path="/verdict" element={<Verdict />} />
          <Route path="/blocked" element={<Blocked />} />
          <Route path="/held" element={<Held />} />
          <Route path="/return" element={<Return />} />
          <Route path="/summon" element={<Summon />} />
          <Route path="/answer" element={<Answer />} />
          <Route path="/landing" element={<Landing />} />
          <Route path="/thewall" element={<TheWall />} />
          {/* Venue view of the record: same component, param-gated. Unknown
              slugs and venues with <3 approved rows redirect back to /thewall
              inside TheWall — this route never 404s. */}
          <Route path="/record/:venue" element={<TheWall />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/support" element={<Support />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/console" element={<Moderate />} />
          <Route path="/v/:id" element={<VerdictShare />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
