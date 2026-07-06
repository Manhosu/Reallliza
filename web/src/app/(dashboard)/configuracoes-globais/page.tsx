"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Settings,
  Building2,
  MapPin,
  Calendar,
  Download,
  Save,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface CompanySettings {
  id: string;
  base_address: string | null;
  base_state: string | null;
  base_lat: number | null;
  base_lng: number | null;
  price_per_km: number;
  special_hour_multiplier: number;
  platform_fee_pct: number;
  business_hour_start: string;
  business_hour_end: string;
  coverage_radius_km: number;
  max_service_hours_no_stay: number;
}

interface StayRate {
  state: string;
  state_name: string;
  daily_rate: number;
  is_active: boolean;
}

interface Holiday {
  date: string;
  name: string;
  state: string | null;
  is_national: boolean;
  is_active: boolean;
  source: string;
}

type Tab = "company" | "states" | "holidays";

export default function ConfiguracoesGlobaisPage() {
  const [tab, setTab] = useState<Tab>("company");

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
          Configurações Globais
        </h1>
        <p className="text-muted-foreground">
          Parâmetros do sistema usados em todos os orçamentos e cálculos.
        </p>
      </motion.div>

      <div className="flex gap-1 rounded-xl bg-secondary/50 p-1">
        {[
          { key: "company" as Tab, label: "Empresa", icon: Building2 },
          { key: "states" as Tab, label: "Estadias por UF", icon: MapPin },
          { key: "holidays" as Tab, label: "Feriados", icon: Calendar },
        ].map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "company" && <CompanyTab />}
      {tab === "states" && <StatesTab />}
      {tab === "holidays" && <HolidaysTab />}
    </div>
  );
}

// ============================================================
// Tab 1: Empresa
// ============================================================

function CompanyTab() {
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiClient.get<CompanySettings>("/company-settings");
      setSettings(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await apiClient.patch<CompanySettings>("/company-settings", {
        base_address: settings.base_address,
        base_state: settings.base_state,
        price_per_km: settings.price_per_km,
        special_hour_multiplier: settings.special_hour_multiplier,
        platform_fee_pct: settings.platform_fee_pct,
        business_hour_start: settings.business_hour_start,
        business_hour_end: settings.business_hour_end,
        coverage_radius_km: settings.coverage_radius_km,
        max_service_hours_no_stay: settings.max_service_hours_no_stay,
      });
      setSettings(updated);
      toast.success("Configurações salvas");
      if (updated.base_lat && updated.base_lng) {
        toast.info(
          `Endereço geocodificado: ${updated.base_lat.toFixed(4)}, ${updated.base_lng.toFixed(4)}`
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  if (isLoading || !settings) {
    return <Skeleton className="h-96 w-full rounded-xl" />;
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="space-y-2">
          <label className="text-sm font-medium">Endereço base da Reallliza</label>
          <Input
            value={settings.base_address ?? ""}
            onChange={(e) =>
              setSettings({ ...settings, base_address: e.target.value })
            }
            placeholder="Av. Brasil, 1234 - Centro - São Paulo/SP"
          />
          <p className="text-xs text-muted-foreground">
            Origem do cálculo de deslocamento. Ao salvar, geocodifica
            automaticamente (Google Maps + fallback).
          </p>
          <div className="grid grid-cols-3 gap-2 pt-1">
            <div>
              <p className="text-xs text-muted-foreground">UF base</p>
              <Input
                value={settings.base_state ?? ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    base_state: e.target.value.toUpperCase().slice(0, 2),
                  })
                }
                maxLength={2}
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Latitude</p>
              <Input
                type="number"
                step="any"
                value={settings.base_lat ?? ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    base_lat: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Longitude</p>
              <Input
                type="number"
                step="any"
                value={settings.base_lng ?? ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    base_lng: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">R$/km (deslocamento)</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={settings.price_per_km}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  price_per_km: Number(e.target.value) || 0,
                })
              }
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">
              Multiplicador horário especial
            </label>
            <Input
              type="number"
              step="0.01"
              min="1"
              max="3"
              value={settings.special_hour_multiplier}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  special_hour_multiplier: Number(e.target.value) || 1,
                })
              }
            />
            <p className="text-xs text-muted-foreground">1.25 = +25%</p>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">
              Taxa da plataforma (%)
            </label>
            <Input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={settings.platform_fee_pct}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  platform_fee_pct: Number(e.target.value) || 0,
                })
              }
            />
            <p className="text-xs text-muted-foreground">
              Sobre repasse aos homologados
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">
              Início do horário comercial
            </label>
            <Input
              type="time"
              value={settings.business_hour_start}
              onChange={(e) =>
                setSettings({ ...settings, business_hour_start: e.target.value })
              }
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">
              Fim do horário comercial
            </label>
            <Input
              type="time"
              value={settings.business_hour_end}
              onChange={(e) =>
                setSettings({ ...settings, business_hour_end: e.target.value })
              }
            />
          </div>
        </div>

        {/* Cobertura operacional da UF base (Jessica 24/06) */}
        <div className="space-y-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4">
          <div>
            <h3 className="text-sm font-semibold">
              Cobertura Operacional da UF Base
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Regra aplicada <strong>somente</strong> a atendimentos dentro da mesma UF da
              base da empresa ({settings.base_state ?? "—"}). Para outros estados,
              o cálculo padrão continua valendo. Deixar em <strong>0</strong> desativa
              a regra correspondente.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">
                Raio de cobertura sem deslocamento (km)
              </label>
              <Input
                type="number"
                step="1"
                min="0"
                value={settings.coverage_radius_km ?? 0}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    coverage_radius_km: Number(e.target.value) || 0,
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                Até essa distância, não cobra deslocamento (dentro da UF base).
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">
                Tempo máximo sem estadia (horas)
              </label>
              <Input
                type="number"
                step="1"
                min="0"
                value={settings.max_service_hours_no_stay ?? 0}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    max_service_hours_no_stay: Number(e.target.value) || 0,
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                Só cobra estadia acima desse tempo <em>E</em> além do raio.
              </p>
            </div>
          </div>
        </div>

        <Button onClick={handleSave} isLoading={saving}>
          <Save className="h-4 w-4" />
          Salvar configurações
        </Button>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Tab 2: Estadias por UF
// ============================================================

function StatesTab() {
  const [rates, setRates] = useState<StayRate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [edits, setEdits] = useState<Record<string, Partial<StayRate>>>({});

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiClient.get<StayRate[]>("/state-stay-rates");
      setRates(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    const changed = Object.entries(edits)
      .filter(([, v]) => Object.keys(v).length > 0)
      .map(([state, v]) => ({ state, ...v }));
    if (changed.length === 0) {
      toast.info("Nada para salvar");
      return;
    }
    setSaving(true);
    try {
      await apiClient.patch("/state-stay-rates", { rates: changed });
      toast.success(`${changed.length} estado(s) atualizado(s)`);
      setEdits({});
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between border-b p-4">
          <p className="text-sm text-muted-foreground">
            Valor diário por estado (R$). Aplicado quando o cliente é de UF
            diferente da base, 1 diária a cada 8h de execução.
          </p>
          <Button onClick={handleSave} isLoading={saving} size="sm">
            <Save className="h-4 w-4" />
            Salvar
          </Button>
        </div>
        {isLoading ? (
          <Skeleton className="m-4 h-64 rounded-lg" />
        ) : (
          <div className="grid grid-cols-1 gap-0 divide-y md:grid-cols-2 md:divide-x md:divide-y-0">
            <div className="divide-y">
              {rates.slice(0, 14).map((r) => (
                <StateRow key={r.state} rate={r} edits={edits} setEdits={setEdits} />
              ))}
            </div>
            <div className="divide-y">
              {rates.slice(14).map((r) => (
                <StateRow key={r.state} rate={r} edits={edits} setEdits={setEdits} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StateRow({
  rate,
  edits,
  setEdits,
}: {
  rate: StayRate;
  edits: Record<string, Partial<StayRate>>;
  setEdits: React.Dispatch<React.SetStateAction<Record<string, Partial<StayRate>>>>;
}) {
  const edit = edits[rate.state] ?? {};
  const value = edit.daily_rate ?? rate.daily_rate;
  return (
    <div className="flex items-center gap-3 p-3">
      <div className="w-12 shrink-0 text-sm font-semibold">{rate.state}</div>
      <div className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
        {rate.state_name}
      </div>
      <Input
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={(e) =>
          setEdits((prev) => ({
            ...prev,
            [rate.state]: { ...prev[rate.state], daily_rate: Number(e.target.value) || 0 },
          }))
        }
        className="h-8 w-24 text-right"
      />
    </div>
  );
}

// ============================================================
// Tab 3: Feriados
// ============================================================

function HolidaysTab() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [importYear, setImportYear] = useState(new Date().getFullYear().toString());
  const [importing, setImporting] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newName, setNewName] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiClient.get<Holiday[]>("/holidays");
      setHolidays(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleImport() {
    setImporting(true);
    try {
      const result = await apiClient.post<{ imported: number }>(
        "/holidays/import",
        { source: "brasilapi", year: Number(importYear) }
      );
      toast.success(`${result.imported} feriados importados`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setImporting(false);
    }
  }

  async function handleAdd() {
    if (!newDate || !newName) {
      toast.error("Preencha data e nome");
      return;
    }
    try {
      await apiClient.post("/holidays", { date: newDate, name: newName });
      toast.success("Feriado adicionado");
      setNewDate("");
      setNewName("");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  async function handleDelete(date: string) {
    if (!confirm(`Remover feriado ${date}?`)) return;
    try {
      await apiClient.delete(`/holidays?date=${date}`);
      toast.success("Removido");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-4">
          <h3 className="text-sm font-semibold">Importar feriados nacionais</h3>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Ano</label>
              <Input
                type="number"
                min="2020"
                max="2099"
                value={importYear}
                onChange={(e) => setImportYear(e.target.value)}
                className="w-28"
              />
            </div>
            <Button onClick={handleImport} isLoading={importing}>
              <Download className="h-4 w-4" />
              Importar da BrasilAPI
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <h3 className="text-sm font-semibold">Adicionar feriado custom</h3>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Data</label>
              <Input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
              />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground">Nome</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: Aniversário da cidade"
              />
            </div>
            <Button onClick={handleAdd} variant="outline">
              <Plus className="h-4 w-4" />
              Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <Skeleton className="m-4 h-64 rounded-lg" />
          ) : holidays.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Nenhum feriado cadastrado.
            </p>
          ) : (
            <div className="divide-y">
              {holidays.map((h) => (
                <div key={h.date} className="flex items-center gap-3 p-3">
                  <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="w-28 shrink-0 text-sm font-medium">
                    {new Date(h.date + "T00:00:00").toLocaleDateString("pt-BR")}
                  </div>
                  <div className="min-w-0 flex-1 truncate text-sm">{h.name}</div>
                  {h.state && (
                    <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                      {h.state}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">{h.source}</span>
                  <button
                    type="button"
                    onClick={() => handleDelete(h.date)}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
