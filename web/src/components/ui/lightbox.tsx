"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";

interface LightboxImage {
  src: string;
  alt?: string;
  caption?: string;
}

interface LightboxProps {
  images: LightboxImage[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
}

export type { LightboxImage };

export function Lightbox({ images, initialIndex = 0, isOpen, onClose }: LightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  useEffect(() => {
    setZoom(1);
  }, [currentIndex]);

  const goNext = useCallback(() => {
    setCurrentIndex((i) => (i + 1) % images.length);
  }, [images.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => (i - 1 + images.length) % images.length);
  }, [images.length]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose, goNext, goPrev]);

  // Lock body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!mounted || !isOpen || images.length === 0) return null;

  const current = images[currentIndex];

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm"
        onClick={onClose}
      >
        {/* Top bar */}
        <div
          className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 z-10"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="text-sm text-white/70">
            {currentIndex + 1} / {images.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
              className="rounded-lg bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <button
              onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
              className="rounded-lg bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              className="rounded-lg bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Image */}
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="relative max-h-[80vh] max-w-[90vw]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current.src}
            alt={current.alt || ""}
            className="max-h-[80vh] max-w-[90vw] object-contain transition-transform duration-200"
            style={{ transform: `scale(${zoom})` }}
          />
        </motion.div>

        {/* Caption */}
        {current.caption && (
          <div
            className="absolute bottom-16 left-0 right-0 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-white/80">{current.caption}</p>
          </div>
        )}

        {/* Prev/Next buttons */}
        {images.length > 1 && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                goPrev();
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 transition-colors"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                goNext();
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 transition-colors"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}

        {/* Thumbnails */}
        {images.length > 1 && (
          <div
            className="absolute bottom-4 left-0 right-0 flex justify-center gap-2 px-4"
            onClick={(e) => e.stopPropagation()}
          >
            {images.map((img, i) => (
              <button
                key={i}
                onClick={() => setCurrentIndex(i)}
                className={`h-12 w-12 overflow-hidden rounded-lg border-2 transition-all ${
                  i === currentIndex
                    ? "border-primary opacity-100"
                    : "border-transparent opacity-50 hover:opacity-75"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.src} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
