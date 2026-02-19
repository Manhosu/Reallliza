"use client";

import { useState, useEffect } from "react";
import { Shield, MapPin, Camera, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { consentApi } from "@/lib/api";
import { UserRole } from "@/lib/types";

// ============================================================
// Terms Acceptance Modal
// ============================================================

export function TermsModal() {
  const user = useAuthStore((s) => s.user);

  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Checkbox states
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [locationConsent, setLocationConsent] = useState(false);
  const [imageConsent, setImageConsent] = useState(false);

  const isTechnician = user?.role === UserRole.TECHNICIAN;

  // Check consent status on mount
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const checkConsent = async () => {
      try {
        const result = await consentApi.getStatus();
        if (!cancelled) {
          if (!result.has_accepted) {
            setShowModal(true);
          }
        }
      } catch {
        // If we cannot check consent, do not block the user
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    checkConsent();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const canSubmit = isTechnician
    ? termsAccepted && locationConsent && imageConsent
    : termsAccepted;

  const handleAccept = async () => {
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      await consentApi.acceptTerms({
        location_consent: locationConsent,
        image_consent: imageConsent,
        terms_version: "1.0",
      });
      setShowModal(false);
    } catch {
      // Allow retry on failure -- modal stays open
    } finally {
      setSubmitting(false);
    }
  };

  // Do not render anything while loading or if modal should not show
  if (loading || !showModal) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-lg rounded-2xl border bg-card p-6 shadow-2xl sm:p-8">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Termos de Uso e Politica de Privacidade
            </h2>
            <p className="text-sm text-muted-foreground">
              Aceite os termos para continuar
            </p>
          </div>
        </div>

        {/* Description */}
        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
          Para continuar usando o sistema, voce precisa aceitar nossos termos.
          Leia atentamente cada item abaixo e marque as opcoes correspondentes.
        </p>

        {/* Checkboxes */}
        <div className="mb-6 space-y-4">
          {/* Terms checkbox (always required) */}
          <label
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors",
              termsAccepted
                ? "border-primary/40 bg-primary/5"
                : "border-border hover:border-primary/20"
            )}
          >
            <div className="pt-0.5">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="sr-only"
              />
              <div
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors",
                  termsAccepted
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-muted-foreground/30"
                )}
              >
                {termsAccepted && <CheckCircle2 className="h-3.5 w-3.5" />}
              </div>
            </div>
            <div className="flex-1">
              <span className="text-sm font-medium text-foreground">
                Li e aceito os Termos de Uso e Politica de Privacidade
              </span>
              <span className="ml-1 text-xs text-destructive">*</span>
            </div>
          </label>

          {/* Location consent (required for technicians) */}
          <label
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors",
              locationConsent
                ? "border-primary/40 bg-primary/5"
                : "border-border hover:border-primary/20"
            )}
          >
            <div className="pt-0.5">
              <input
                type="checkbox"
                checked={locationConsent}
                onChange={(e) => setLocationConsent(e.target.checked)}
                className="sr-only"
              />
              <div
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors",
                  locationConsent
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-muted-foreground/30"
                )}
              >
                {locationConsent && <MapPin className="h-3.5 w-3.5" />}
              </div>
            </div>
            <div className="flex-1">
              <span className="text-sm font-medium text-foreground">
                Autorizo o uso de localizacao para fins operacionais
              </span>
              {isTechnician && (
                <span className="ml-1 text-xs text-destructive">*</span>
              )}
            </div>
          </label>

          {/* Image consent (required for technicians) */}
          <label
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors",
              imageConsent
                ? "border-primary/40 bg-primary/5"
                : "border-border hover:border-primary/20"
            )}
          >
            <div className="pt-0.5">
              <input
                type="checkbox"
                checked={imageConsent}
                onChange={(e) => setImageConsent(e.target.checked)}
                className="sr-only"
              />
              <div
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors",
                  imageConsent
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-muted-foreground/30"
                )}
              >
                {imageConsent && <Camera className="h-3.5 w-3.5" />}
              </div>
            </div>
            <div className="flex-1">
              <span className="text-sm font-medium text-foreground">
                Autorizo o uso de imagem para identificacao profissional
              </span>
              {isTechnician && (
                <span className="ml-1 text-xs text-destructive">*</span>
              )}
            </div>
          </label>
        </div>

        {/* Required fields note */}
        <p className="mb-4 text-xs text-muted-foreground">
          <span className="text-destructive">*</span> Campos obrigatorios
          {isTechnician && " para tecnicos"}
        </p>

        {/* Submit button */}
        <Button
          className="w-full"
          size="lg"
          disabled={!canSubmit || submitting}
          onClick={handleAccept}
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Processando...
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Aceitar e Continuar
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
