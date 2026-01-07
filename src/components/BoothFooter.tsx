import GuiltyLogo from "./GuiltyLogo";

const BoothFooter = () => {
  return (
    <div className="mt-auto pt-8 flex flex-col items-center gap-4">
      <GuiltyLogo />
      <p className="text-whisper text-[10px] font-mono-light flex items-center gap-2">
        <span className="w-3 h-3 border border-whisper inline-flex items-center justify-center">
          <span className="text-whisper text-[8px]">✓</span>
        </span>
        Consent & Permissions / No names. No harm. No illegal stuff.
      </p>
    </div>
  );
};

export default BoothFooter;
