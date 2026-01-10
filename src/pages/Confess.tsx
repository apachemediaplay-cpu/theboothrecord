import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import BoothHeader from "@/components/BoothHeader";
import BoothFooter from "@/components/BoothFooter";
import { Camera, Mic, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Confess = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [confession, setConfession] = useState("");
  const [interimText, setInterimText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [placeholderText, setPlaceholderText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const fullPlaceholder = "Add a confession to continue";

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Typing animation for placeholder
  useEffect(() => {
    if (confession || interimText) return;
    
    let index = 0;
    setPlaceholderText("");
    
    const typeInterval = setInterval(() => {
      if (index < fullPlaceholder.length) {
        setPlaceholderText(fullPlaceholder.slice(0, index + 1));
        index++;
      } else {
        clearInterval(typeInterval);
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
      <BoothHeader />
      
      <div className="flex-1 flex flex-col justify-center">
        <h2 className="font-control text-3xl md:text-4xl font-bold text-foreground mb-2">
          Confess
        </h2>
        
        <p className="text-muted-foreground text-lg mb-4">
          What did you do?
        </p>
        
        <div className="relative min-h-[120px]">
          <textarea
            ref={textareaRef}
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
              className="absolute top-0 left-0 pointer-events-none text-xl font-mono-light tracking-wide"
              style={{ color: 'rgba(0, 255, 30, 0.3)' }}
            >
              {placeholderText}
            </div>
          )}
        </div>
      </div>
      
      <div className="fixed bottom-32 left-0 right-0 px-6">
        <div className="flex items-center justify-between">
          <button className="p-3 text-muted-foreground hover:text-foreground transition-colors">
            <Camera className="w-6 h-6" />
          </button>
          
          {confession.trim() ? (
            <button 
              onClick={handleSubmit}
              className="p-3 text-foreground hover:text-primary transition-colors"
            >
              <ArrowRight className="w-6 h-6" />
            </button>
          ) : (
            <button 
              onClick={toggleRecording}
              className={`p-3 transition-colors ${
                isRecording 
                  ? 'text-red-500 animate-pulse' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Mic className="w-6 h-6" />
            </button>
          )}
        </div>
      </div>
      
      <BoothFooter />
    </div>
  );
};

export default Confess;
