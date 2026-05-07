"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  FileText,
  User,
  MapPin,
  Calendar,
  DollarSign,
  MessageSquare,
  Save,
  AlertCircle,
  Package,
  CreditCard,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectNative } from "@/components/ui/select-native";
import { cn } from "@/lib/utils";
import { OsPriority, OS_PRIORITY_LABELS, UserRole, type Partner, type Profile } from "@/lib/types";
import { serviceOrdersApi, partnersApi, usersApi } from "@/lib/api";
import { apiClient } from "@/lib/api/client";
import { useAuthStore } from "@/stores/auth-store";

const BR_STATES = [
  { value: "AC", label: "Acre" }, { value: "AL", label: "Alagoas" },
  { value: "AP", label: "Amapá" }, { value: "AM", label: "Amazonas" },
  { value: "BA", label: "Bahia" }, { value: "CE", label: "Ceará" },
  { value: "DF", label: "Distrito Federal" }, { value: "ES", label: "Espírito Santo" },
  { value: "GO", label: "Goiás" }, { value: "MA", label: "Maranhão" },
  { value: "MT", label: "Mato Grosso" }, { value: "MS", label: "Mato Grosso do Sul" },
  { value: "MG", label: "Minas Gerais" }, { value: "PA", label: "Pará" },
  { value: "PB", label: "Paraíba" }, { value: "PR", label: "Paraná" },
  { value: "PE", label: "Pernambuco" }, { value: "PI", label: "Piauí" },
  { value: "RJ", label: "Rio de Janeiro" }, { value: "RN", label: "Rio Grande do Norte" },
  { value: "RS", label: "Rio Grande do Sul" }, { value: "RO", label: "Rondônia" },
  { value: "RR", label: "Roraima" }, { value: "SC", label: "Santa Catarina" },
  { value: "SP", label: "São Paulo" }, { value: "SE", label: "Sergipe" },
  { value: "TO", label: "Tocantins" },
];

const UNIT_OPTIONS = ["M²", "M", "UN", "PÇ", "KG", "L"];
const PAYMENT_TYPES = ["Pix", "Boleto", "Dinheiro", "Cartão", "Cheque", "Outros"];

interface FormData {
  title: string;
  description: string;
  priority: string;
  partner_id: string;
  client_name: string;
  client_phone: string;
  client_email: string;
  client_document: string;
  client_contact_name: string;
  client_rg_ie: string;
  address_street: string;
  address_number: string;
  address_complement: string;
  address_neighborhood: string;
  address_city: string;
  address_state: string;
  address_zip: string;
  scheduled_date: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  previsao_conclusao: string;
  technician_id: string;
  estimated_value: string;
  notes: string;
  historico: string;
  acrescimo: string;
  desconto: string;
  vale_troca: string;
}

interface ItemRow {
  kind: "S" | "P";
  identification: string;
  description: string;
  unit: string;
  unit_value: string;
  quantity: string;
}

interface PaymentRow {
  payment_type: string;
  number_label: string;
  doc_number: string;
  due_date: string;
  value: string;
}

interface FormErrors {
  [key: string]: string;
}

const formatBRL = (n: number): string =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const parseNum = (s: string): number => {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

export default function NovaOsPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const isPartner = user?.role === UserRole.PARTNER;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  const [partners, setPartners] = useState<Partner[]>([]);
  const [technicians, setTechnicians] = useState<Profile[]>([]);
  const [loadingDropdowns, setLoadingDropdowns] = useState(true);

  const [form, setForm] = useState<FormData>({
    title: "",
    description: "",
    priority: OsPriority.MEDIUM,
    partner_id: "",
    client_name: "",
    client_phone: "",
    client_email: "",
    client_document: "",
    client_contact_name: "",
    client_rg_ie: "",
    address_street: "",
    address_number: "",
    address_complement: "",
    address_neighborhood: "",
    address_city: "",
    address_state: "",
    address_zip: "",
    scheduled_date: "",
    scheduled_start_time: "",
    scheduled_end_time: "",
    previsao_conclusao: "",
    technician_id: "",
    estimated_value: "",
    notes: "",
    historico: "",
    acrescimo: "0",
    desconto: "0",
    vale_troca: "0",
  });

  const [items, setItems] = useState<ItemRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function loadDropdowns() {
      if (!isInitialized) return;
      if (isPartner) {
        setLoadingDropdowns(false);
        return;
      }
      setLoadingDropdowns(true);
      try {
        const [partnersRes, techniciansRes] = await Promise.all([
          partnersApi.list({ is_active: true, limit: 100 }),
          usersApi.list({ role: UserRole.TECHNICIAN, limit: 100 }),
        ]);
        if (!cancelled) {
          setPartners(partnersRes.data);
          setTechnicians(techniciansRes.data);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erro ao carregar dados";
        toast.error(message);
      } finally {
        if (!cancelled) setLoadingDropdowns(false);
      }
    }
    loadDropdowns();
    return () => { cancelled = true; };
  }, [isPartner, isInitialized]);

  const updateField = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  // Items
  const addItem = () => {
    setItems((prev) => [
      ...prev,
      { kind: "S", identification: "", description: "", unit: "UN", unit_value: "0", quantity: "1" },
    ]);
  };
  const updateItem = (idx: number, field: keyof ItemRow, value: string) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  };
  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  // Payments
  const addPayment = () => {
    setPayments((prev) => [
      ...prev,
      { payment_type: "Pix", number_label: "", doc_number: "", due_date: "", value: "0" },
    ]);
  };
  const updatePayment = (idx: number, field: keyof PaymentRow, value: string) => {
    setPayments((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
  };
  const removePayment = (idx: number) => {
    setPayments((prev) => prev.filter((_, i) => i !== idx));
  };

  // Totals
  const subtotal = items.reduce(
    (acc, it) => acc + parseNum(it.unit_value) * parseNum(it.quantity),
    0
  );
  const acrescimo = parseNum(form.acrescimo);
  const desconto = parseNum(form.desconto);
  const valeTroca = parseNum(form.vale_troca);
  const totalLiquido = subtotal + acrescimo - desconto - valeTroca;

  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    if (!form.title.trim()) newErrors.title = "Título é obrigatório";
    if (!form.client_name.trim()) newErrors.client_name = "Nome do cliente é obrigatório";
    items.forEach((it, idx) => {
      if (!it.description.trim()) {
        newErrors[`item_${idx}`] = `Descrição do item ${idx + 1} é obrigatória`;
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) {
      toast.error("Verifique os campos obrigatórios");
      return;
    }
    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        title: form.title,
        client_name: form.client_name,
      };
      if (form.description) payload.description = form.description;
      if (form.priority) payload.priority = form.priority;
      if (form.partner_id) payload.partner_id = form.partner_id;
      if (form.technician_id) payload.technician_id = form.technician_id;
      if (form.client_phone) payload.client_phone = form.client_phone;
      if (form.client_email) payload.client_email = form.client_email;
      if (form.client_document) payload.client_document = form.client_document;
      if (form.client_contact_name) payload.client_contact_name = form.client_contact_name;
      if (form.client_rg_ie) payload.client_rg_ie = form.client_rg_ie;
      if (form.address_street) payload.address_street = form.address_street;
      if (form.address_number) payload.address_number = form.address_number;
      if (form.address_complement) payload.address_complement = form.address_complement;
      if (form.address_neighborhood) payload.address_neighborhood = form.address_neighborhood;
      if (form.address_city) payload.address_city = form.address_city;
      if (form.address_state) payload.address_state = form.address_state;
      if (form.address_zip) payload.address_zip = form.address_zip;
      if (form.scheduled_date) payload.scheduled_date = form.scheduled_date;
      if (form.previsao_conclusao) payload.previsao_conclusao = form.previsao_conclusao;
      if (form.estimated_value) payload.estimated_value = parseFloat(form.estimated_value);
      if (form.notes) payload.notes = form.notes;
      if (form.historico) payload.historico = form.historico;
      if (acrescimo) payload.acrescimo = acrescimo;
      if (desconto) payload.desconto = desconto;
      if (valeTroca) payload.vale_troca = valeTroca;

      const created = await serviceOrdersApi.create(payload as any) as any;
      const orderId = created.id;

      // Cria itens (sequencialmente, posicao = idx)
      const itemFailures: number[] = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        try {
          await apiClient.post(`/service-orders/${orderId}/items`, {
            kind: it.kind,
            identification: it.identification || undefined,
            description: it.description,
            unit: it.unit || undefined,
            unit_value: parseNum(it.unit_value),
            quantity: parseNum(it.quantity),
            position: i,
          });
        } catch (err) {
          console.error(`Falha item ${i}:`, err);
          itemFailures.push(i);
        }
      }

      // Cria parcelas
      const paymentFailures: number[] = [];
      for (let i = 0; i < payments.length; i++) {
        const pm = payments[i];
        try {
          await apiClient.post(`/service-orders/${orderId}/payments`, {
            payment_type: pm.payment_type || undefined,
            number_label: pm.number_label || undefined,
            doc_number: pm.doc_number || undefined,
            due_date: pm.due_date || undefined,
            value: parseNum(pm.value),
            position: i,
          });
        } catch (err) {
          console.error(`Falha parcela ${i}:`, err);
          paymentFailures.push(i);
        }
      }

      if (itemFailures.length || paymentFailures.length) {
        toast.warning(
          `OS criada, mas houve falhas: ${itemFailures.length} item(ns) e ${paymentFailures.length} parcela(s) não foram salvos.`
        );
      } else {
        toast.success("OS criada com sucesso");
      }

      setTimeout(() => router.push(`/os/${orderId}`), 800);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao criar OS";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.06 } },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-center gap-4"
      >
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
            {isPartner ? "Novo Chamado" : "Nova Ordem de Serviço"}
          </h1>
          <p className="text-muted-foreground">
            {isPartner
              ? "Preencha as informações para abrir um chamado"
              : "Preencha as informações para criar uma nova OS"}
          </p>
        </div>
      </motion.div>

      <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6">
        {/* Informações Gerais */}
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Informações Gerais
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                label="Título *"
                placeholder="Ex: Instalação Piso Porcelanato - Sala"
                value={form.title}
                onChange={(e) => updateField("title", e.target.value)}
                error={errors.title}
              />
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none text-foreground/80">Descrição</label>
                <textarea
                  placeholder="Descreva os detalhes do serviço..."
                  value={form.description}
                  onChange={(e) => updateField("description", e.target.value)}
                  rows={3}
                  className="flex w-full rounded-xl border border-input bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 focus-visible:border-primary transition-all duration-200 resize-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none text-foreground/80">Histórico</label>
                <textarea
                  placeholder="Contexto / observações iniciais"
                  value={form.historico}
                  onChange={(e) => updateField("historico", e.target.value)}
                  rows={3}
                  className="flex w-full rounded-xl border border-input bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 focus-visible:border-primary transition-all duration-200 resize-none"
                />
              </div>
              <div className={cn("grid grid-cols-1 gap-4", !isPartner && "md:grid-cols-2")}>
                <SelectNative
                  label="Prioridade"
                  value={form.priority}
                  onChange={(e) => updateField("priority", e.target.value)}
                >
                  {Object.values(OsPriority).map((p) => (
                    <option key={p} value={p}>{OS_PRIORITY_LABELS[p]}</option>
                  ))}
                </SelectNative>
                {!isPartner && (
                  <SelectNative
                    label="Parceiro"
                    value={form.partner_id}
                    onChange={(e) => updateField("partner_id", e.target.value)}
                    disabled={loadingDropdowns}
                  >
                    <option value="">{loadingDropdowns ? "Carregando..." : "Selecione um parceiro (opcional)"}</option>
                    {partners.map((p) => (
                      <option key={p.id} value={p.id}>{p.company_name}</option>
                    ))}
                  </SelectNative>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Cliente */}
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                Dados do Cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Input
                  label="Nome do Cliente *"
                  placeholder="Nome completo ou razão social"
                  value={form.client_name}
                  onChange={(e) => updateField("client_name", e.target.value)}
                  error={errors.client_name}
                />
                <Input
                  label="Telefone"
                  placeholder="(11) 99999-9999"
                  value={form.client_phone}
                  onChange={(e) => updateField("client_phone", e.target.value)}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Input
                  label="E-mail"
                  type="email"
                  placeholder="email@exemplo.com"
                  value={form.client_email}
                  onChange={(e) => updateField("client_email", e.target.value)}
                />
                <Input
                  label="CPF / CNPJ"
                  placeholder="000.000.000-00"
                  value={form.client_document}
                  onChange={(e) => updateField("client_document", e.target.value)}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Input
                  label="Contato"
                  placeholder="Nome da pessoa de contato"
                  value={form.client_contact_name}
                  onChange={(e) => updateField("client_contact_name", e.target.value)}
                />
                <Input
                  label="RG / Inscrição Estadual"
                  placeholder="00.000.000-0"
                  value={form.client_rg_ie}
                  onChange={(e) => updateField("client_rg_ie", e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Endereço */}
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                Endereço
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="md:col-span-2">
                  <Input label="Rua" placeholder="Nome da rua" value={form.address_street} onChange={(e) => updateField("address_street", e.target.value)} />
                </div>
                <Input label="Número" placeholder="123" value={form.address_number} onChange={(e) => updateField("address_number", e.target.value)} />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Input label="Complemento" placeholder="Apto, Bloco, Sala..." value={form.address_complement} onChange={(e) => updateField("address_complement", e.target.value)} />
                <Input label="Bairro" placeholder="Nome do bairro" value={form.address_neighborhood} onChange={(e) => updateField("address_neighborhood", e.target.value)} />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Input label="Cidade" placeholder="Nome da cidade" value={form.address_city} onChange={(e) => updateField("address_city", e.target.value)} />
                <SelectNative label="Estado" value={form.address_state} onChange={(e) => updateField("address_state", e.target.value)}>
                  <option value="">Selecione...</option>
                  {BR_STATES.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
                </SelectNative>
                <Input label="CEP" placeholder="00000-000" value={form.address_zip} onChange={(e) => updateField("address_zip", e.target.value)} />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Agendamento */}
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Agendamento
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className={cn("grid grid-cols-1 gap-4 md:grid-cols-2", !isPartner && "lg:grid-cols-4")}>
                <Input label="Data Agendada" type="date" value={form.scheduled_date} onChange={(e) => updateField("scheduled_date", e.target.value)} />
                <Input label="Horário Início" type="time" value={form.scheduled_start_time} onChange={(e) => updateField("scheduled_start_time", e.target.value)} />
                <Input label="Horário Fim" type="time" value={form.scheduled_end_time} onChange={(e) => updateField("scheduled_end_time", e.target.value)} />
                {!isPartner && (
                  <SelectNative label="Técnico" value={form.technician_id} onChange={(e) => updateField("technician_id", e.target.value)} disabled={loadingDropdowns}>
                    <option value="">{loadingDropdowns ? "Carregando..." : "Selecione um técnico"}</option>
                    {technicians.map((t) => (<option key={t.id} value={t.id}>{t.full_name}</option>))}
                  </SelectNative>
                )}
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Input
                  label="Previsão de Conclusão"
                  type="date"
                  value={form.previsao_conclusao}
                  onChange={(e) => updateField("previsao_conclusao", e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Produtos e Servicos */}
        {!isPartner && (
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-primary" />
                  Produtos e Serviços
                </CardTitle>
                <Button variant="outline" size="sm" onClick={addItem}>
                  <Plus className="h-4 w-4" />
                  Adicionar item
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {items.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Nenhum item adicionado. Clique em &quot;Adicionar item&quot; para incluir produtos ou serviços.
                  </p>
                ) : (
                  items.map((it, idx) => {
                    const total = parseNum(it.unit_value) * parseNum(it.quantity);
                    return (
                      <div key={idx} className="rounded-xl border bg-muted/30 p-3 space-y-2">
                        <div className="grid grid-cols-12 gap-2">
                          <div className="col-span-2">
                            <SelectNative
                              label="Tipo"
                              value={it.kind}
                              onChange={(e) => updateItem(idx, "kind", e.target.value as "S" | "P")}
                            >
                              <option value="S">Serviço</option>
                              <option value="P">Produto</option>
                            </SelectNative>
                          </div>
                          <div className="col-span-2">
                            <Input
                              label="Identif."
                              placeholder="009"
                              value={it.identification}
                              onChange={(e) => updateItem(idx, "identification", e.target.value)}
                            />
                          </div>
                          <div className="col-span-8">
                            <Input
                              label="Descrição *"
                              placeholder="Descrição do produto/serviço"
                              value={it.description}
                              onChange={(e) => updateItem(idx, "description", e.target.value)}
                              error={errors[`item_${idx}`]}
                            />
                          </div>
                          <div className="col-span-2">
                            <SelectNative
                              label="Unidade"
                              value={it.unit}
                              onChange={(e) => updateItem(idx, "unit", e.target.value)}
                            >
                              {UNIT_OPTIONS.map((u) => (<option key={u} value={u}>{u}</option>))}
                            </SelectNative>
                          </div>
                          <div className="col-span-3">
                            <Input
                              label="Valor Unit."
                              type="number"
                              min="0"
                              step="0.01"
                              value={it.unit_value}
                              onChange={(e) => updateItem(idx, "unit_value", e.target.value)}
                            />
                          </div>
                          <div className="col-span-2">
                            <Input
                              label="Qtde"
                              type="number"
                              min="0"
                              step="0.001"
                              value={it.quantity}
                              onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                            />
                          </div>
                          <div className="col-span-3 flex flex-col">
                            <label className="text-sm font-medium leading-none text-foreground/80 mb-2">Total</label>
                            <div className="flex h-11 items-center rounded-xl border bg-background px-4 text-sm font-semibold">
                              {formatBRL(total)}
                            </div>
                          </div>
                          <div className="col-span-2 flex items-end">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeItem(idx)}
                              className="h-11 w-11 text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Totais */}
        {!isPartner && (
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-primary" />
                  Totais
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-2">
                  <span className="text-sm font-medium">Subtotal (Produtos + Serviços)</span>
                  <span className="text-sm font-semibold">{formatBRL(subtotal)}</span>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <Input label="Acréscimo" type="number" min="0" step="0.01" value={form.acrescimo} onChange={(e) => updateField("acrescimo", e.target.value)} />
                  <Input label="Desconto" type="number" min="0" step="0.01" value={form.desconto} onChange={(e) => updateField("desconto", e.target.value)} />
                  <Input label="Vale Troca" type="number" min="0" step="0.01" value={form.vale_troca} onChange={(e) => updateField("vale_troca", e.target.value)} />
                </div>
                <div className="flex items-center justify-between rounded-xl border-2 border-primary bg-primary/10 px-4 py-3">
                  <span className="text-base font-bold">Total Líquido</span>
                  <span className="text-lg font-bold text-primary">{formatBRL(totalLiquido)}</span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Parcelas */}
        {!isPartner && (
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-primary" />
                  Parcelas
                </CardTitle>
                <Button variant="outline" size="sm" onClick={addPayment}>
                  <Plus className="h-4 w-4" />
                  Adicionar parcela
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {payments.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Nenhuma parcela adicionada.
                  </p>
                ) : (
                  payments.map((pm, idx) => (
                    <div key={idx} className="rounded-xl border bg-muted/30 p-3">
                      <div className="grid grid-cols-12 gap-2">
                        <div className="col-span-3">
                          <SelectNative label="Tipo" value={pm.payment_type} onChange={(e) => updatePayment(idx, "payment_type", e.target.value)}>
                            {PAYMENT_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
                          </SelectNative>
                        </div>
                        <div className="col-span-2">
                          <Input label="Número" placeholder="1/3" value={pm.number_label} onChange={(e) => updatePayment(idx, "number_label", e.target.value)} />
                        </div>
                        <div className="col-span-2">
                          <Input label="Num.Doc" placeholder="DOC-001" value={pm.doc_number} onChange={(e) => updatePayment(idx, "doc_number", e.target.value)} />
                        </div>
                        <div className="col-span-2">
                          <Input label="Vencimento" type="date" value={pm.due_date} onChange={(e) => updatePayment(idx, "due_date", e.target.value)} />
                        </div>
                        <div className="col-span-2">
                          <Input label="Valor" type="number" min="0" step="0.01" value={pm.value} onChange={(e) => updatePayment(idx, "value", e.target.value)} />
                        </div>
                        <div className="col-span-1 flex items-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removePayment(idx)}
                            className="h-11 w-11 text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Financeiro */}
        {!isPartner && (
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-primary" />
                  Financeiro (resumo)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-w-sm">
                  <Input
                    label="Valor Estimado (R$)"
                    type="number"
                    placeholder="0,00"
                    min="0"
                    step="0.01"
                    value={form.estimated_value}
                    onChange={(e) => updateField("estimated_value", e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Observações */}
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                Observações
              </CardTitle>
            </CardHeader>
            <CardContent>
              <textarea
                placeholder="Observações adicionais sobre a OS..."
                value={form.notes}
                onChange={(e) => updateField("notes", e.target.value)}
                rows={4}
                className="flex w-full rounded-xl border border-input bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 focus-visible:border-primary transition-all duration-200 resize-none"
              />
            </CardContent>
          </Card>
        </motion.div>

        {/* Actions */}
        <motion.div variants={itemVariants} className="flex items-center justify-end gap-3 pb-6">
          <Button variant="outline" onClick={() => router.back()}>Cancelar</Button>
          <Button onClick={handleSubmit} isLoading={isSubmitting}>
            <Save className="h-4 w-4" />
            {isPartner ? "Abrir Chamado" : "Criar OS"}
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
}
