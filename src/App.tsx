import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Index from "./pages/Index";
import Confidentiality from "./pages/Confidentiality";
import Confess from "./pages/Confess";
import Receiving from "./pages/Receiving";
import Verdict from "./pages/Verdict";
import Return from "./pages/Return";
import Summon from "./pages/Summon";
import Answer from "./pages/Answer";
import Landing from "./pages/Landing";
import Retail from "./pages/Retail";
import World from "./pages/World";
import TheWall from "./pages/TheWall";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/confidentiality" element={<Confidentiality />} />
          <Route path="/confess" element={<Confess />} />
          <Route path="/receiving" element={<Receiving />} />
          <Route path="/verdict" element={<Verdict />} />
          <Route path="/return" element={<Return />} />
          <Route path="/summon" element={<Summon />} />
          <Route path="/answer" element={<Answer />} />
          <Route path="/landing" element={<Landing />} />
          <Route path="/retail" element={<Retail />} />
          <Route path="/thewall" element={<TheWall />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
