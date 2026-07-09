import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { captureSourceFromUrl } from "@/lib/source";

import Index from "./pages/Index";
import Confidentiality from "./pages/Confidentiality";
import Confess from "./pages/Confess";
import Receiving from "./pages/Receiving";
import Verdict from "./pages/Verdict";
import Blocked from "./pages/Blocked";
import Held from "./pages/Held";
import Privacy from "./pages/Privacy";
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
          <Route path="/confidentiality" element={<Confidentiality />} />
          <Route path="/confess" element={<Confess />} />
          <Route path="/receiving" element={<Receiving />} />
          <Route path="/verdict" element={<Verdict />} />
          <Route path="/blocked" element={<Blocked />} />
          <Route path="/held" element={<Held />} />
          <Route path="/return" element={<Return />} />
          <Route path="/summon" element={<Summon />} />
          <Route path="/answer" element={<Answer />} />
          <Route path="/landing" element={<Landing />} />
          <Route path="/thewall" element={<TheWall />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/moderate" element={<Moderate />} />
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
