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
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectNative } from "@/components/ui/select-native";
import { cn } from "@/lib/utils";
import { OsPriority, OS_PRIORITY_LABELS, UserRole, type Partner, type Profile } from "@/lib/types";
import { serviceOrdersApi, partnersApi, usersApi } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";

// ============================================================
// Brazilian States
// ============================================================

const BR_STATES = [
  { value: "AC", label: "Acre" },
  { value: "AL", label: "Alagoas" },
  { value: "AP", label: "Amapá" },
  { value: "AM", label: "Amazonas" },
  { value: "BA", label: "Bahia" },
  { value: "CE", label: "Ceará" },
  { value: "DF", label: "Distrito Federal" },
  { value: "ES", label: "Espírito Santo" },
  { value: "GO", label: "Goiás" },
  { value: "MA", label: "Maranhão" },
  { value: "MT", label: "Mato Grosso" },
  { value: "MS", label: "Mato Grosso do Sul" },
  { value: "MG", label: "Minas Gerais" },
  { value: "PA", label: "Pará" },
  { value: "PB", label: "Paraíba" },
  { value: "PR", label: "Paraná" },
  { value: "PE", label: "Pernambuco" },
  { value: "PI", label: "Piauí" },
  { value: "RJ", label: "Rio de Janeiro" },
  { value: "RN", label: "Rio Grande do Norte" },
  { value: "RS", label: "Rio Grande do Sul" },
  { value: "RO", label: "Rondônia" },
  { value: "RR", label: "Roraima" },
  { value: "SC", label: "Santa Catarina" },
  { value: "SP", label: "São Paulo" },
  { value: "SE", label: "Sergipe" },
  { value: "TO", label: "Tocantins" },
];

// ============================================================
// Form State Interface
// ============================================================

interface FormData {
  title: string;
  description: string;
  priority: string;
  partner_id: string;
  client_name: string;
  client_phone: string;
  client_email: string;
  client_document: string;
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
  technician_id: string;
  estimated_value: string;
  notes: string;
}

interface FormErrors {
  [key: string]: string;
}

// ============================================================
// New OS Page
// ============================================================

export default function NovaOsPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isPartner = user?.role === UserRole.PARTNER;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastError, setToastError] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});

  // Dropdown data from API
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
    technician_id: "",
    estimated_value: "",
    notes: "",
  });

  // Load partners and technicians on mount
  useEffect(() => {
    let cancelled = false;

    async function loadDropdowns() {
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
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Erro ao carregar dados dos formulários";
        toast.error(message);
      } finally {
        if (!cancelled) {
          setLoadingDropdowns(false);
        }
      }
    }

    loadDropdowns();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateField = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    // Clear error on change
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    if (!form.title.trim()) newErrors.title = "Título é obrigatório";
    if (!form.client_name.trim()) newErrors.client_name = "Nome do cliente é obrigatório";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

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
      if (form.address_street) payload.address_street = form.address_street;
      if (form.address_number) payload.address_number = form.address_number;
      if (form.address_complement) payload.address_complement = form.address_complement;
      if (form.address_neighborhood) payload.address_neighborhood = form.address_neighborhood;
      if (form.address_city) payload.address_city = form.address_city;
      if (form.address_state) payload.address_state = form.address_state;
      if (form.address_zip) payload.address_zip = form.address_zip;
      if (form.scheduled_date) payload.scheduled_date = form.scheduled_date;
      if (form.estimated_value) payload.estimated_value = parseFloat(form.estimated_value);
      if (form.notes) payload.notes = form.notes;

      await serviceOrdersApi.create(payload as any);

      setToastError(false);
      setToastMessage("OS criada com sucesso");
      setShowToast(true);

      setTimeout(() => {
        router.push("/os");
      }, 1500);
    } catch (err: any) {
      setToastError(true);
      setToastMessage(err?.message || "Erro ao criar OS. Tente novamente.");
      setShowToast(true);

      setTimeout(() => {
        setShowToast(false);
      }, 4000);
    } finally {
      setIsSubmitting(false);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.08 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {showToast && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed right-6 top-20 z-50 flex items-center gap-3 rounded-xl border bg-card px-5 py-3 shadow-lg"
        >
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full",
              toastError ? "bg-red-500/15" : "bg-green-500/15"
            )}
          >
            {toastError ? (
              <AlertCircle className="h-4 w-4 text-red-500" />
            ) : (
              <Save className="h-4 w-4 text-green-500" />
            )}
          </div>
          <div>
            <p className="text-sm font-semibold">{toastMessage}</p>
            {!toastError && (
              <p className="text-xs text-muted-foreground">Redirecionando...</p>
            )}
          </div>
        </motion.div>
      )}

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-center gap-4"
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          className="shrink-0"
        >
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

      {/* Form */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="space-y-6"
      >
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
                <label className="text-sm font-medium leading-none text-foreground/80">
                  Descrição
                </label>
                <textarea
                  placeholder="Descreva os detalhes do serviço..."
                  value={form.description}
                  onChange={(e) => updateField("description", e.target.value)}
                  rows={4}
                  className={cn(
                    "flex w-full rounded-xl border border-input bg-background px-4 py-3 text-sm",
                    "placeholder:text-muted-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
                    "focus-visible:border-primary",
                    "transition-all duration-200 resize-none"
                  )}
                />
              </div>

              <div className={cn(
                "grid grid-cols-1 gap-4",
                !isPartner && "md:grid-cols-2"
              )}>
                <SelectNative
                  label="Prioridade"
                  value={form.priority}
                  onChange={(e) => updateField("priority", e.target.value)}
                >
                  {Object.values(OsPriority).map((p) => (
                    <option key={p} value={p}>
                      {OS_PRIORITY_LABELS[p]}
                    </option>
                  ))}
                </SelectNative>

                {!isPartner && (
                  <SelectNative
                    label="Parceiro"
                    value={form.partner_id}
                    onChange={(e) => updateField("partner_id", e.target.value)}
                    disabled={loadingDropdowns}
                  >
                    <option value="">
                      {loadingDropdowns
                        ? "Carregando parceiros..."
                        : "Selecione um parceiro (opcional)"}
                    </option>
                    {partners.map((partner) => (
                      <option key={partner.id} value={partner.id}>
                        {partner.company_name}
                      </option>
                    ))}
                  </SelectNative>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Dados do Cliente */}
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
                  onChange={(e) =>
                    updateField("client_document", e.target.value)
                  }
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
                  <Input
                    label="Rua"
                    placeholder="Nome da rua"
                    value={form.address_street}
                    onChange={(e) =>
                      updateField("address_street", e.target.value)
                    }
                  />
                </div>
                <Input
                  label="Número"
                  placeholder="123"
                  value={form.address_number}
                  onChange={(e) =>
                    updateField("address_number", e.target.value)
                  }
                />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Input
                  label="Complemento"
                  placeholder="Apto, Bloco, Sala..."
                  value={form.address_complement}
                  onChange={(e) =>
                    updateField("address_complement", e.target.value)
                  }
                />
                <Input
                  label="Bairro"
                  placeholder="Nome do bairro"
                  value={form.address_neighborhood}
                  onChange={(e) =>
                    updateField("address_neighborhood", e.target.value)
                  }
                />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Input
                  label="Cidade"
                  placeholder="Nome da cidade"
                  value={form.address_city}
                  onChange={(e) => updateField("address_city", e.target.value)}
                />
                <SelectNative
                  label="Estado"
                  value={form.address_state}
                  onChange={(e) => updateField("address_state", e.target.value)}
                >
                  <option value="">Selecione...</option>
                  {BR_STATES.map((state) => (
                    <option key={state.value} value={state.value}>
                      {state.label}
                    </option>
                  ))}
                </SelectNative>
                <Input
                  label="CEP"
                  placeholder="00000-000"
                  value={form.address_zip}
                  onChange={(e) => updateField("address_zip", e.target.value)}
                />
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
              <div className={cn(
                "grid grid-cols-1 gap-4 md:grid-cols-2",
                !isPartner && "lg:grid-cols-4"
              )}>
                <Input
                  label="Data Agendada"
                  type="date"
                  value={form.scheduled_date}
                  onChange={(e) =>
                    updateField("scheduled_date", e.target.value)
                  }
                />
                <Input
                  label="Horário Início"
                  type="time"
                  value={form.scheduled_start_time}
                  onChange={(e) =>
                    updateField("scheduled_start_time", e.target.value)
                  }
                />
                <Input
                  label="Horário Fim"
                  type="time"
                  value={form.scheduled_end_time}
                  onChange={(e) =>
                    updateField("scheduled_end_time", e.target.value)
                  }
                />
                {!isPartner && (
                  <SelectNative
                    label="Técnico"
                    value={form.technician_id}
                    onChange={(e) =>
                      updateField("technician_id", e.target.value)
                    }
                    disabled={loadingDropdowns}
                  >
                    <option value="">
                      {loadingDropdowns
                        ? "Carregando técnicos..."
                        : "Selecione um técnico"}
                    </option>
                    {technicians.map((tech) => (
                      <option key={tech.id} value={tech.id}>
                        {tech.full_name}
                      </option>
                    ))}
                  </SelectNative>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Financeiro - hidden for partners */}
        {!isPartner && (
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-primary" />
                  Financeiro
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
                    onChange={(e) =>
                      updateField("estimated_value", e.target.value)
                    }
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
                className={cn(
                  "flex w-full rounded-xl border border-input bg-background px-4 py-3 text-sm",
                  "placeholder:text-muted-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
                  "focus-visible:border-primary",
                  "transition-all duration-200 resize-none"
                )}
              />
            </CardContent>
          </Card>
        </motion.div>

        {/* Actions */}
        <motion.div
          variants={itemVariants}
          className="flex items-center justify-end gap-3 pb-6"
        >
          <Button variant="outline" onClick={() => router.back()}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} isLoading={isSubmitting}>
            <Save className="h-4 w-4" />
            {isPartner ? "Abrir Chamado" : "Criar OS"}
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
}
