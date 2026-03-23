import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import suspectsSlide1 from "@/assets/carousel/suspects-1.png";

const slides = [
  { type: "image" as const, src: suspectsSlide1, alt: "GUILTY lifestyle flat lay" },
  { type: "color" as const, color: "bg-red-600" },
  { type: "color" as const, color: "bg-black" },
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
            <div key={i} className="min-w-0 shrink-0 grow-0 basis-full">
              <img
                src={slide.src}
                alt={slide.alt}
                className="w-full h-[50vh] md:h-[70vh] object-cover"
              />
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
