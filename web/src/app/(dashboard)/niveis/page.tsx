"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Scale, Trophy, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { evaluationConfigApi, levelConfigApi } from "@/lib/api";
import type { LevelConfig } from "@/lib/api/evaluation";

function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

const LEVEL_COLOR: Record<string, string> = {
  bronze: "text-[#CD7F32]",
  prata: "text-[#8E8E93]",
  ouro: "text-[#E0A800]",
};

// ============================================================
// Pesos das 3 fontes
// ============================================================

function WeightsCard() {
  const [system, setSystem] = useState(34);
  const [client, setClient] = useState(33);
  const [quality, setQuality] = useState(33);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    evaluationConfigApi
      .get()
      .then((w) => {
        setSystem(w.weight_system);
        setClient(w.weight_client);
        setQuality(w.weight_quality);
      })
      .catch((err: unknown) => toast.error(errMsg(err, "Erro ao carregar pesos")))
      .finally(() => setLoading(false));
  }, []);

  const total = system + client + quality;

  async function save() {
    if (total !== 100) {
      toast.error("Os pesos devem somar 100");
      return;
    }
    setSaving(true);
    try {
      await evaluationConfigApi.update({
        weight_system: system,
        weight_client: client,
        weight_quality: quality,
      });
      toast.success("Pesos salvos");
    } catch (err: unknown) {
      toast.error(errMsg(err, "Erro ao salvar pesos"));
    } finally {
      setSaving(false);
    }
  }

  const fields: Array<{ label: string; value: number; set: (n: number) => void }> = [
    { label: "Sistema (operacional)", value: system, set: setSystem },
    { label: "Cliente (experiência)", value: client, set: setClient },
    { label: "Qualidade (técnica)", value: quality, set: setQuality },
  ];

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Pesos da avaliação</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Quanto cada fonte pesa no score final do profissional. Os três
          devem somar 100.
        </p>

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {fields.map((f) => (
                <div key={f.label} className="space-y-2">
                  <label className="text-sm font-medium text-foreground/80">
                    {f.label}
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={f.value}
                    onChange={(e) =>
                      f.set(Math.max(0, parseInt(e.target.value, 10) || 0))
                    }
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <span
                className={cn(
                  "text-sm font-medium",
                  total === 100 ? "text-green-600" : "text-destructive"
                )}
              >
                Total: {total}/100
              </span>
              <Button onClick={save} isLoading={saving} disabled={total !== 100}>
                Salvar pesos
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// Critérios dos níveis
// ============================================================

function LevelsCard() {
  const [levels, setLevels] = useState<LevelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setLevels(await levelConfigApi.list());
    } catch (err: unknown) {
      toast.error(errMsg(err, "Erro ao carregar níveis"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function patch(level: string, field: keyof LevelConfig, value: number | boolean) {
    setLevels((prev) =>
      prev.map((l) => (l.level === level ? { ...l, [field]: value } : l))
    );
  }

  async function save() {
    setSaving(true);
    try {
      await levelConfigApi.update(
        levels.map((l) => ({
          level: l.level,
          min_overall_score: l.min_overall_score,
          min_specialties: l.min_specialties,
          min_certifications: l.min_certifications,
          min_days_active: l.min_days_active,
          requires_certification: l.requires_certification,
        }))
      );
      toast.success("Critérios dos níveis salvos");
      load();
    } catch (err: unknown) {
      toast.error(errMsg(err, "Erro ao salvar níveis"));
    } finally {
      setSaving(false);
    }
  }

  const numFields: Array<{ key: keyof LevelConfig; label: string }> = [
    { key: "min_overall_score", label: "Score mínimo (0-100)" },
    { key: "min_specialties", label: "Especialidades mín." },
    { key: "min_certifications", label: "Certificações mín." },
    { key: "min_days_active", label: "Dias de casa mín." },
  ];

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Critérios dos níveis</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          O que o profissional precisa atingir para alcançar cada nível. O
          maior nível cujos critérios forem todos cumpridos é o nível dele.
        </p>

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              {levels.map((l) => (
                <div
                  key={l.level}
                  className="space-y-3 rounded-xl border bg-background p-4"
                >
                  <div className="flex items-center gap-2">
                    <Trophy className={cn("h-4 w-4", LEVEL_COLOR[l.level])} />
                    <h3 className="font-semibold">{l.label}</h3>
                  </div>
                  {numFields.map((f) => (
                    <div key={f.key} className="space-y-1">
                      <label className="text-xs text-muted-foreground">
                        {f.label}
                      </label>
                      <Input
                        type="number"
                        min={0}
                        className="h-9"
                        value={l[f.key] as number}
                        onChange={(e) =>
                          patch(
                            l.level,
                            f.key,
                            Math.max(0, parseFloat(e.target.value) || 0)
                          )
                        }
                      />
                    </div>
                  ))}
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={l.requires_certification}
                      onChange={(e) =>
                        patch(
                          l.level,
                          "requires_certification",
                          e.target.checked
                        )
                      }
                      className="h-4 w-4 rounded border-input accent-primary"
                    />
                    <span>Exige certificação Reallliza</span>
                  </label>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <AlertCircle className="h-3.5 w-3.5" />
                A contagem de certificações depende da sincronização de
                certificados (em definição com o José).
              </p>
              <Button onClick={save} isLoading={saving}>
                Salvar níveis
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// Página
// ============================================================

export default function NiveisPage() {
  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-1"
      >
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
          Níveis e Avaliação
        </h1>
        <p className="text-muted-foreground">
          Pesos das 3 fontes de avaliação e critérios dos níveis Bronze,
          Prata e Ouro.
        </p>
      </motion.div>

      <WeightsCard />
      <LevelsCard />
    </div>
  );
}
