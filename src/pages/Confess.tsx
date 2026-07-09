import { useState, useRef, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import BoothFooter from "@/components/BoothFooter";
import { Camera } from "lucide-react";
import micButtonSvg from "@/assets/mic-button.svg";
import enterArrowSvg from "@/assets/enter-arrow.svg";
import { useToast } from "@/hooks/use-toast";
import { captureSourceFromUrl, getPrompt } from "@/lib/source";

const Confess = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  // Resolve the venue from stored session state, NOT the live URL: capture once on
  // arrival (?source= present), then fall back to the stored value on repeat
  // confessions ("go deeper"), whose URL has no ?source=. This keeps BOTH the venue
  // prompt and the source persisted to the row correct across repeats — the same
  // stored source Receiving.tsx writes to every insert.
  const [source] = useState(() => captureSourceFromUrl());
  const prompt = getPrompt(source);
  const [confession, setConfession] = useState("");
  const [interimText, setInterimText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [placeholderText, setPlaceholderText] = useState("");
  const [typingComplete, setTypingComplete] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const fullPlaceholder = "Begin your confession...";

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Typing animation for placeholder
  useEffect(() => {
    if (confession || interimText) return;
    
    let index = 0;
    setPlaceholderText("");
    setTypingComplete(false);
    
    const typeInterval = setInterval(() => {
      if (index < fullPlaceholder.length) {
        setPlaceholderText(fullPlaceholder.slice(0, index + 1));
        index++;
      } else {
        clearInterval(typeInterval);
        setTypingComplete(true);
      }
    }, 50);

    return () => clearInterval(typeInterval);
  }, [confession, interimText]);

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

  return (
    <div className="screen-container animate-fade-in">
      <div className="flex-1 flex flex-col justify-center">
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
            maxLength={300}
            value={confession + (interimText ? (confession ? ' ' : '') + interimText : '')}
            onChange={(e) => {
              if (!isRecording) {
                setConfession(e.target.value);
              }
            }}
            placeholder=""
            className="w-full bg-transparent text-ritual text-xl font-mono-light tracking-wide resize-none outline-none border-none min-h-[120px]"
            rows={4}
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
