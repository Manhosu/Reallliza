"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, MapPin, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SelectNative } from "@/components/ui/select-native";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { regionsApi } from "@/lib/api";
import type { Region } from "@/lib/api/regions";

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
];

function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export default function RegioesPage() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [novoNome, setNovoNome] = useState("");
  const [novaUf, setNovaUf] = useState("SP");
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editUf, setEditUf] = useState("SP");

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await regionsApi.list({ include_inactive: true });
      setRegions(data || []);
    } catch (err: unknown) {
      toast.error(errMsg(err, "Erro ao carregar regiões"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function criar() {
    if (!novoNome.trim()) return;
    setSaving(true);
    try {
      await regionsApi.create({ name: novoNome.trim(), uf: novaUf });
      setNovoNome("");
      toast.success("Região criada");
      load();
    } catch (err: unknown) {
      toast.error(errMsg(err, "Erro ao criar região"));
    } finally {
      setSaving(false);
    }
  }

  async function salvarEdicao(id: string) {
    if (!editNome.trim()) return;
    try {
      await regionsApi.update(id, { name: editNome.trim(), uf: editUf });
      setEditId(null);
      toast.success("Região atualizada");
      load();
    } catch (err: unknown) {
      toast.error(errMsg(err, "Erro ao atualizar"));
    }
  }

  async function toggleAtivo(region: Region) {
    try {
      await regionsApi.update(region.id, { is_active: !region.is_active });
      load();
    } catch {
      toast.error("Erro ao atualizar região");
    }
  }

  async function remover(region: Region) {
    if (!confirm(`Desativar a região "${region.name}"?`)) return;
    try {
      await regionsApi.remove(region.id);
      toast.success("Região desativada");
      load();
    } catch (err: unknown) {
      toast.error(errMsg(err, "Erro ao remover"));
    }
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-1"
      >
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
          Regiões de Atuação
        </h1>
        <p className="text-muted-foreground">
          Áreas usadas na distribuição de OS e no perfil operacional do
          profissional.
        </p>
      </motion.div>

      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && criar()}
              placeholder="Nova região (ex: Grande São Paulo, Litoral Norte...)"
              className="sm:flex-1"
            />
            <div className="sm:w-28">
              <SelectNative
                value={novaUf}
                onChange={(e) => setNovaUf(e.target.value)}
              >
                {UFS.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </SelectNative>
            </div>
            <Button onClick={criar} isLoading={saving} className="shrink-0">
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-11 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : regions.length === 0 ? (
            <EmptyState
              icon={<MapPin className="h-6 w-6" />}
              title="Nenhuma região cadastrada"
              description="Cadastre as áreas de atuação para usar na distribuição."
            />
          ) : (
            <div className="space-y-1">
              <AnimatePresence>
                {regions.map((r) => (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border bg-background px-3 py-2",
                      !r.is_active && "opacity-50"
                    )}
                  >
                    {editId === r.id ? (
                      <>
                        <Input
                          value={editNome}
                          onChange={(e) => setEditNome(e.target.value)}
                          className="h-8 flex-1"
                          autoFocus
                        />
                        <div className="w-24">
                          <SelectNative
                            value={editUf}
                            onChange={(e) => setEditUf(e.target.value)}
                            className="h-8"
                          >
                            {UFS.map((uf) => (
                              <option key={uf} value={uf}>
                                {uf}
                              </option>
                            ))}
                          </SelectNative>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => salvarEdicao(r.id)}
                        >
                          <Check className="h-4 w-4 text-green-600" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditId(null)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <MapPin className="h-4 w-4 shrink-0 text-primary" />
                        <button
                          className="flex-1 text-left text-sm font-medium"
                          onClick={() => {
                            setEditId(r.id);
                            setEditNome(r.name);
                            setEditUf(r.uf);
                          }}
                        >
                          {r.name}
                        </button>
                        <Badge variant="secondary">{r.uf}</Badge>
                        <button
                          onClick={() => toggleAtivo(r)}
                          className={cn(
                            "rounded px-2 py-0.5 text-[10px] font-medium",
                            r.is_active
                              ? "bg-green-500/15 text-green-600"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {r.is_active ? "Ativa" : "Inativa"}
                        </button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => remover(r)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
