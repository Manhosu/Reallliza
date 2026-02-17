"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileBarChart,
  Users,
  Building2,
  Wrench,
  DollarSign,
  Shield,
  Download,
  ChevronRight,
  FileText,
  ArrowLeft,
  CalendarDays,
  Eye,
  CheckCircle2,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { reportsApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

// ============================================================
// Types
// ============================================================

interface ReportType {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  accentColor: string;
  filters: ReportFilter[];
}

interface ReportFilter {
  id: string;
  label: string;
  type: "select" | "text";
  options?: { value: string; label: string }[];
  placeholder?: string;
}

// ============================================================
// Report Definitions
// ============================================================

const reportTypes: ReportType[] = [
  {
    id: "os-periodo",
    title: "OS por Período",
    description: "Relatório de ordens de serviço filtrado por período",
    icon: <FileBarChart className="h-6 w-6" />,
    accentColor: "#EAB308",
    filters: [
      {
        id: "status",
        label: "Status",
        type: "select",
        options: [
          { value: "all", label: "Todos" },
          { value: "pending", label: "Pendente" },
          { value: "in_progress", label: "Em Andamento" },
          { value: "completed", label: "Concluída" },
          { value: "cancelled", label: "Cancelada" },
        ],
      },
    ],
  },
  {
    id: "os-tecnico",
    title: "OS por Técnico",
    description: "Performance e produtividade por técnico",
    icon: <Users className="h-6 w-6" />,
    accentColor: "#3B82F6",
    filters: [
      {
        id: "technician",
        label: "Técnico",
        type: "select",
        options: [
          { value: "all", label: "Todos" },
          { value: "u1", label: "Carlos Silva" },
          { value: "u2", label: "João Mendes" },
          { value: "u3", label: "Ana Costa" },
          { value: "u4", label: "Pedro Lima" },
        ],
      },
    ],
  },
  {
    id: "os-parceiro",
    title: "OS por Parceiro",
    description: "Serviços realizados por parceiro",
    icon: <Building2 className="h-6 w-6" />,
    accentColor: "#22C55E",
    filters: [
      {
        id: "partner",
        label: "Parceiro",
        type: "select",
        options: [
          { value: "all", label: "Todos" },
          { value: "p1", label: "Construtora Alpha" },
          { value: "p2", label: "Imobiliária Beta" },
          { value: "p3", label: "Engenharia Gamma" },
        ],
      },
    ],
  },
  {
    id: "ferramentas-custodia",
    title: "Ferramentas em Custódia",
    description: "Controle de ferramentas em posse dos técnicos",
    icon: <Wrench className="h-6 w-6" />,
    accentColor: "#F97316",
    filters: [
      {
        id: "technician",
        label: "Técnico",
        type: "select",
        options: [
          { value: "all", label: "Todos" },
          { value: "u1", label: "Carlos Silva" },
          { value: "u2", label: "João Mendes" },
          { value: "u3", label: "Ana Costa" },
          { value: "u4", label: "Pedro Lima" },
        ],
      },
    ],
  },
  {
    id: "financeiro",
    title: "Financeiro",
    description: "Receitas, custos e margens por período",
    icon: <DollarSign className="h-6 w-6" />,
    accentColor: "#8B5CF6",
    filters: [
      {
        id: "category",
        label: "Categoria",
        type: "select",
        options: [
          { value: "all", label: "Todas" },
          { value: "revenue", label: "Receitas" },
          { value: "cost", label: "Custos" },
          { value: "margin", label: "Margens" },
        ],
      },
    ],
  },
  {
    id: "auditoria",
    title: "Auditoria",
    description: "Log de ações dos usuários no sistema",
    icon: <Shield className="h-6 w-6" />,
    accentColor: "#EC4899",
    filters: [
      {
        id: "user",
        label: "Usuário",
        type: "select",
        options: [
          { value: "all", label: "Todos" },
          { value: "u1", label: "Carlos Silva" },
          { value: "u2", label: "João Mendes" },
          { value: "admin", label: "Administrador" },
        ],
      },
      {
        id: "action",
        label: "Ação",
        type: "select",
        options: [
          { value: "all", label: "Todas" },
          { value: "create", label: "Criação" },
          { value: "update", label: "Atualização" },
          { value: "delete", label: "Exclusão" },
        ],
      },
    ],
  },
];

// ============================================================
// Report ID -> API endpoint mapping
// ============================================================

const reportEndpointMap: Record<string, string> = {
  "os-periodo": "os-by-period",
  "os-tecnico": "os-by-technician",
  "os-parceiro": "os-by-partner",
  "ferramentas-custodia": "tools-custody",
  "financeiro": "financial",
  "auditoria": "audit",
};

// ============================================================
// Report Card Skeleton
// ============================================================

function ReportCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <Skeleton className="h-12 w-12 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Relatorios Page
// ============================================================

export default function RelatoriosPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<ReportType | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [downloadingFormat, setDownloadingFormat] = useState<"pdf" | "excel" | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  const handleSelectReport = (report: ReportType) => {
    setSelectedReport(report);
    setDateFrom("");
    setDateTo("");
    setFilterValues({});
    setShowPreview(false);
  };

  const handleBackToList = () => {
    setSelectedReport(null);
  };

  const handlePreview = () => {
    setShowPreview(true);
  };

  const getFilterLabel = (filterId: string, value: string): string => {
    if (!selectedReport) return value;
    const filter = selectedReport.filters.find((f) => f.id === filterId);
    if (!filter || !filter.options) return value;
    const option = filter.options.find((o) => o.value === value);
    return option?.label || value;
  };

  const formatDateBR = (dateStr: string): string => {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split("-");
    return `${d}/${m}/${y}`;
  };

  const handleGenerate = async (exportType: "pdf" | "excel") => {
    if (!selectedReport) return;

    const endpoint = reportEndpointMap[selectedReport.id];
    if (!endpoint) {
      toast.error("Tipo de relatório não suportado.");
      return;
    }

    setDownloadingFormat(exportType);

    try {
      // Build params from filters + dates
      const params: Record<string, string> = {
        format: exportType,
      };

      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;

      for (const [key, value] of Object.entries(filterValues)) {
        if (value && value !== "all") {
          params[key] = value;
        }
      }

      await reportsApi.download(endpoint, params);
      toast.success("Relatório baixado com sucesso!");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao gerar relatório.";
      toast.error(message);
    } finally {
      setDownloadingFormat(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-1"
      >
        <div className="flex items-center gap-3">
          {selectedReport && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBackToList}
              className="shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <div>
            <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
              {selectedReport ? selectedReport.title : "Relatórios"}
            </h1>
            <p className="text-muted-foreground">
              {selectedReport
                ? selectedReport.description
                : "Gere relatórios detalhados para análise e tomada de decisão."}
            </p>
          </div>
        </div>
      </motion.div>

      <AnimatePresence mode="wait">
        {!selectedReport ? (
          /* ============================== REPORT LIST ============================== */
          <motion.div
            key="report-list"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            {isLoading ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <ReportCardSkeleton key={i} />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {reportTypes.map((report, index) => (
                  <motion.div
                    key={report.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.06, duration: 0.4 }}
                  >
                    <Card
                      hover
                      className="group cursor-pointer overflow-hidden"
                      onClick={() => handleSelectReport(report)}
                    >
                      {/* Top accent line */}
                      <div
                        className="h-[2px]"
                        style={{ background: report.accentColor }}
                      />
                      <CardContent className="p-6">
                        <div className="flex items-start gap-4">
                          {/* Icon */}
                          <div
                            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110"
                            style={{
                              background: `${report.accentColor}15`,
                              color: report.accentColor,
                            }}
                          >
                            {report.icon}
                          </div>

                          {/* Info */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <h3 className="text-sm font-semibold">
                                {report.title}
                              </h3>
                              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5" />
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {report.description}
                            </p>
                          </div>
                        </div>

                        {/* Gerar Button */}
                        <div className="mt-4 flex justify-end">
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                            <FileText className="h-3.5 w-3.5" />
                            Gerar
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        ) : (
          /* ============================== REPORT DETAIL ============================== */
          <motion.div
            key="report-detail"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            {/* Filters Card */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarDays className="h-5 w-5 text-primary" />
                  Filtros do Relatório
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Date Range */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input
                    type="date"
                    label="Data Inicial"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                  <Input
                    type="date"
                    label="Data Final"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </div>

                {/* Additional Filters */}
                {selectedReport.filters.length > 0 && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {selectedReport.filters.map((filter) => (
                      <div key={filter.id} className="w-full space-y-2">
                        <label className="text-sm font-medium leading-none text-foreground/80">
                          {filter.label}
                        </label>
                        {filter.type === "select" && filter.options ? (
                          <select
                            value={filterValues[filter.id] || "all"}
                            onChange={(e) =>
                              setFilterValues((prev) => ({
                                ...prev,
                                [filter.id]: e.target.value,
                              }))
                            }
                            className="flex h-11 w-full rounded-xl border border-input bg-background px-4 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 focus-visible:border-primary transition-all duration-200"
                          >
                            {filter.options.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Input
                            placeholder={filter.placeholder}
                            value={filterValues[filter.id] || ""}
                            onChange={(e) =>
                              setFilterValues((prev) => ({
                                ...prev,
                                [filter.id]: e.target.value,
                              }))
                            }
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row">
                  <Button
                    variant="outline"
                    onClick={handlePreview}
                    disabled={downloadingFormat !== null}
                    className="flex-1 sm:flex-none"
                  >
                    <Eye className="h-4 w-4" />
                    Visualizar
                  </Button>
                  <Button
                    onClick={() => handleGenerate("pdf")}
                    isLoading={downloadingFormat === "pdf"}
                    disabled={downloadingFormat !== null}
                    className="flex-1 sm:flex-none"
                  >
                    <Download className="h-4 w-4" />
                    Baixar PDF
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleGenerate("excel")}
                    isLoading={downloadingFormat === "excel"}
                    disabled={downloadingFormat !== null}
                    className="flex-1 sm:flex-none"
                  >
                    <Download className="h-4 w-4" />
                    Baixar Excel
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Preview Summary / Placeholder Area */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
            >
              <AnimatePresence mode="wait">
                {showPreview ? (
                  <motion.div
                    key="preview"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Card className="overflow-hidden">
                      <div
                        className="h-[2px]"
                        style={{ background: selectedReport.accentColor }}
                      />
                      <CardHeader className="pb-4">
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Eye className="h-5 w-5 text-primary" />
                          Pré-visualização do Relatório
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Report summary info */}
                        <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                            <span className="text-sm font-medium">
                              Relatório pronto para gerar
                            </span>
                          </div>

                          {/* Summary table */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between border-b border-border py-2">
                              <span className="text-sm text-muted-foreground">
                                Tipo de Relatório
                              </span>
                              <span className="text-sm font-medium">
                                {selectedReport.title}
                              </span>
                            </div>

                            <div className="flex items-center justify-between border-b border-border py-2">
                              <span className="text-sm text-muted-foreground">
                                Período
                              </span>
                              <span className="text-sm font-medium">
                                {dateFrom && dateTo
                                  ? `${formatDateBR(dateFrom)} a ${formatDateBR(dateTo)}`
                                  : dateFrom
                                  ? `A partir de ${formatDateBR(dateFrom)}`
                                  : dateTo
                                  ? `Até ${formatDateBR(dateTo)}`
                                  : "Todos os períodos"}
                              </span>
                            </div>

                            {selectedReport.filters.map((filter) => {
                              const value = filterValues[filter.id] || "all";
                              return (
                                <div
                                  key={filter.id}
                                  className="flex items-center justify-between border-b border-border py-2 last:border-b-0"
                                >
                                  <span className="text-sm text-muted-foreground">
                                    {filter.label}
                                  </span>
                                  <span className="text-sm font-medium">
                                    {getFilterLabel(filter.id, value)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Info message */}
                        <div className="flex items-start gap-3 rounded-xl bg-primary/5 border border-primary/15 p-3">
                          <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                          <div className="text-xs text-muted-foreground">
                            <p>
                              Clique em <strong>Baixar PDF</strong> ou{" "}
                              <strong>Baixar Excel</strong> acima para gerar e
                              baixar o relatório com os parâmetros configurados.
                            </p>
                          </div>
                        </div>

                        {/* Quick download buttons */}
                        <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                          <Button
                            onClick={() => handleGenerate("pdf")}
                            isLoading={downloadingFormat === "pdf"}
                            disabled={downloadingFormat !== null}
                            className="flex-1 sm:flex-none"
                          >
                            <Download className="h-4 w-4" />
                            Baixar PDF
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => handleGenerate("excel")}
                            isLoading={downloadingFormat === "excel"}
                            disabled={downloadingFormat !== null}
                            className="flex-1 sm:flex-none"
                          >
                            <Download className="h-4 w-4" />
                            Baixar Excel
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ) : (
                  <motion.div
                    key="placeholder"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Card className="overflow-hidden">
                      <div
                        className="h-[2px]"
                        style={{ background: selectedReport.accentColor }}
                      />
                      <CardContent className="flex flex-col items-center justify-center py-20">
                        <div
                          className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
                          style={{
                            background: `${selectedReport.accentColor}10`,
                            color: selectedReport.accentColor,
                          }}
                        >
                          <FileBarChart className="h-8 w-8" />
                        </div>
                        <p className="text-center text-sm font-medium text-muted-foreground">
                          Selecione os filtros e clique em{" "}
                          <strong>Visualizar</strong> para conferir os parâmetros,
                          ou exporte diretamente
                        </p>
                        <p className="mt-1 text-center text-xs text-muted-foreground/60">
                          O relatório será gerado com base nos parâmetros
                          definidos acima
                        </p>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
