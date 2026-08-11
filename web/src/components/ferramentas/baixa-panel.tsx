"use client";

import { useState, useEffect, useCallback } from "react";
import { XCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectNative } from "@/components/ui/select-native";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { toolsApi } from "@/lib/api";
import { ToolPhotosField, type PhotoRef } from "@/components/ferramentas/tool-photos-field";
import type { ToolInventory } from "@/lib/types";

interface Retirement {
  id: string;
  tool_id: string;
  reason: string;
  notes: string | null;
  retired_at: string;
  tool?: { id: string; name: string; serial_number?: string };
  responsible?: { id: string; full_name: string };
}

export function BaixaPanel({
  tools,
  onChanged,
}: {
  tools: ToolInventory[];
  onChanged: () => void;
}) {
  const [list, setList] = useState<Retirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ tool_id: "", reason: "", notes: "" });
  const [photos, setPhotos] = useState<PhotoRef[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await toolsApi.listRetirements();
      setList(data);
    } catch (err) {
      console.error(err);
      toast.error("Falha ao carregar baixas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const retirableTools = tools.filter(
    (t) => t.status !== "retired" && t.status !== "in_custody"
  );

  const handleCreate = async () => {
    if (!form.tool_id || !form.reason) {
      toast.error("Ferramenta e motivo obrigatórios");
      return;
    }
    try {
      await toolsApi.retire({
        tool_id: form.tool_id,
        reason: form.reason,
        notes: form.notes || undefined,
        photos,
      });
      toast.success("Ferramenta baixada");
      setCreating(false);
      setForm({ tool_id: "", reason: "", notes: "" });
      setPhotos([]);
      await load();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Baixas ({list.length})</CardTitle>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Nova baixa
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={<XCircle className="h-6 w-6" />}
            title="Nenhuma baixa registrada"
            description="Ferramentas aposentadas/baixadas aparecem aqui com o motivo"
          />
        ) : (
          <div className="space-y-3">
            {list.map((r) => (
              <div key={r.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-sm">
                      {r.tool?.name}
                      {r.tool?.serial_number && (
                        <span className="text-xs text-muted-foreground ml-2">
                          {r.tool.serial_number}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {r.reason}
                    </p>
                    {r.notes && (
                      <p className="text-xs text-muted-foreground italic mt-1">
                        {r.notes}
                      </p>
                    )}
                    <div className="text-xs text-muted-foreground mt-1">
                      {new Date(r.retired_at).toLocaleDateString("pt-BR")}
                      {r.responsible?.full_name && <> · {r.responsible.full_name}</>}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCreating(false)} />
          <div className="relative z-10 w-full max-w-md rounded-xl bg-card border p-6 shadow-xl">
            <h2 className="text-lg font-semibold mb-4">Baixar ferramenta</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm">Ferramenta</label>
                <SelectNative
                  value={form.tool_id}
                  onChange={(e) => setForm({ ...form, tool_id: e.target.value })}
                >
                  <option value="">Escolha...</option>
                  {retirableTools.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.serial_number && ` — ${t.serial_number}`}
                    </option>
                  ))}
                </SelectNative>
              </div>
              <div>
                <label className="text-sm">Motivo da baixa</label>
                <Input
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  placeholder="Ex.: Danificada sem conserto viável"
                />
              </div>
              <div>
                <label className="text-sm">Observações</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  rows={2}
                />
              </div>
              <ToolPhotosField
                toolId={form.tool_id}
                kind="retirement"
                photos={photos}
                onChange={setPhotos}
                label="Fotos (opcional)"
                disabled={!form.tool_id}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setCreating(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleCreate}>Confirmar baixa</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
