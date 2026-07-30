import { useState, useRef, useEffect } from "react";
import { useNavigate, Navigate, Link } from "react-router-dom";
import BoothFooter from "@/components/BoothFooter";
import { Camera } from "lucide-react";
import micButtonSvg from "@/assets/mic-button.svg";
import enterArrowSvg from "@/assets/enter-arrow.svg";
import { useToast } from "@/hooks/use-toast";
import { captureSourceFromUrl, promptFromVenue, DEFAULT_PROMPT } from "@/lib/source";
import { fetchVenueConfig, getPlaceholderLines } from "@/lib/registers";

const Confess = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  // Resolve the venue from stored session state, NOT the live URL: capture once on
  // arrival (?source= present), then fall back to the stored value on repeat
  // confessions ("go deeper"), whose URL has no ?source=. This keeps BOTH the venue
  // prompt and the source persisted to the row correct across repeats — the same
  // stored source Receiving.tsx writes to every insert.
  const [source] = useState(() => captureSourceFromUrl());
  // Greeting now comes from public.venues (headline/guidance), resolved by the same
  // async venues lookup as the register below. Starts on the DEFAULT_PROMPT fail-safe
  // and swaps in the venue greeting when the lookup lands — identical lifecycle to
  // the placeholder set, and every failure path stays on the default.
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [confession, setConfession] = useState("");
  const [interimText, setInterimText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [placeholderText, setPlaceholderText] = useState("");
  const [typingComplete, setTypingComplete] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Placeholder set by venue register: starts on DTC, swaps in the venue's set when
  // the venues lookup resolves. Content only — rotation/typing stay as-is. Any
  // lookup failure resolves to null → getPlaceholderLines → DTC (never empty).
  const [placeholderLines, setPlaceholderLines] = useState(() => getPlaceholderLines(null));
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchVenueConfig(source).then((cfg) => {
      if (cancelled) return;
      setPlaceholderLines(getPlaceholderLines(cfg.register));
      setPrompt(promptFromVenue(cfg.headline, cfg.guidance));
    });
    return () => {
      cancelled = true;
    };
  }, [source]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Auto-grow the textarea to its content so the hairline under the field sits
  // directly below the last line of text and moves down as the confession wraps.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [confession, interimText]);

  // The previous confession's leftovers must be cleared before a new one starts,
  // or /verdict can briefly render the OLD verdict while the new one is in flight.
  // This used to live in Verdict.tsx's handleConfessAgain, which is being removed —
  // so it moves here, where EVERY route into the booth passes through (wall CTA,
  // fresh QR scan, bookmark, /return).
  //
  // THREE keys only. DO NOT clear "venueName".
  // captureSourceFromUrl() writes venueName from ?venue= on a fresh scan and this
  // effect runs after it — clearing it here would wipe the venue on a genuine QR
  // scan and print LOCATION WITHHELD instead of AT HIGHBALL.
  // "source", "is_test", "consent" and "booth_session_id" must also survive.
  useEffect(() => {
    sessionStorage.removeItem("confession");
    sessionStorage.removeItem("subjectNumber");
    sessionStorage.removeItem("verdictSource");
  }, []);

  // Typing animation for placeholder: type the current line, hold ~2s, then
  // advance to the next line (looping), which re-runs this effect and retypes.
  useEffect(() => {
    if (confession || interimText) return;

    const line = placeholderLines[placeholderIndex];
    let index = 0;
    let holdTimeout: number | undefined;
    setPlaceholderText("");
    setTypingComplete(false);

    const typeInterval = setInterval(() => {
      if (index < line.length) {
        setPlaceholderText(line.slice(0, index + 1));
        index++;
      } else {
        clearInterval(typeInterval);
        setTypingComplete(true);
        holdTimeout = window.setTimeout(() => {
          setPlaceholderIndex((i) => (i + 1) % placeholderLines.length);
        }, 2000);
      }
    }, 50);

    return () => {
      clearInterval(typeInterval);
      window.clearTimeout(holdTimeout);
    };
    // placeholderLines is state now (register lookup can swap the set mid-type);
    // including it restarts the current line from the NEW set on swap, so DTC and
    // venue lines never interleave. Identity only changes when the lookup resolves.
  }, [confession, interimText, placeholderIndex, placeholderLines]);

  useEffect(() => {
    // Check for browser support
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (SpeechRecognitionAPI) {
      const recognition = new SpeechRecognitionAPI() as SpeechRecognition;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        // Show interim text immediately for real-time feedback
        setInterimText(interimTranscript);

        // Append final transcript to confession
        if (finalTranscript) {
          setConfession(prev => prev + (prev ? ' ' : '') + finalTranscript);
          setInterimText('');
        }
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
        toast({
          title: "Voice recognition error",
          description: "Please try again or type your confession.",
          variant: "destructive",
        });
      };

      recognition.onend = () => {
        setIsRecording(false);
        setInterimText('');
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [toast]);

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      toast({
        title: "Not supported",
        description: "Voice recognition is not supported in your browser.",
        variant: "destructive",
      });
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      recognitionRef.current.start();
      setIsRecording(true);
    }
  };

  const handleSubmit = () => {
    if (confession.trim()) {
      sessionStorage.setItem("confession", confession);
      navigate("/receiving");
    }
  };

  // Consent gate is required for EVERY entry path, including QR scans that deep-link to
  // /confess?source=... The source + ?test=1 have already been captured above (the
  // captureSourceFromUrl in the useState initializer runs before this return), so
  // redirecting to the gate never loses the venue tag; after ENTER the flow returns here
  // and the venue prompt + attribution persist from session state.
  if (sessionStorage.getItem("consent") !== "1") {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="screen-container animate-fade-in">
      {/* Listening status line — occupies the SAME fixed top slot BoothHeader uses on the
          gate (same top margin + left edge), so the gate's "Location: X" hands off to this
          on /confess. Confess-only: deliberately not on gate, receiving, verdict or the wall. */}
      <div className="fixed top-0 left-0 right-0 pt-6 pb-4">
        <div className="max-w-md mx-auto px-6">
          <p className="flex items-center gap-2 text-[13px] font-mono-light tracking-wide text-ritual">
            <span className="listen-glow-dot inline-block w-[7px] h-[7px] rounded-full bg-[hsl(var(--ritual-green))]" />
            <span className="listen-glow-text">
              the booth is listening
            </span>
          </p>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-start pt-16">
        <h2 className="font-control text-3xl md:text-4xl font-bold text-foreground mb-2">
          {prompt.headline}
        </h2>

        {prompt.guidance ? (
          <p className="text-muted-foreground text-lg mb-4">
            {prompt.guidance}
          </p>
        ) : null}
        
        <div className="relative min-h-[120px]">
          <textarea
            ref={textareaRef}
            maxLength={140}
            value={confession + (interimText ? (confession ? ' ' : '') + interimText : '')}
            onChange={(e) => {
              if (!isRecording) {
                setConfession(e.target.value);
              }
            }}
            placeholder=""
            className="w-full bg-transparent text-ritual text-xl font-mono-light tracking-wide resize-none outline-none border-0 border-b border-border/40 pb-2 overflow-hidden"
            rows={2}
            readOnly={isRecording}
          />
          {!confession && !interimText && (
            <div 
              className={`absolute top-0 left-0 pointer-events-none text-xl font-mono-light tracking-wide ${typingComplete ? 'animate-[pulse_3s_ease-in-out_infinite]' : ''}`}
              style={{ color: 'rgba(0, 255, 30, 0.3)' }}
            >
              {placeholderText}
              <span className="animate-[pulse_1.2s_ease-in-out_infinite]">|</span>
            </div>
          )}
        </div>
      </div>
      
      <div className="fixed bottom-32 left-0 right-0 px-6">
        <p className="text-muted-foreground/70 text-[10px] font-mono-light text-center mb-3">
          18+ only. By confessing you agree to the{" "}
          <Link to="/terms" className="underline underline-offset-2 hover:text-foreground">Terms</Link>
          {" "}&amp;{" "}
          <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground">Privacy</Link>.
        </p>
        <div className="flex items-center justify-between">
          <button className="p-3 text-muted-foreground hover:text-foreground transition-colors">
            {/* <Camera className="w-6 h-6" /> */}
          </button>
          
          {confession.trim() ? (
            <button 
              onClick={handleSubmit}
              className="transition-colors opacity-90 hover:opacity-100"
            >
              <img src={enterArrowSvg} alt="Submit" className="w-[34px] h-[34px]" />
            </button>
          ) : (
            <button 
              onClick={toggleRecording}
              className={`transition-colors ${
                isRecording 
                  ? 'animate-pulse opacity-80' 
                  : 'opacity-70 hover:opacity-100'
              }`}
            >
              <img src={micButtonSvg} alt="Microphone" className="w-[34px] h-[34px]" />
            </button>
          )}
        </div>
      </div>
      
      <BoothFooter />
    </div>
  );
};

export default Confess;
