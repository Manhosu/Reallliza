"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Wrench, Plus, Pencil, Boxes, Hash, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectNative } from "@/components/ui/select-native";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toolsApi } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { UserRole } from "@/lib/types";
import type { ToolInventory, PaginatedResponse } from "@/lib/types";
import { ToolPhotosField, type PhotoRef } from "@/components/ferramentas/tool-photos-field";
import { HardDeleteDialog, type Dependency } from "@/components/admin/hard-delete-dialog";
import { apiClient } from "@/lib/api/client";

/**
 * Catálogo — cadastro das FERRAMENTAS (spec seção 10).
 *
 * Jessica 12/08: "preciso saber onde faço o cadastro da ferramenta no sistema.
 * Se eu vim aqui em Inventário e clicar em Nova Unidade, eu entendo que é uma
 * nova unidade que eu vou cadastrar. Aqui eu vou escolher os que já estão
 * cadastrados, mas preciso saber onde faço o cadastro da ferramenta."
 *
 * Ela tinha razão: ao reestruturar o módulo, o cadastro do tipo saiu da
 * interface e só sobrou o de unidade, que exige um tipo já existente.
 *
 * Aqui é o TIPO ("Furadeira de impacto"). A unidade física ("FUR-00123") é
 * cadastrada no Inventário.
 */

interface ToolType extends ToolInventory {
  tracking_mode?: string;
  available_quantity?: number;
}

export default function CatalogoPage() {
  const [types, setTypes] = useState<ToolType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ToolType | null>(null);
  /**
   * Exclusão de ferramenta.
   *
   * A rota `/tools/[id]/purge` e `toolsApi.purge` existiam desde julho e
   * nenhuma tela chamava — foi o que a Jéssica relatou como "não aparece o
   * botão de excluir". As dependências são buscadas antes de abrir, para o
   * diálogo poder dizer o que segura a ferramenta em vez de deixar a pessoa
   * tentar e receber erro.
   */
  const [excluindo, setExcluindo] = useState<ToolInventory | null>(null);
  const [dependencias, setDependencias] = useState<Dependency[]>([]);
  const [carregandoDeps, setCarregandoDeps] = useState(false);
  // `/tools/[id]/purge` só aceita admin (igual à unidade, no Inventário) —
  // sem esconder o botão pra quem não é admin, o clique termina em 403 e
  // parece que "excluir dá erro", o mesmo sintoma já corrigido lá.
  const podeExcluir = useAuthStore((s) => s.user)?.role === UserRole.ADMIN;

  const abrirExclusao = useCallback(async (t: ToolInventory) => {
    setExcluindo(t);
    setCarregandoDeps(true);
    try {
      const r = await apiClient.get<{ dependencies: Dependency[] }>(
        `/admin/dependencias?tabela=tool_inventory&id=${t.id}`
      );
      setDependencias(r.dependencies);
    } catch {
      // Sem o diagnóstico o diálogo ainda funciona — só não antecipa o
      // bloqueio; a recusa vem do servidor, explicada.
      setDependencias([]);
    } finally {
      setCarregandoDeps(false);
    }
  }, []);


  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = (await toolsApi.list({ limit: 200 })) as PaginatedResponse<ToolType>;
      setTypes(res.data ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao carregar o catálogo");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = types.filter((t) =>
    search
      ? [t.name, t.category, (t as { brand?: string }).brand, (t as { model?: string }).model]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase())
      : true
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Catálogo</h1>
          <p className="text-sm text-muted-foreground">
            As ferramentas cadastradas no almoxarifado. Aqui você cadastra a
            ferramenta; as peças individuais ficam no Inventário.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nova ferramenta
        </Button>
      </div>

      <Card>
        <CardContent className="py-4">
          <Input
            label="Buscar"
            placeholder="Nome, categoria, marca ou modelo"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10">
            <EmptyState
              icon={<Wrench className="h-6 w-6" />}
              title="Nenhuma ferramenta cadastrada"
              description="Cadastre a primeira para começar a receber pedidos dos técnicos."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Ferramenta</th>
                  <th className="px-4 py-3">Categoria</th>
                  <th className="px-4 py-3">Controle</th>
                  <th className="px-4 py-3">Disponível</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((t) => {
                  const controlado = t.tracking_mode === "controlled";
                  return (
                    <tr key={t.id} className="transition-colors hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <p className="font-medium">{t.name}</p>
                        {((t as { brand?: string }).brand ||
                          (t as { model?: string }).model) && (
                          <p className="text-xs text-muted-foreground">
                            {[
                              (t as { brand?: string }).brand,
                              (t as { model?: string }).model,
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {t.category ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium",
                            controlado
                              ? "bg-blue-500/10 text-blue-500"
                              : "bg-zinc-500/10 text-zinc-400"
                          )}
                        >
                          {controlado ? (
                            <Boxes className="h-3 w-3" />
                          ) : (
                            <Hash className="h-3 w-3" />
                          )}
                          {controlado ? "Por unidade" : "Por quantidade"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium tabular-nums">
                          {t.available_quantity ?? 0}
                        </span>
                        {controlado && (
                          <Link
                            href={`/ferramentas/inventario?search=${encodeURIComponent(t.name)}`}
                            className="ml-2 text-xs text-primary hover:underline"
                          >
                            ver unidades
                          </Link>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditing(t)}
                            title="Editar cadastro"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {podeExcluir && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void abrirExclusao(t)}
                              title="Excluir permanentemente"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {(creating || editing) && (
        <FerramentaDialog
          tool={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            void load();
          }}
        />
      )}

      <HardDeleteDialog
        open={!!excluindo}
        entityLabel="ferramenta"
        entityName={excluindo?.name ?? ""}
        dependencies={dependencias}
        loadingDeps={carregandoDeps}
        onClose={() => {
          setExcluindo(null);
          setDependencias([]);
        }}
        onConfirm={async () => {
          if (!excluindo) return;
          await toolsApi.purge(excluindo.id);
          await load();
        }}
      />
    </div>
  );
}

// ============================================================
// Cadastro / edição do TIPO (spec seção 10)
// ============================================================

function FerramentaDialog({
  tool,
  onClose,
  onSaved,
}: {
  tool: ToolType | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editMode = !!tool;
  const [form, setForm] = useState({
    name: tool?.name ?? "",
    description: tool?.description ?? "",
    category: tool?.category ?? "",
    brand: (tool as { brand?: string } | null)?.brand ?? "",
    model: (tool as { model?: string } | null)?.model ?? "",
    condition: (tool?.condition as string) ?? "good",
    tracking_mode: tool?.tracking_mode ?? "",
    quantity_available: String(
      (tool as { quantity_available?: number } | null)?.quantity_available ?? 1
    ),
    default_location: (tool as { default_location?: string } | null)?.default_location ?? "",
    supplier: (tool as { supplier?: string } | null)?.supplier ?? "",
    notes: tool?.notes ?? "",
  });
  const [photos, setPhotos] = useState<PhotoRef[]>(
    ((tool as { photos?: PhotoRef[] } | null)?.photos ?? []) as PhotoRef[]
  );
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error("Informe o nome da ferramenta");
      return;
    }
    if (!editMode && !form.tracking_mode) {
      toast.error("Escolha como esta ferramenta será controlada");
      return;
    }

    setSaving(true);
    try {
      const cover = photos[0]?.url ?? null;
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        category: form.category.trim() || null,
        brand: form.brand.trim() || null,
        model: form.model.trim() || null,
        condition: form.condition,
        default_location: form.default_location.trim() || null,
        supplier: form.supplier.trim() || null,
        notes: form.notes.trim() || null,
        photos,
        photo_url: cover,
        ...(form.tracking_mode ? { tracking_mode: form.tracking_mode } : {}),
        ...(form.tracking_mode === "quantity"
          ? { quantity_available: parseInt(form.quantity_available || "0", 10) }
          : {}),
      };

      if (editMode && tool) {
        await toolsApi.update(tool.id, payload as never);
        toast.success("Ferramenta atualizada");
      } else {
        await toolsApi.create(payload as never);
        toast.success("Ferramenta cadastrada");
      }
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} size="lg">
      <DialogHeader>
        <DialogTitle>
          {editMode ? "Editar ferramenta" : "Nova ferramenta"}
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-3">
        <Input
          label="Nome *"
          placeholder="Ex.: Furadeira de impacto 1/2”"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />

        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-foreground/80">
            Descrição
          </label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
            placeholder="Aparece para o técnico no catálogo do aplicativo"
            className="flex w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Categoria"
            placeholder="Ex.: Elétrica, Medição, Corte"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />
          <SelectNative
            label="Condição"
            value={form.condition}
            onChange={(e) => setForm({ ...form, condition: e.target.value })}
          >
            <option value="new">Nova</option>
            <option value="good">Boa</option>
            <option value="fair">Regular</option>
            <option value="poor">Ruim</option>
            <option value="damaged">Danificada</option>
          </SelectNative>
          <Input
            label="Marca"
            value={form.brand}
            onChange={(e) => setForm({ ...form, brand: e.target.value })}
          />
          <Input
            label="Modelo"
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
          />
          <Input
            label="Localização padrão"
            placeholder="Ex.: Prateleira A-02"
            value={form.default_location}
            onChange={(e) => setForm({ ...form, default_location: e.target.value })}
          />
          <Input
            label="Fornecedor"
            value={form.supplier}
            onChange={(e) => setForm({ ...form, supplier: e.target.value })}
          />
        </div>

        {/* A escolha que faltava — antes o modo era decidido por acidente,
            quando alguém cadastrava a primeira unidade. */}
        <div className="space-y-2 rounded-xl border border-border p-3">
          <label className="text-sm font-medium leading-none text-foreground/80">
            Como esta ferramenta é controlada? {!editMode && "*"}
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <ModeOption
              active={form.tracking_mode === "controlled"}
              disabled={editMode}
              icon={Boxes}
              title="Por unidade"
              description="Cada peça tem código, patrimônio e histórico próprios. Para furadeira, parafusadeira, serra."
              onClick={() => setForm({ ...form, tracking_mode: "controlled" })}
            />
            <ModeOption
              active={form.tracking_mode === "quantity"}
              disabled={editMode}
              icon={Hash}
              title="Por quantidade"
              description="Controle por saldo, sem peça individual. Para espaçador, lápis, consumíveis."
              onClick={() => setForm({ ...form, tracking_mode: "quantity" })}
            />
          </div>

          {editMode && (
            <p className="text-xs text-muted-foreground">
              O modo de controle não muda depois do cadastro — as movimentações
              já registradas dependem dele.
            </p>
          )}

          {form.tracking_mode === "quantity" && !editMode && (
            <Input
              label="Quantidade em estoque"
              type="number"
              min="0"
              value={form.quantity_available}
              onChange={(e) =>
                setForm({ ...form, quantity_available: e.target.value })
              }
            />
          )}

          {form.tracking_mode === "controlled" && !editMode && (
            <p className="text-xs text-muted-foreground">
              Depois de cadastrar, vá em <strong>Inventário → Nova unidade</strong>{" "}
              para registrar cada peça com seu código e patrimônio.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-foreground/80">
            Observações
          </label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            className="flex w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <ToolPhotosField
          toolId={tool?.id ?? "novo"}
          kind="unit"
          photos={photos}
          onChange={setPhotos}
          label="Fotos da ferramenta"
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} isLoading={saving}>
            {editMode ? "Salvar alterações" : "Cadastrar ferramenta"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function ModeOption({
  active,
  disabled,
  icon: Icon,
  title,
  description,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  icon: React.ElementType;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-xl border p-3 text-left transition-colors",
        active
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/40",
        disabled && "cursor-not-allowed opacity-60"
      )}
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4" />
        {title}
      </span>
      <span className="mt-1 block text-xs text-muted-foreground">{description}</span>
    </button>
  );
}
