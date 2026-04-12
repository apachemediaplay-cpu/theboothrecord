import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import suspectsSlide1 from "@/assets/carousel/suspects-1.png";
import suspectsSlide2 from "@/assets/carousel/suspects-2.png";
import suspectsSlide3 from "@/assets/carousel/suspects-3.png";
import guiltyGOrange from "@/assets/guilty-g-orange.svg";

const slides = [
  { type: "image" as const, src: suspectsSlide1, alt: "GUILTY lifestyle flat lay" },
  { type: "image" as const, src: suspectsSlide2, alt: "GUILTY Bitter Justice campaign" },
  { type: "image" as const, src: suspectsSlide3, alt: "GUILTY Cola Vice interrogation" },
];

const SuspectsCarousel = () => {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true }, [
    Autoplay({ delay: 4000, stopOnInteraction: false }),
  ]);
  const [activeSlide, setActiveSlide] = useState(0);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setActiveSlide(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect);
    return () => { emblaApi.off("select", onSelect); };
  }, [emblaApi, onSelect]);

  return (
    <div className="w-full">
      <div ref={emblaRef} className="overflow-hidden">
        <div className="flex">
          {slides.map((slide, i) => (
            <div key={i} className="min-w-0 shrink-0 grow-0 basis-full relative">
              <img
                src={slide.src}
                alt={slide.alt}
                className="w-full h-[50vh] md:h-[70vh] object-cover"
              />
              {/* Slide 1 text overlay */}
              {i === 0 && (
                <>
                  <p className="absolute top-4 md:top-8 left-4 md:left-8 font-mono text-white text-xs md:text-sm tracking-wide" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.6)' }}>
                    Carrying soda into a designated wellness facility
                  </p>
                  <img src={guiltyGOrange} alt="GUILTY G" className="absolute bottom-[calc(3rem+5.5rem)] md:bottom-[calc(4rem+6.5rem)] left-4 md:left-8 w-10 h-10 md:w-14 md:h-14" />
                  <div className="absolute bottom-12 md:bottom-16 left-4 md:left-8 bg-white text-neutral-900 px-4 md:px-6 py-3 md:py-4 max-w-xs md:max-w-sm">
                    <p className="font-mono text-xs md:text-sm font-bold tracking-wide uppercase">Citrus Confessional</p>
                    <p className="font-mono text-[10px] md:text-xs tracking-wide uppercase mt-0.5">Lemon · Yuzu</p>
                    <p className="font-mono text-[10px] md:text-xs mt-1 tracking-wide">Nothing to declare. Everything to confess.</p>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-black/80 px-4 md:px-8 py-2 md:py-3">
                    <p className="font-mono text-white text-[8px] md:text-[10px] tracking-[0.2em] uppercase">
                      Location: International Airport Terminal • Security Screening Zone Time: 07:18 (+1 Min) Officer: Airport Security Personnel
                    </p>
                  </div>
                </>
              )}
              {/* Slide 2 text overlay */}
              {i === 1 && (
                <>
                  <img src={guiltyGOrange} alt="GUILTY G" className="absolute bottom-[calc(3rem+5.5rem)] md:bottom-[calc(4rem+6.5rem)] right-4 md:right-8 w-10 h-10 md:w-14 md:h-14" />
                  <div className="absolute bottom-12 md:bottom-16 right-4 md:right-8 bg-white text-neutral-900 px-4 md:px-6 py-3 md:py-4 max-w-xs md:max-w-sm">
                    <p className="font-mono text-xs md:text-sm font-bold tracking-wide uppercase">Bitter Justice</p>
                    <p className="font-mono text-[10px] md:text-xs tracking-wide uppercase mt-0.5">Blood Orange · Ginger</p>
                    <p className="font-mono text-[10px] md:text-xs mt-1 tracking-wide">Justice rarely tastes sweet.</p>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-black/80 px-4 md:px-8 py-2 md:py-3">
                    <p className="font-mono text-white text-[8px] md:text-[10px] tracking-[0.2em] uppercase">
                      Location: Federal Courthouse • Press Conference Zone Time: 14:32 (+3 Min) Witness: State Media Correspondent
                    </p>
                  </div>
                </>
              )}
              {/* Slide 3 text overlay */}
              {i === 2 && (
                <>
                  <img src={guiltyGOrange} alt="GUILTY G" className="absolute bottom-[calc(3rem+5.5rem)] md:bottom-[calc(4rem+6.5rem)] left-4 md:left-8 w-10 h-10 md:w-14 md:h-14" />
                  <div className="absolute bottom-12 md:bottom-16 left-4 md:left-8 bg-white text-neutral-900 px-4 md:px-6 py-3 md:py-4 max-w-xs md:max-w-sm">
                    <p className="font-mono text-xs md:text-sm font-bold tracking-wide uppercase">Cola Vice</p>
                    <p className="font-mono text-[10px] md:text-xs tracking-wide uppercase mt-0.5">Spiced Cola</p>
                    <p className="font-mono text-[10px] md:text-xs mt-1 tracking-wide">Some habits never get acquitted.</p>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-black/80 px-4 md:px-8 py-2 md:py-3">
                    <p className="font-mono text-white text-[8px] md:text-[10px] tracking-[0.2em] uppercase">
                      Location: Precinct Interrogation Room • Interview Suite B Time: 22:47 (+6 Min) Officer: Lead Detective
                    </p>
                  </div>
                </>
              )
            </div>
          ))}
        </div>
      </div>
      {/* Dots */}
      <div className="flex justify-center gap-2 mt-4">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => emblaApi?.scrollTo(i)}
            className={`w-2 h-2 rounded-full transition-all duration-300 ${
              i === activeSlide ? "bg-neutral-900 w-6" : "bg-neutral-300"
            }`}
            aria-label={`Go to slide ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
};

export default SuspectsCarousel;
