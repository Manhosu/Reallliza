"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Minus, Plus, ArrowLeft, AlertCircle, Package, Calculator, Building2, Users } from "lucide-react";
import { toast } from "sonner";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { servicesApi, quotesApi } from "@/lib/api";
import { apiClient } from "@/lib/api/client";
import type { Service } from "@/lib/api/services";
import { ApiError } from "@/lib/api/client";
import { assertFreshSession } from "@/lib/api/session-guard";
import { AvailabilityDatePicker } from "@/components/quotes/availability-date-picker";

type Modality = "reallliza" | "homologados";

interface CalcResult {
  subtotal_services: number;
  total_hours: number;
  total_days: number;
  travel_distance_km: number;
  travel_cost: number;
  stay_count: number;
  stay_cost: number;
  is_special_hour: boolean;
  special_hour_extra: number;
  total_amount: number;
  platform_fee_pct: number;
  platform_fee_amount: number;
  payout_amount: number;
  warnings: string[];
}

const DRAFT_KEY = "orcamento-novo-draft-v1";

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function maskCpfCnpj(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 11) {
    // CPF: 000.000.000-00
    return digits
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
  }
  // CNPJ: 00.000.000/0000-00
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
}

function maskCep(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return digits.replace(/^(\d{5})(\d)/, "$1-$2");
}

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/^(\(\d{2}\)) (\d{4})(\d)/, "$1 $2-$3");
  }
  return digits
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/^(\(\d{2}\)) (\d{5})(\d)/, "$1 $2-$3");
}

/**
 * Validacao de CPF (algoritmo dos digitos verificadores). Retorna true se valido.
 */
function isValidCpf(value: string): boolean {
  const cpf = value.replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf[i]) * (10 - i);
  let check = 11 - (sum % 11);
  if (check >= 10) check = 0;
  if (check !== parseInt(cpf[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf[i]) * (11 - i);
  check = 11 - (sum % 11);
  if (check >= 10) check = 0;
  return check === parseInt(cpf[10]);
}

/**
 * Validacao de CNPJ.
 */
function isValidCnpj(value: string): boolean {
  const cnpj = value.replace(/\D/g, "");
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const calc = (digs: string, weights: number[]) => {
    const sum = weights.reduce((acc, w, i) => acc + parseInt(digs[i]) * w, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return (
    calc(cnpj.slice(0, 12), weights1) === parseInt(cnpj[12]) &&
    calc(cnpj.slice(0, 13), weights2) === parseInt(cnpj[13])
  );
}

function isValidDoc(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) return isValidCpf(digits);
  if (digits.length === 14) return isValidCnpj(digits);
  return false;
}

interface ViaCepResponse {
  cep?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
}

async function fetchViaCep(cep: string): Promise<ViaCepResponse | null> {
  const digits = cep.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    if (!res.ok) return null;
    const data = (await res.json()) as ViaCepResponse;
    if (data.erro) return null;
    return data;
  } catch {
    return null;
  }
}

export default function NovoOrcamentoPage() {
  const router = useRouter();
  const [services, setServices] = useState<Service[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientWhatsapp, setClientWhatsapp] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientDocument, setClientDocument] = useState("");
  const [addressStreet, setAddressStreet] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [addressComplement, setAddressComplement] = useState("");
  const [addressNeighborhood, setAddressNeighborhood] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [addressZip, setAddressZip] = useState("");
  const [notes, setNotes] = useState("");
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);

  // Fase 2 — modalidade + calculo
  const [modality, setModality] = useState<Modality>("reallliza");
  const [serviceDate, setServiceDate] = useState("");
  const [serviceTime, setServiceTime] = useState("");
  // Modalidade homologados
  const [manualTotal, setManualTotal] = useState("");
  const [regionCity, setRegionCity] = useState("");
  const [regionState, setRegionState] = useState("");
  // Campos do PDF novo (Jessica 10/07)
  const [serviceType, setServiceType] = useState("");
  const [totalAreaM2, setTotalAreaM2] = useState("");
  const [rooms, setRooms] = useState("");
  const [scheduleTimeLabel, setScheduleTimeLabel] = useState("08h às 17h");
  const [materialDescription, setMaterialDescription] = useState("");
  const [executionStartDate, setExecutionStartDate] = useState("");
  const [importantNotes, setImportantNotes] = useState("");
  const [generalNotes, setGeneralNotes] = useState("");
  // Anexos (Jessica 16/07)
  type FileAttachment = { url: string; name: string; storage_path: string };
  const [projectFiles, setProjectFiles] = useState<FileAttachment[]>([]);
  const [materialFiles, setMaterialFiles] = useState<FileAttachment[]>([]);
  const [uploadingProject, setUploadingProject] = useState(false);
  const [uploadingMaterial, setUploadingMaterial] = useState(false);
  // Filtro por categoria de servicos (Jessica 16/07)
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  // Calculo (preview)
  const [calc, setCalc] = useState<CalcResult | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);
  // Cobertura UF (Jessica 24/06): filtra modalidades disponiveis por UF do endereco
  const [availability, setAvailability] = useState<{
    platform_available: boolean;
    reallliza_available: boolean;
  } | null>(null);
  // Preview de foto do servico (lightbox)
  const [photoPreview, setPhotoPreview] = useState<{
    url: string;
    title: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setServices(await servicesApi.list());
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar serviços");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Cobertura UF (Jessica 24/06) — busca availability sempre que addressState mudar.
  // Se UF esta desabilitada na Reallliza, o botao "Reallliza executa" some.
  useEffect(() => {
    const uf = addressState.toUpperCase();
    if (uf.length !== 2) {
      setAvailability(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await apiClient.get<{
          platform_available: boolean;
          reallliza_available: boolean;
        }>(`/quotes/availability?state=${uf}`);
        if (!cancelled) {
          setAvailability(data);
          // Se a modalidade selecionada perdeu disponibilidade, resetar
          if (modality === "reallliza" && !data.reallliza_available) {
            setModality("homologados");
          }
        }
      } catch (err) {
        console.error("availability check failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressState]);

  // BUG-001: restaura rascunho do orçamento (sessão expirada não perde dados).
  useEffect(() => {
    if (draftRestored) return;
    setDraftRestored(true);
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as {
        clientName?: string;
        clientPhone?: string;
        clientWhatsapp?: string;
        clientEmail?: string;
        clientDocument?: string;
        addressStreet?: string;
        addressNumber?: string;
        addressComplement?: string;
        addressNeighborhood?: string;
        addressCity?: string;
        addressState?: string;
        addressZip?: string;
        notes?: string;
        quantities?: Record<string, number>;
        serviceType?: string;
        totalAreaM2?: string;
        rooms?: string;
        executionStartDate?: string;
        scheduleTimeLabel?: string;
        materialDescription?: string;
        importantNotes?: string;
        generalNotes?: string;
        projectFiles?: FileAttachment[];
        materialFiles?: FileAttachment[];
      };
      if (d.clientName) setClientName(d.clientName);
      if (d.clientPhone) setClientPhone(d.clientPhone);
      if (d.clientWhatsapp) setClientWhatsapp(d.clientWhatsapp);
      if (d.clientEmail) setClientEmail(d.clientEmail);
      if (d.clientDocument) setClientDocument(d.clientDocument);
      if (d.addressStreet) setAddressStreet(d.addressStreet);
      if (d.addressNumber) setAddressNumber(d.addressNumber);
      if (d.addressComplement) setAddressComplement(d.addressComplement);
      if (d.addressNeighborhood) setAddressNeighborhood(d.addressNeighborhood);
      if (d.addressCity) setAddressCity(d.addressCity);
      if (d.addressState) setAddressState(d.addressState);
      if (d.addressZip) setAddressZip(d.addressZip);
      if (d.notes) setNotes(d.notes);
      if (d.quantities) setQuantities(d.quantities);
      if (d.serviceType) setServiceType(d.serviceType);
      if (d.totalAreaM2) setTotalAreaM2(d.totalAreaM2);
      if (d.rooms) setRooms(d.rooms);
      if (d.executionStartDate) setExecutionStartDate(d.executionStartDate);
      if (d.scheduleTimeLabel) setScheduleTimeLabel(d.scheduleTimeLabel);
      if (d.materialDescription) setMaterialDescription(d.materialDescription);
      if (d.importantNotes) setImportantNotes(d.importantNotes);
      if (d.generalNotes) setGeneralNotes(d.generalNotes);
      if (Array.isArray(d.projectFiles)) setProjectFiles(d.projectFiles);
      if (Array.isArray(d.materialFiles)) setMaterialFiles(d.materialFiles);
      toast.info("Rascunho restaurado", {
        description: "Continue de onde parou e clique em Gerar orçamento.",
        action: {
          label: "Limpar",
          onClick: () => localStorage.removeItem(DRAFT_KEY),
        },
      });
    } catch {
      /* rascunho corrompido — ignora */
    }
  }, [draftRestored]);

  function setQty(serviceId: string, qty: number) {
    setQuantities((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[serviceId];
      else next[serviceId] = qty;
      return next;
    });
  }

  const selected = useMemo(
    () =>
      services
        .filter((s) => (quantities[s.id] ?? 0) > 0)
        .map((s) => ({
          service: s,
          quantity: quantities[s.id],
          subtotal: (s.commercial_price || 0) * quantities[s.id],
        })),
    [services, quantities]
  );

  const total = selected.reduce((s, i) => s + i.subtotal, 0);

  async function handleCalculate() {
    if (selected.length === 0) {
      setError("Selecione ao menos um serviço antes de calcular.");
      return;
    }
    setError(null);
    setCalcLoading(true);
    try {
      const result = await apiClient.post<CalcResult>("/quotes/calculate", {
        modality,
        items: selected.map((i) => ({
          service_id: i.service.id,
          quantity: i.quantity,
        })),
        service_address_zip: addressZip.replace(/\D/g, "") || undefined,
        service_address_city: addressCity.trim() || undefined,
        service_address_state:
          addressState.trim().toUpperCase() || undefined,
        service_address_street: addressStreet.trim() || undefined,
        service_date: serviceDate || undefined,
        service_time: serviceTime || undefined,
        manual_total_amount:
          modality === "homologados" && manualTotal
            ? Number(manualTotal.replace(",", "."))
            : undefined,
      });
      setCalc(result);
      if (result.warnings.length > 0) {
        toast.warning(result.warnings.join(" • "), { duration: 6000 });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao calcular orçamento");
      setCalc(null);
    } finally {
      setCalcLoading(false);
    }
  }

  async function handleCepBlur() {
    setCepError(null);
    const digits = addressZip.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setCepLoading(true);
    const data = await fetchViaCep(digits);
    setCepLoading(false);
    if (!data) {
      setCepError("CEP não encontrado.");
      return;
    }
    if (data.logradouro && !addressStreet) setAddressStreet(data.logradouro);
    if (data.bairro && !addressNeighborhood) setAddressNeighborhood(data.bairro);
    if (data.localidade && !addressCity) setAddressCity(data.localidade);
    if (data.uf && !addressState) setAddressState(data.uf);
  }

  // Upload de anexo pra bucket quote-files (Jessica 16/07 — planta e lista materiais)
  async function uploadQuoteFile(
    file: File,
    kind: "project" | "material"
  ): Promise<FileAttachment> {
    const supabase = createSupabaseClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    const userId = authUser?.id ?? "anon";
    const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
    const rand = Math.random().toString(36).slice(2, 8);
    const path = `${userId}/${kind}/${Date.now()}-${rand}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("quote-files")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) throw new Error(upErr.message);
    // Bucket privado — signed URL 1 ano
    const { data: signed } = await supabase.storage
      .from("quote-files")
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    return {
      url: signed?.signedUrl ?? "",
      name: file.name,
      storage_path: path,
    };
  }

  async function handleSubmit() {
    setError(null);
    if (!clientName.trim()) {
      setError("Informe o nome do cliente.");
      return;
    }
    if (clientDocument && !isValidDoc(clientDocument)) {
      setError("CPF/CNPJ inválido.");
      return;
    }
    if (clientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
      setError("E-mail inválido.");
      return;
    }
    if (selected.length === 0) {
      setError("Selecione ao menos um serviço.");
      return;
    }
    setSaving(true);

    // BUG-001: salva rascunho antes do POST.
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          clientName, clientPhone, clientWhatsapp, clientEmail, clientDocument,
          addressStreet, addressNumber, addressComplement, addressNeighborhood,
          addressCity, addressState, addressZip,
          notes, quantities,
          serviceType, totalAreaM2, rooms, executionStartDate, scheduleTimeLabel,
          materialDescription, importantNotes, generalNotes,
          projectFiles, materialFiles,
          savedAt: new Date().toISOString(),
        })
      );
    } catch { /* localStorage indisponível */ }

    const sessionCheck = await assertFreshSession();
    if (!sessionCheck.ok) {
      setSaving(false);
      toast.error("Sua sessão expirou. Faça login novamente.", {
        description: "Seu rascunho foi salvo — ele aparece quando você voltar.",
        duration: 8000,
      });
      router.push(`/login?redirectTo=${encodeURIComponent("/orcamentos/novo")}`);
      return;
    }

    // Validacoes especificas por modalidade
    if (modality === "reallliza" && !serviceDate) {
      setError("Modalidade Reallliza: informe a data de execução.");
      setSaving(false);
      return;
    }
    if (modality === "homologados") {
      if (!regionCity || !regionState) {
        setError("Modalidade Homologados: informe cidade e UF da publicação.");
        setSaving(false);
        return;
      }
    }

    try {
      const quote = await quotesApi.create({
        client_name: clientName.trim(),
        client_phone: clientPhone.replace(/\D/g, "") || undefined,
        client_whatsapp: clientWhatsapp.replace(/\D/g, "") || undefined,
        client_email: clientEmail.trim() || undefined,
        client_document: clientDocument.replace(/\D/g, "") || undefined,
        address_street: addressStreet.trim() || undefined,
        address_number: addressNumber.trim() || undefined,
        address_complement: addressComplement.trim() || undefined,
        address_neighborhood: addressNeighborhood.trim() || undefined,
        address_city: addressCity.trim() || undefined,
        address_state: addressState.trim().toUpperCase() || undefined,
        address_zip: addressZip.replace(/\D/g, "") || undefined,
        notes: notes.trim() || undefined,
        items: selected.map((i) => ({
          service_id: i.service.id,
          quantity: i.quantity,
        })),
        modality,
        service_date: serviceDate || undefined,
        service_time: serviceTime || undefined,
        region_city: modality === "homologados" ? regionCity : undefined,
        region_state: modality === "homologados" ? regionState : undefined,
        manual_total_amount:
          modality === "homologados" && manualTotal
            ? Number(manualTotal.replace(",", "."))
            : undefined,
        // Campos PDF (Jessica 16/07 removeu qtd_tec, resp_equipe, garantia, escopo)
        service_type: serviceType.trim() || undefined,
        total_area_m2: totalAreaM2 ? Number(totalAreaM2.replace(",", ".")) : undefined,
        rooms: rooms.trim() || undefined,
        material_description: materialDescription.trim() || undefined,
        execution_start_date: executionStartDate || undefined,
        important_notes: importantNotes.trim() || undefined,
        general_notes: generalNotes.trim() || undefined,
        // Anexos (Jessica 16/07)
        project_files: projectFiles.length > 0 ? projectFiles : undefined,
        material_files: materialFiles.length > 0 ? materialFiles : undefined,
      });
      toast.success("Orçamento criado");
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      router.push(`/orcamentos/${quote.id}`);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        toast.error("Sua sessão expirou. Faça login novamente.", {
          description: "Seu rascunho foi salvo — ele aparece quando você voltar.",
          duration: 8000,
        });
        router.push(`/login?redirectTo=${encodeURIComponent("/orcamentos/novo")}`);
        return;
      }
      setError(err instanceof Error ? err.message : "Erro ao criar orçamento");
    } finally {
      setSaving(false);
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
        <Link
          href="/orcamentos"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Orçamentos
        </Link>
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
          Novo Orçamento
        </h1>
      </motion.div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Catálogo */}
        <div className="space-y-3 lg:col-span-2">
          <h2 className="font-semibold">Serviços</h2>
          {/* Tabs de categoria (Jessica 16/07) */}
          {(() => {
            const cats = Array.from(
              new Map(
                services
                  .filter((s) => s.category)
                  .map((s) => [s.category!.id, s.category!])
              ).values()
            );
            if (cats.length === 0) return null;
            return (
              <div className="flex flex-wrap gap-1 rounded-xl bg-secondary/50 p-1">
                <button
                  type="button"
                  onClick={() => setActiveCategoryId(null)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                    activeCategoryId === null
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Todos
                </button>
                {cats.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setActiveCategoryId(c.id)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                      activeCategoryId === c.id
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            );
          })()}
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : services.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                Nenhum serviço no catálogo. Peça ao administrador para
                cadastrar serviços.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {services
                .filter(
                  (s) =>
                    !activeCategoryId || s.category?.id === activeCategoryId
                )
                .map((s) => {
                const qty = quantities[s.id] ?? 0;
                const firstPhoto = s.photos?.[0];
                return (
                  <Card key={s.id}>
                    <CardContent className="flex items-center gap-3 p-3">
                      {firstPhoto ? (
                        <button
                          type="button"
                          onClick={() => setPhotoPreview({ url: firstPhoto.url, title: s.name })}
                          className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-border hover:ring-2 hover:ring-primary transition"
                          title="Ver foto do serviço"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={firstPhoto.thumbnail_url || firstPhoto.url}
                            alt={s.name}
                            className="h-full w-full object-cover"
                          />
                        </button>
                      ) : (
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                          <Package className="h-5 w-5 text-primary" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium leading-snug">{s.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatBRL(s.commercial_price || 0)} / {s.unit}
                          {(s.photos?.length ?? 0) > 1 && (
                            <span className="ml-2 text-primary">
                              · {s.photos.length} fotos
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          onClick={() => setQty(s.id, qty - 1)}
                          disabled={qty <= 0}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="w-8 text-center text-sm font-medium">
                          {qty}
                        </span>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          onClick={() => setQty(s.id, qty + 1)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Resumo + cliente */}
        <div className="space-y-3">
          <Card>
            <CardContent className="space-y-3 p-4">
              <h2 className="font-semibold">Dados do cliente</h2>
              <Input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Nome do cliente *"
              />
              <Input
                value={maskCpfCnpj(clientDocument)}
                onChange={(e) => setClientDocument(e.target.value)}
                placeholder="CPF ou CNPJ"
                inputMode="numeric"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={maskPhone(clientPhone)}
                  onChange={(e) => setClientPhone(e.target.value)}
                  placeholder="Telefone"
                  inputMode="tel"
                />
                <Input
                  value={maskPhone(clientWhatsapp)}
                  onChange={(e) => setClientWhatsapp(e.target.value)}
                  placeholder="WhatsApp"
                  inputMode="tel"
                />
              </div>
              <Input
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                placeholder="E-mail"
                type="email"
                inputMode="email"
              />

              {/* Endereco com CEP em primeiro (ViaCEP autocomplete) */}
              <div className="space-y-2 pt-2 border-t">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Endereço
                </p>
                <Input
                  value={maskCep(addressZip)}
                  onChange={(e) => setAddressZip(e.target.value)}
                  onBlur={handleCepBlur}
                  placeholder={cepLoading ? "Buscando CEP..." : "CEP"}
                  inputMode="numeric"
                  disabled={cepLoading}
                />
                {cepError && (
                  <p className="text-xs text-destructive">{cepError}</p>
                )}
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    value={addressStreet}
                    onChange={(e) => setAddressStreet(e.target.value)}
                    placeholder="Logradouro"
                    className="col-span-2"
                  />
                  <Input
                    value={addressNumber}
                    onChange={(e) => setAddressNumber(e.target.value)}
                    placeholder="Número"
                  />
                </div>
                <Input
                  value={addressComplement}
                  onChange={(e) => setAddressComplement(e.target.value)}
                  placeholder="Complemento (opcional)"
                />
                <Input
                  value={addressNeighborhood}
                  onChange={(e) => setAddressNeighborhood(e.target.value)}
                  placeholder="Bairro"
                />
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    value={addressCity}
                    onChange={(e) => setAddressCity(e.target.value)}
                    placeholder="Cidade"
                    className="col-span-2"
                  />
                  <Input
                    value={addressState}
                    onChange={(e) =>
                      setAddressState(e.target.value.toUpperCase().slice(0, 2))
                    }
                    placeholder="UF"
                    maxLength={2}
                  />
                </div>
              </div>

              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Observações (opcional)"
                className="flex w-full rounded-xl border border-input bg-background px-4 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary"
              />
            </CardContent>
          </Card>

          {/* Modalidade (Jessica 22/06 — spec Loja Parceira; 24/06 filtro por UF) */}
          <Card>
            <CardContent className="space-y-3 p-4">
              <h2 className="font-semibold">Modalidade</h2>

              {/* Plataforma nao opera na UF -> bloqueio total */}
              {availability && !availability.platform_available && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-3 text-sm text-red-600 dark:text-red-400">
                  <AlertCircle className="mb-1 inline h-4 w-4" />
                  {" "}A plataforma ainda não opera em <strong>{addressState}</strong>.
                  Contate o administrador para habilitar essa UF.
                </div>
              )}

              {/* Reallliza nao atende essa UF -> some botao */}
              {availability &&
                availability.platform_available &&
                !availability.reallliza_available && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
                    <AlertCircle className="mb-1 inline h-3.5 w-3.5" />
                    {" "}A Reallliza não atende diretamente em{" "}
                    <strong>{addressState}</strong>. Apenas a modalidade
                    "Homologados" está disponível para esta região.
                  </div>
                )}

              <div
                className={
                  availability && !availability.reallliza_available
                    ? "grid grid-cols-1 gap-2"
                    : "grid grid-cols-2 gap-2"
                }
              >
                {/* So renderiza botao Reallliza se a Reallliza atende essa UF
                    (ou se ainda nao ha UF digitada, mantem visivel) */}
                {(!availability || availability.reallliza_available) && (
                  <button
                    type="button"
                    onClick={() => setModality("reallliza")}
                    className={`flex flex-col items-start gap-1 rounded-lg border-2 p-3 text-left transition ${
                      modality === "reallliza"
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold">Reallliza</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Equipe própria executa. Preço automático.
                    </p>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setModality("homologados")}
                  className={`flex flex-col items-start gap-1 rounded-lg border-2 p-3 text-left transition ${
                    modality === "homologados"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">Homologados</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Publica pra rede homologada. Você define o valor.
                  </p>
                </button>
              </div>

              {modality === "reallliza" && (
                <div className="space-y-2 pt-2 border-t">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Quando executar
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <AvailabilityDatePicker
                      value={serviceDate}
                      onChange={setServiceDate}
                      placeholder="Ver agenda"
                    />
                    <Input
                      type="time"
                      value={serviceTime}
                      onChange={(e) => setServiceTime(e.target.value)}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Só mostra datas com vaga. Sábado destacado (+25% sobre
                    serviços). Domingo/feriado bloqueados.
                  </p>
                </div>
              )}

              {modality === "homologados" && (
                <div className="space-y-2 pt-2 border-t">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Publicação
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={manualTotal}
                      onChange={(e) => setManualTotal(e.target.value)}
                      placeholder="Valor total (R$)"
                      type="number"
                      step="0.01"
                      min="0"
                    />
                    <Input
                      type="date"
                      value={serviceDate}
                      onChange={(e) => setServiceDate(e.target.value)}
                      placeholder="Data desejada"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      value={regionCity}
                      onChange={(e) => setRegionCity(e.target.value)}
                      placeholder="Cidade"
                      className="col-span-2"
                    />
                    <Input
                      value={regionState}
                      onChange={(e) =>
                        setRegionState(e.target.value.toUpperCase().slice(0, 2))
                      }
                      placeholder="UF"
                      maxLength={2}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Publica pra homologados da região. Primeiro a aceitar pega a OS.
                  </p>
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                onClick={handleCalculate}
                isLoading={calcLoading}
                disabled={selected.length === 0}
                className="w-full"
              >
                <Calculator className="h-4 w-4" />
                Calcular orçamento
              </Button>
            </CardContent>
          </Card>

          {/* Informacoes da Execucao (Jessica 10/07) — campos que saem no PDF novo */}
          <Card>
            <CardContent className="space-y-3 p-4">
              <h2 className="font-semibold">Informações da execução</h2>
              <p className="text-xs text-muted-foreground">
                Preenchimento livre — usado no PDF do orçamento pra descrever o
                serviço ao cliente final.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Tipo de serviço
                  </label>
                  <Input
                    value={serviceType}
                    onChange={(e) => setServiceType(e.target.value)}
                    placeholder="Ex.: Instalação de piso vinílico clicado SPC"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Área total (m²)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={totalAreaM2}
                    onChange={(e) => setTotalAreaM2(e.target.value)}
                    placeholder="Ex.: 120"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Ambientes
                  </label>
                  <Input
                    value={rooms}
                    onChange={(e) => setRooms(e.target.value)}
                    placeholder="Sala, quartos, banheiro…"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Data prevista da execução
                  </label>
                  <Input
                    type="date"
                    value={executionStartDate}
                    onChange={(e) => setExecutionStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Horário previsto
                  </label>
                  <Input
                    value={scheduleTimeLabel}
                    onChange={(e) => setScheduleTimeLabel(e.target.value)}
                    placeholder="08h às 17h"
                  />
                </div>
                {/* Material disponivel no local + anexo de lista (Jessica 16/07) */}
                <div className="space-y-1 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground">
                      Material disponível no local
                    </label>
                    <label className="cursor-pointer text-xs font-medium text-primary hover:underline">
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.xls,.xlsx,.csv,.jpg,.jpeg,.png"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setUploadingMaterial(true);
                          try {
                            const uploaded = await uploadQuoteFile(file, "material");
                            setMaterialFiles((prev) => [...prev, uploaded]);
                            toast.success("Lista de materiais anexada");
                          } catch (err) {
                            toast.error(
                              err instanceof Error ? err.message : "Erro no upload"
                            );
                          } finally {
                            setUploadingMaterial(false);
                            e.target.value = "";
                          }
                        }}
                      />
                      {uploadingMaterial ? "Enviando..." : "+ Anexar lista"}
                    </label>
                  </div>
                  <textarea
                    value={materialDescription}
                    onChange={(e) => setMaterialDescription(e.target.value)}
                    rows={2}
                    placeholder="Ex.: Piso vinílico SPC clicado - Linha Premium; Cola de vedação"
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                  />
                  {materialFiles.map((f, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-2 py-1 text-xs"
                    >
                      <a
                        href={f.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-primary hover:underline"
                      >
                        📎 {f.name}
                      </a>
                      <button
                        type="button"
                        onClick={() =>
                          setMaterialFiles((prev) =>
                            prev.filter((_, i) => i !== idx)
                          )
                        }
                        className="ml-2 text-muted-foreground hover:text-destructive"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Anexar projeto da obra (Jessica 16/07) */}
                <div className="space-y-1 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground">
                      Anexar projeto da obra (planta baixa)
                    </label>
                    <label className="cursor-pointer text-xs font-medium text-primary hover:underline">
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.dwg,.jpg,.jpeg,.png"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setUploadingProject(true);
                          try {
                            const uploaded = await uploadQuoteFile(file, "project");
                            setProjectFiles((prev) => [...prev, uploaded]);
                            toast.success("Projeto anexado");
                          } catch (err) {
                            toast.error(
                              err instanceof Error ? err.message : "Erro no upload"
                            );
                          } finally {
                            setUploadingProject(false);
                            e.target.value = "";
                          }
                        }}
                      />
                      {uploadingProject ? "Enviando..." : "+ Anexar arquivo"}
                    </label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Planta baixa ou arquivo do projeto pra equipe técnica analisar
                    previamente.
                  </p>
                  {projectFiles.map((f, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-2 py-1 text-xs"
                    >
                      <a
                        href={f.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-primary hover:underline"
                      >
                        📎 {f.name}
                      </a>
                      <button
                        type="button"
                        onClick={() =>
                          setProjectFiles((prev) =>
                            prev.filter((_, i) => i !== idx)
                          )
                        }
                        className="ml-2 text-muted-foreground hover:text-destructive"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Observacoes */}
          <Card>
            <CardContent className="space-y-3 p-4">
              <h2 className="font-semibold">Observações</h2>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Observações importantes
                </label>
                <textarea
                  value={importantNotes}
                  onChange={(e) => setImportantNotes(e.target.value)}
                  rows={3}
                  placeholder="Uma observação por linha. Ex.: Cliente responsável por liberar o ambiente."
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Observações gerais
                </label>
                <textarea
                  value={generalNotes}
                  onChange={(e) => setGeneralNotes(e.target.value)}
                  rows={2}
                  placeholder="Comentários finais que ficam no rodapé do orçamento."
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <h2 className="font-semibold">Resumo</h2>
              {selected.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum serviço selecionado.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {selected.map((i) => (
                    <div
                      key={i.service.id}
                      className="flex justify-between text-sm"
                    >
                      <span className="text-muted-foreground">
                        {i.quantity}× {i.service.name}
                      </span>
                      <span>{formatBRL(i.subtotal)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Breakdown do calculo (Fase 2) */}
              {calc && (
                <div className="space-y-1 border-t pt-2 text-sm">
                  {calc.travel_cost > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Deslocamento ({calc.travel_distance_km.toFixed(1)} km · ida+volta)</span>
                      <span>{formatBRL(calc.travel_cost)}</span>
                    </div>
                  )}
                  {calc.stay_cost > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Estadia ({calc.stay_count} diária{calc.stay_count === 1 ? "" : "s"})</span>
                      <span>{formatBRL(calc.stay_cost)}</span>
                    </div>
                  )}
                  {calc.is_special_hour && calc.special_hour_extra > 0 && (
                    <div className="flex justify-between text-amber-600 dark:text-amber-400">
                      <span>Horário especial (+25%)</span>
                      <span>{formatBRL(calc.special_hour_extra)}</span>
                    </div>
                  )}
                  {calc.total_days > 0 && (
                    <div className="flex justify-between text-xs text-muted-foreground italic">
                      <span>Duração estimada</span>
                      <span>{calc.total_hours.toFixed(1)}h ≈ {calc.total_days} dia{calc.total_days === 1 ? "" : "s"}</span>
                    </div>
                  )}
                  {modality === "homologados" && calc.platform_fee_amount > 0 && (
                    <>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Taxa Reallliza ({calc.platform_fee_pct}%)</span>
                        <span>{formatBRL(calc.platform_fee_amount)}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Repasse ao homologado</span>
                        <span>{formatBRL(calc.payout_amount)}</span>
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>Total</span>
                <span>{formatBRL(calc ? calc.total_amount : total)}</span>
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <Button
                onClick={handleSubmit}
                isLoading={saving}
                className="w-full"
              >
                Gerar orçamento
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Lightbox de foto do servico — Jessica 24/06: loja precisa ver
          a foto do serviço pra confirmar o que está contratando */}
      {photoPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPhotoPreview(null)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Escape" && setPhotoPreview(null)}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setPhotoPreview(null);
            }}
            className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Fechar"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
          <div
            className="max-h-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-2 text-center text-sm font-medium text-white">
              {photoPreview.title}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoPreview.url}
              alt={photoPreview.title}
              className="max-h-[80vh] max-w-full rounded-lg object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
