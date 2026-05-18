"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Edit,
  Ban,
  RotateCcw,
  CheckCircle2,
  Tag,
  Package,
  AlertCircle,
  Trash2,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SelectNative } from "@/components/ui/select-native";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { serviceCategoriesApi, servicesApi } from "@/lib/api";
import type { Service, ServiceCategory } from "@/lib/api/services";

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

// ============================================================
// Formulário de serviço (criar/editar)
// ============================================================

interface ServiceFormProps {
  open: boolean;
  service: Service | null;
  categories: ServiceCategory[];
  onClose: () => void;
  onSaved: () => void;
}

function ServiceForm({
  open,
  service,
  categories,
  onClose,
  onSaved,
}: ServiceFormProps) {
  const isEditing = !!service;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [unit, setUnit] = useState("m2");
  const [commercialPrice, setCommercialPrice] = useState("0");
  const [payoutPrice, setPayoutPrice] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(service?.name ?? "");
      setDescription(service?.description ?? "");
      setCategoryId(service?.category_id ?? "");
      setUnit(service?.unit ?? "m2");
      setCommercialPrice(String(service?.commercial_price ?? 0));
      setPayoutPrice(String(service?.payout_price ?? 0));
      setIsActive(service?.is_active ?? true);
      setError(null);
    }
  }, [open, service]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Informe o nome do serviço.");
      return;
    }
    const comercial = Number(commercialPrice.replace(",", "."));
    const repasse = Number(payoutPrice.replace(",", "."));
    if (!Number.isFinite(comercial) || comercial < 0) {
      setError("Valor comercial inválido.");
      return;
    }
    if (!Number.isFinite(repasse) || repasse < 0) {
      setError("Valor de repasse inválido.");
      return;
    }

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      category_id: categoryId || null,
      unit: unit.trim() || "m2",
      commercial_price: comercial,
      payout_price: repasse,
      is_active: isActive,
    };

    setIsSaving(true);
    try {
      if (isEditing && service) {
        await servicesApi.update(service.id, payload);
        toast.success("Serviço atualizado");
      } else {
        await servicesApi.create(payload);
        toast.success("Serviço criado");
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(errMsg(err, "Erro ao salvar serviço"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar serviço" : "Novo serviço"}
          </DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground/80">
              Nome do serviço
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Instalação de piso SPC clicado"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground/80">
              Descrição (opcional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Detalhes do serviço operacional."
              className="flex w-full rounded-xl border border-input bg-background px-4 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SelectNative
              label="Categoria"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Sem categoria</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectNative>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/80">
                Unidade
              </label>
              <Input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="m2, ml, un..."
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/80">
                Valor comercial (loja paga)
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={commercialPrice}
                onChange={(e) => setCommercialPrice(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/80">
                Valor de repasse (profissional)
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={payoutPrice}
                onChange={(e) => setPayoutPrice(e.target.value)}
              />
            </div>
          </div>

          {isEditing && (
            <label className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              <span>Serviço ativo</span>
            </label>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </DialogContent>
        <DialogFooter className="border-t">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" isLoading={isSaving}>
            {isEditing ? "Salvar alterações" : "Criar serviço"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

// ============================================================
// Bloco de categorias (gestão inline)
// ============================================================

interface CategoriesPanelProps {
  categories: ServiceCategory[];
  onChanged: () => void;
}

function CategoriesPanel({ categories, onChanged }: CategoriesPanelProps) {
  const [novoNome, setNovoNome] = useState("");
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");

  async function criar() {
    if (!novoNome.trim()) return;
    setSaving(true);
    try {
      await serviceCategoriesApi.create({
        name: novoNome.trim(),
        order_index: categories.length,
      });
      setNovoNome("");
      toast.success("Categoria criada");
      onChanged();
    } catch (err: unknown) {
      toast.error(errMsg(err, "Erro ao criar categoria"));
    } finally {
      setSaving(false);
    }
  }

  async function salvarEdicao(id: string) {
    if (!editNome.trim()) return;
    try {
      await serviceCategoriesApi.update(id, { name: editNome.trim() });
      setEditId(null);
      toast.success("Categoria atualizada");
      onChanged();
    } catch (err: unknown) {
      toast.error(errMsg(err, "Erro ao atualizar"));
    }
  }

  async function toggleAtivo(cat: ServiceCategory) {
    try {
      await serviceCategoriesApi.update(cat.id, { is_active: !cat.is_active });
      onChanged();
    } catch {
      toast.error("Erro ao atualizar categoria");
    }
  }

  async function remover(cat: ServiceCategory) {
    if (!confirm(`Desativar a categoria "${cat.name}"?`)) return;
    try {
      await serviceCategoriesApi.remove(cat.id);
      toast.success("Categoria desativada");
      onChanged();
    } catch (err: unknown) {
      toast.error(errMsg(err, "Erro ao remover"));
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Categorias</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Agrupam os serviços do catálogo. Crie, renomeie e ative/desative.
        </p>

        <div className="flex gap-2">
          <Input
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && criar()}
            placeholder="Nova categoria (ex: Instalação, Acabamento...)"
          />
          <Button onClick={criar} isLoading={saving} className="shrink-0">
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        </div>

        <div className="space-y-1">
          {categories.map((c) => (
            <div
              key={c.id}
              className={cn(
                "flex items-center gap-2 rounded-lg border bg-background px-3 py-2",
                !c.is_active && "opacity-50"
              )}
            >
              {editId === c.id ? (
                <>
                  <Input
                    value={editNome}
                    onChange={(e) => setEditNome(e.target.value)}
                    className="h-8 flex-1"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => salvarEdicao(c.id)}
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
                  <button
                    className="flex-1 text-left text-sm font-medium"
                    onClick={() => {
                      setEditId(c.id);
                      setEditNome(c.name);
                    }}
                  >
                    {c.name}
                  </button>
                  <button
                    onClick={() => toggleAtivo(c)}
                    className={cn(
                      "rounded px-2 py-0.5 text-[10px] font-medium",
                      c.is_active
                        ? "bg-green-500/15 text-green-600"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {c.is_active ? "Ativa" : "Inativa"}
                  </button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => remover(c)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </>
              )}
            </div>
          ))}
          {categories.length === 0 && (
            <p className="py-3 text-center text-sm text-muted-foreground">
              Nenhuma categoria cadastrada
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Página
// ============================================================

export default function ServicosPage() {
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);

  const loadCategories = useCallback(async () => {
    try {
      const data = await serviceCategoriesApi.list({ include_inactive: true });
      setCategories(data || []);
    } catch (err: unknown) {
      toast.error(errMsg(err, "Erro ao carregar categorias"));
    }
  }, []);

  const loadServices = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await servicesApi.list({
        include_inactive: includeInactive,
        category_id: categoryFilter || undefined,
        search: search.trim() || undefined,
      });
      setServices(data || []);
    } catch (err: unknown) {
      toast.error(errMsg(err, "Erro ao carregar serviços"));
    } finally {
      setIsLoading(false);
    }
  }, [includeInactive, categoryFilter, search]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  const activeCategories = useMemo(
    () => categories.filter((c) => c.is_active),
    [categories]
  );

  function handleNew() {
    setEditing(null);
    setShowForm(true);
  }

  function handleEdit(service: Service) {
    setEditing(service);
    setShowForm(true);
  }

  async function handleDeactivate(service: Service) {
    if (!confirm(`Desativar o serviço "${service.name}"?`)) return;
    try {
      await servicesApi.remove(service.id);
      toast.success("Serviço desativado");
      loadServices();
    } catch (err: unknown) {
      toast.error(errMsg(err, "Erro ao desativar"));
    }
  }

  async function handleReactivate(service: Service) {
    try {
      await servicesApi.update(service.id, { is_active: true });
      toast.success("Serviço reativado");
      loadServices();
    } catch (err: unknown) {
      toast.error(errMsg(err, "Erro ao reativar"));
    }
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
            Catálogo de Serviços
          </h1>
          <p className="text-muted-foreground">
            Serviços operacionais com valor comercial (loja paga) e de repasse
            (profissional recebe).
          </p>
        </div>
        <Button onClick={handleNew}>
          <Plus className="h-4 w-4" /> Novo Serviço
        </Button>
      </motion.div>

      <CategoriesPanel categories={categories} onChanged={loadCategories} />

      <Card>
        <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIncludeInactive(false)}
              className={cn(
                "flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors",
                !includeInactive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent"
              )}
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Ativos
            </button>
            <button
              onClick={() => setIncludeInactive(true)}
              className={cn(
                "flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors",
                includeInactive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent"
              )}
            >
              Todos
            </button>
          </div>
          <div className="sm:w-56">
            <SelectNative
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="">Todas as categorias</option>
              {activeCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectNative>
          </div>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar serviço..."
            className="sm:flex-1"
          />
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="space-y-3 p-6">
                <div className="h-5 w-3/5 animate-pulse rounded bg-muted" />
                <div className="h-4 w-full animate-pulse rounded bg-muted" />
                <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : services.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Package className="h-6 w-6" />}
            title="Nenhum serviço cadastrado"
            description="Crie um serviço para montar o catálogo operacional."
            action={
              <Button onClick={handleNew}>
                <Plus className="h-4 w-4" /> Criar serviço
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence>
            {services.map((s, idx) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ delay: idx * 0.04, duration: 0.3 }}
              >
                <Card hover className={cn("h-full", !s.is_active && "opacity-60")}>
                  <CardContent className="flex h-full flex-col gap-3 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                          <Package className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold leading-snug">
                            {s.name}
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            {s.category?.name ?? "Sem categoria"} · por {s.unit}
                          </p>
                        </div>
                      </div>
                      {!s.is_active && <Badge variant="secondary">Inativo</Badge>}
                    </div>

                    {s.description && (
                      <p className="text-sm text-muted-foreground">
                        {s.description}
                      </p>
                    )}

                    <div className="mt-auto grid grid-cols-2 gap-2 pt-1">
                      <div className="rounded-lg bg-muted/50 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Comercial
                        </p>
                        <p className="text-sm font-semibold">
                          {formatBRL(s.commercial_price)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-muted/50 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Repasse
                        </p>
                        <p className="text-sm font-semibold">
                          {formatBRL(s.payout_price)}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => handleEdit(s)}
                      >
                        <Edit className="h-4 w-4" /> Editar
                      </Button>
                      {s.is_active ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeactivate(s)}
                        >
                          <Ban className="h-4 w-4 text-destructive" />
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleReactivate(s)}
                        >
                          <RotateCcw className="h-4 w-4 text-green-600" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <ServiceForm
        open={showForm}
        service={editing}
        categories={activeCategories}
        onClose={() => setShowForm(false)}
        onSaved={loadServices}
      />
    </div>
  );
}
