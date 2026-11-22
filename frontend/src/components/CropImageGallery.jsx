import { useEffect, useRef, useState } from "react";
import {
  useCropImageContentQuery,
  useCropImagesQuery,
} from "../queries/crops";

function CropImageAsset({ cropId, image, alt, enabled }) {
  const imageRef = useRef(null);
  const { data: imageBlob, isLoading, isError } = useCropImageContentQuery(
    cropId,
    image.id,
    enabled,
  );

  useEffect(() => {
    if (!imageBlob || !imageRef.current) return undefined;

    const objectUrl = URL.createObjectURL(imageBlob);
    imageRef.current.src = objectUrl;
    return () => URL.revokeObjectURL(objectUrl);
  }, [imageBlob]);

  if (isError) {
    return (
      <span className="crop-images-gallery__status" role="status">
        Image unavailable
      </span>
    );
  }

  if (isLoading || !imageBlob) {
    return (
      <span className="crop-images-gallery__status" role="status">
        Loading image…
      </span>
    );
  }

  return (
    <img
      ref={imageRef}
      alt={alt}
      loading="lazy"
    />
  );
}

function CropImageGallery({
  cropId,
  alt,
  fallback,
  variant = "gallery",
  eager = false,
  className = "",
}) {
  const galleryRef = useRef(null);
  const [hasEnteredViewport, setHasEnteredViewport] = useState(
    () => eager || typeof IntersectionObserver === "undefined",
  );
  const isVisible = eager || hasEnteredViewport;
  const {
    data: images = [],
    isLoading,
    isError,
  } = useCropImagesQuery(cropId, { enabled: isVisible });
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [slideDirection, setSlideDirection] = useState(null);

  useEffect(() => {
    if (eager) return undefined;

    const target = galleryRef.current;
    if (!target) return undefined;
    if (typeof IntersectionObserver === "undefined") return undefined;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setHasEnteredViewport(true);
        observer.disconnect();
      }
    }, { rootMargin: "160px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [eager]);

  const isCarousel = variant === "carousel";
  const currentImageIndex = images.length
    ? activeImageIndex % images.length
    : 0;
  const displayedImages = isCarousel
    ? images.slice(currentImageIndex, currentImageIndex + 1)
    : variant === "gallery"
      ? images
      : images.slice(0, 1);

  return (
    <div
      ref={galleryRef}
      className={[
        "crop-images-gallery",
        `crop-images-gallery--${variant}`,
        className,
      ].filter(Boolean).join(" ")}
      aria-busy={isLoading}
    >
      {displayedImages.length > 0
        ? displayedImages.map((image) => (
            <div
              className={[
                "crop-images-gallery__item",
                isCarousel && slideDirection
                  ? `crop-images-gallery__item--${slideDirection}`
                  : "",
              ].filter(Boolean).join(" ")}
              key={image.id}
            >
              <CropImageAsset
                cropId={cropId}
                image={image}
                alt={alt}
                enabled={isVisible}
              />
            </div>
          ))
        : fallback}
      {isCarousel && !isLoading && !isError && images.length > 1 && (
        <div className="crop-images-gallery__controls">
          <button
            type="button"
            aria-label="Previous image"
            onClick={() => {
              setSlideDirection("previous");
              setActiveImageIndex(
                (index) => (index - 1 + images.length) % images.length,
              );
            }}
          >
            ‹
          </button>
          <span
            className="crop-images-gallery__count"
            aria-live="polite"
            aria-label={`Image ${currentImageIndex + 1} of ${images.length}`}
          >
            {currentImageIndex + 1} / {images.length}
          </span>
          <button
            type="button"
            aria-label="Next image"
            onClick={() => {
              setSlideDirection("next");
              setActiveImageIndex((index) => (index + 1) % images.length);
            }}
          >
            ›
          </button>
        </div>
      )}
      {isVisible && isLoading && images.length === 0 && (
        <span className="crop-images-gallery__status" role="status">
          Loading images…
        </span>
      )}
      {isVisible && isError && (
        <span className="crop-images-gallery__status" role="status">
          Crop images unavailable
        </span>
      )}
      {isVisible && !isLoading && !isError && images.length === 0 && (
        <span className="sr-only">No uploaded images.</span>
      )}
    </div>
  );
}

export default CropImageGallery;
