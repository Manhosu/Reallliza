"use client";

import { useState, useEffect, useCallback } from "react";
import { Settings, Plus, Check } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { SelectNative } from "@/components/ui/select-native";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { toolsApi } from "@/lib/api";
import type { ToolInventory } from "@/lib/types";

interface Maintenance {
  id: string;
  tool_id: string;
  reason: string;
  sent_at: string;
  expected_return_at: string | null;
  actual_return_at: string | null;
  estimated_cost: number | null;
  final_cost: number | null;
  outcome: string | null;
  notes: string | null;
  tool?: { id: string; name: string; serial_number?: string };
}

export function ManutencaoPanel({
  tools,
  onChanged,
}: {
  tools: ToolInventory[];
  onChanged: () => void;
}) {
  const [list, setList] = useState<Maintenance[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [finishing, setFinishing] = useState<Maintenance | null>(null);
  const [form, setForm] = useState({
    tool_id: "",
    reason: "",
    expected_return_at: "",
    estimated_cost: "",
    notes: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await toolsApi.listMaintenance();
      setList(data);
    } catch (err) {
      console.error(err);
      toast.error("Falha ao carregar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const availableTools = tools.filter(
    (t) =>
      t.status === "available" ||
      (t.status as string) === "damaged" ||
      (t.status as string) === "awaiting_evaluation"
  );

  const handleCreate = async () => {
    if (!form.tool_id || !form.reason) {
      toast.error("Ferramenta e motivo obrigatórios");
      return;
    }
    try {
      await toolsApi.sendToMaintenance({
        tool_id: form.tool_id,
        reason: form.reason,
        expected_return_at: form.expected_return_at || undefined,
        estimated_cost: form.estimated_cost
          ? parseFloat(form.estimated_cost)
          : undefined,
        notes: form.notes || undefined,
      });
      toast.success("Enviado pra manutenção");
      setCreating(false);
      setForm({
        tool_id: "",
        reason: "",
        expected_return_at: "",
        estimated_cost: "",
        notes: "",
      });
      await load();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Manutenções ({list.length})</CardTitle>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Enviar pra manutenção
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={<Settings className="h-6 w-6" />}
            title="Nenhuma manutenção"
            description="Envie ferramentas defeituosas pra manutenção pelo botão acima"
          />
        ) : (
          <div className="space-y-3">
            {list.map((m) => {
              const done = !!m.actual_return_at;
              return (
                <div
                  key={m.id}
                  className="rounded-lg border p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-sm">
                        {m.tool?.name} {m.tool?.serial_number && `— ${m.tool.serial_number}`}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {m.reason}
                      </p>
                      <div className="text-xs text-muted-foreground mt-1">
                        Enviado: {new Date(m.sent_at).toLocaleDateString("pt-BR")}
                        {m.expected_return_at && (
                          <> · Previsão: {new Date(m.expected_return_at).toLocaleDateString("pt-BR")}</>
                        )}
                        {m.estimated_cost != null && <> · R$ {m.estimated_cost}</>}
                      </div>
                    </div>
                    {done ? (
                      <Badge className="bg-emerald-500/15 text-emerald-600">
                        {m.outcome === "retired" ? "Aposentada" : "Voltou"}
                      </Badge>
                    ) : (
                      <Badge className="bg-purple-500/15 text-purple-600">
                        Em manutenção
                      </Badge>
                    )}
                  </div>
                  {!done && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setFinishing(m)}
                    >
                      <Check className="h-3 w-3 mr-1" />
                      Finalizar manutenção
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setCreating(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-xl bg-card border p-6 shadow-xl">
            <h2 className="text-lg font-semibold mb-4">Enviar pra manutenção</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm">Ferramenta</label>
                <SelectNative
                  value={form.tool_id}
                  onChange={(e) => setForm({ ...form, tool_id: e.target.value })}
                >
                  <option value="">Escolha...</option>
                  {availableTools.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} {t.serial_number && `— ${t.serial_number}`}
                    </option>
                  ))}
                </SelectNative>
              </div>
              <div>
                <label className="text-sm">Motivo</label>
                <Input
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  placeholder="Ex.: Motor queimado"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm">Previsão retorno</label>
                  <Input
                    type="date"
                    value={form.expected_return_at}
                    onChange={(e) =>
                      setForm({ ...form, expected_return_at: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="text-sm">Custo estimado</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.estimated_cost}
                    onChange={(e) =>
                      setForm({ ...form, estimated_cost: e.target.value })
                    }
                    placeholder="R$"
                  />
                </div>
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
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setCreating(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleCreate}>Enviar</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {finishing && (
        <FinishMaintenance
          maintenance={finishing}
          onClose={() => setFinishing(null)}
          onDone={async () => {
            setFinishing(null);
            await load();
            onChanged();
          }}
        />
      )}
    </Card>
  );
}

function FinishMaintenance({
  maintenance,
  onClose,
  onDone,
}: {
  maintenance: Maintenance;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [outcome, setOutcome] = useState<"returned_available" | "retired">(
    "returned_available"
  );
  const [finalCost, setFinalCost] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await toolsApi.finishMaintenance(maintenance.id, {
        outcome,
        final_cost: finalCost ? parseFloat(finalCost) : undefined,
        outcome_notes: notes || undefined,
      });
      toast.success("Manutenção finalizada");
      await onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-xl bg-card border p-6 shadow-xl">
        <h2 className="text-lg font-semibold mb-1">Finalizar manutenção</h2>
        <p className="text-sm text-muted-foreground mb-4">{maintenance.tool?.name}</p>
        <div className="space-y-3">
          <div>
            <label className="text-sm">Resultado</label>
            <SelectNative
              value={outcome}
              onChange={(e) =>
                setOutcome(e.target.value as "returned_available" | "retired")
              }
            >
              <option value="returned_available">Voltou disponível</option>
              <option value="retired">Aposentar (sem conserto)</option>
            </SelectNative>
          </div>
          <div>
            <label className="text-sm">Custo final</label>
            <Input
              type="number"
              step="0.01"
              value={finalCost}
              onChange={(e) => setFinalCost(e.target.value)}
              placeholder="R$"
            />
          </div>
          <div>
            <label className="text-sm">Observações</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              rows={2}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={submit} isLoading={saving}>
              Finalizar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
