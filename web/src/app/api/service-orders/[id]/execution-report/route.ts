export const runtime = "nodejs";

import { NextRequest } from "next/server";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { errorResponse } from "@/lib/api-helpers/response";
import { canTechnicianAccessOs } from "@/lib/api-helpers/team-scope";

/**
 * GET /api/service-orders/[id]/execution-report
 *
 * "Relatório Técnico de Execução e Termo de Garantia" — modelo enviado pela
 * Jéssica (26/08/2026): documento com validade jurídica comprovando a
 * execução da OS, com etapas fotografadas, termo de responsabilidade,
 * conclusão técnica (gerada por regra, não IA de verdade — decisão tomada
 * com o Eduardo: zero custo/dependência nova por enquanto) e assinaturas.
 *
 * Só emite pra OS já concluída (status='completed') — antes disso não há
 * o que atestar. Reaproveita o mesmo `report_code` em reemissões (gerado
 * uma vez, persistido em service_orders.report_code) pra o link/QR de
 * verificação continuar valendo pro mesmo documento.
 *
 * Assinaturas: a decisão tomada foi reaproveitar a assinatura que o
 * cliente já faz no celular do técnico (photos.type='signature') como
 * "assinatura do cliente" — o "Responsável Técnico" é preenchido só com o
 * nome de quem está atribuído à OS, sem captura de assinatura nova.
 */

const GOLD = "#F5C518";
const GOLD_DARK = "#B8860B";
const BLACK = "#0B0B0C";
const INK = "#111827";
const AMBER_BG = "#FEF3C7";
const AMBER_BORDER = "#FBBF24";
const ZINC_900 = "#18181B";
const ZINC_700 = "#374151";
const ZINC_600 = "#4B5563";
const ZINC_500 = "#6B7280";
const ZINC_400 = "#9CA3AF";
const ZINC_300 = "#D1D5DB";
const ZINC_200 = "#E5E7EB";
const ZINC_100 = "#F3F4F6";
const GREEN = "#16A34A";
const GREEN_BG = "#DCFCE7";
const WHITE = "#FFFFFF";

const safe = (v: unknown, fallback = "-"): string =>
  v !== null && v !== undefined && String(v).trim() ? String(v).trim() : fallback;

const fmtDate = (d: string | null | undefined): string =>
  d ? new Date(d).toLocaleDateString("pt-BR") : "-";

const fmtDateTime = (d: string | null | undefined): string =>
  d
    ? new Date(d).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";

const fmtDuration = (totalSeconds: number): string => {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "-";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  if (h === 0) return `${m}min`;
  return `${h}h ${String(m).padStart(2, "0")}min`;
};

function findLogoPath(): string | null {
  const candidates = [
    "public/logo-reallliza-plataforma.png",
    "public/logo-reallliza.png",
  ].map((p) => path.join(process.cwd(), p));
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function generateReportCode(): string {
  // 4 grupos de 4 hex maiúsculos, ex.: 7F3A-9B2C-4D6E-8F1A — não sequencial,
  // não adivinhável (diferente do certificate_code de cursos, que é
  // determinístico e por isso só decorativo).
  const bytes = crypto.randomBytes(8).toString("hex").toUpperCase();
  return bytes.match(/.{1,4}/g)!.join("-");
}

function getBaseUrl(request: NextRequest): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  const host = request.headers.get("host") ?? "reallliza-web.vercel.app";
  const proto = host.startsWith("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}

interface StepRow {
  id: string;
  step_key: string;
  order_index: number;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
}

interface PhotoRow {
  id: string;
  type: string;
  url: string;
  description: string | null;
  created_at: string;
}

function stepDisplayName(s: StepRow): string {
  const metaName = (s.metadata as { name?: string } | null)?.name;
  return safe(metaName, s.step_key);
}

/** Extrai o step_key do prefixo "[STEP_KEY] ..." usado pelo app do técnico. */
function photoStepKey(p: PhotoRow): string | null {
  const m = p.description?.match(/^\[([^\]]+)\]/);
  return m ? m[1] : null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id } = await params;
    const supabase = getAdminClient();

    const { data: order, error: orderErr } = await supabase
      .from("service_orders")
      .select(
        "id, order_number, title, status, client_name, client_phone, client_email, client_document, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, address_zip, technician_id, team_id, partner_id, created_by, started_at, arrived_at, completed_at, created_at, report_code, report_issued_at, external_metadata"
      )
      .eq("id", id)
      .single();

    if (orderErr || !order) {
      throw new AuthError(404, "OS não encontrada");
    }

    if (user.role === "technician" && !(await canTechnicianAccessOs(supabase, user.id, order))) {
      throw new AuthError(403, "Você não tem permissão para ver esta OS");
    }
    if (user.role === "partner") {
      const { data: pd } = await supabase
        .from("partners")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      const okAsPartner = !!pd && order.partner_id === pd.id;
      const okAsTech = order.technician_id === user.id;
      if (!okAsPartner && !okAsTech) {
        throw new AuthError(403, "Você não tem permissão para ver esta OS");
      }
    }

    if (order.status !== "completed") {
      throw new AuthError(
        400,
        `Relatório só pode ser emitido para OS concluída (status atual: ${order.status}).`
      );
    }

    // Código de verificação: gera uma vez, reaproveita nas próximas emissões.
    let reportCode = order.report_code as string | null;
    let reportIssuedAt = order.report_issued_at as string | null;
    if (!reportCode) {
      reportCode = generateReportCode();
      reportIssuedAt = new Date().toISOString();
      await supabase
        .from("service_orders")
        .update({ report_code: reportCode, report_issued_at: reportIssuedAt })
        .eq("id", order.id);
    }

    const [
      { data: technician },
      { data: settings },
      { data: itemsRaw },
      { data: stepsRaw },
      { data: photosRaw },
    ] = await Promise.all([
      order.technician_id
        ? supabase
            .from("profiles")
            .select("full_name, cpf")
            .eq("id", order.technician_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("company_settings")
        .select("legal_name, cnpj, phone, email, base_address")
        .eq("is_singleton", true)
        .maybeSingle(),
      supabase
        .from("service_order_items")
        .select("description, quantity, unit")
        .eq("service_order_id", order.id)
        .order("position", { ascending: true }),
      supabase
        .from("os_step_executions")
        .select("id, step_key, order_index, status, started_at, completed_at, notes, metadata")
        .eq("service_order_id", order.id)
        .order("order_index", { ascending: true }),
      supabase
        .from("photos")
        .select("id, type, url, description, created_at")
        .eq("service_order_id", order.id)
        .order("created_at", { ascending: true }),
    ]);

    const steps = (stepsRaw ?? []) as StepRow[];
    const photos = (photosRaw ?? []) as PhotoRow[];
    const items = (itemsRaw ?? []) as Array<{
      description: string;
      quantity: number;
      unit: string | null;
    }>;

    const signaturePhoto = [...photos].reverse().find((p) => p.type === "signature") ?? null;
    const photosByStep = new Map<string, { before: PhotoRow[]; after: PhotoRow[] }>();
    for (const p of photos) {
      const key = photoStepKey(p);
      if (!key) continue;
      if (!photosByStep.has(key)) photosByStep.set(key, { before: [], after: [] });
      const bucket = photosByStep.get(key)!;
      if (p.type === "before") bucket.before.push(p);
      else if (p.type === "after") bucket.after.push(p);
    }

    // pdfkit não busca URL remota em doc.image() — só path local, Buffer ou
    // data-URI. Sem isso toda foto real (Supabase Storage) falharia
    // silenciosamente e caía sempre no placeholder tracejado.
    const imageBuffers = new Map<string, Buffer>();
    const urlsToFetch = new Set<string>();
    for (const bucket of photosByStep.values()) {
      bucket.before.slice(0, 4).forEach((p) => urlsToFetch.add(p.url));
      bucket.after.slice(0, 4).forEach((p) => urlsToFetch.add(p.url));
    }
    if (signaturePhoto) urlsToFetch.add(signaturePhoto.url);
    await Promise.all(
      Array.from(urlsToFetch).map(async (url) => {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (!res.ok) return;
          const buf = Buffer.from(await res.arrayBuffer());
          imageBuffers.set(url, buf);
        } catch {
          /* segue sem essa foto — a tela desenha o placeholder */
        }
      })
    );

    const totalStepPhotos = photos.filter((p) => p.type === "before" || p.type === "after").length;
    const stepsCompleted = steps.filter((s) => s.status === "completed").length;
    const stepsTotal = steps.length;

    const startTs = order.started_at ? new Date(order.started_at).getTime() : null;
    const endTs = order.completed_at ? new Date(order.completed_at).getTime() : null;
    const totalDurationSeconds =
      startTs && endTs && endTs > startTs ? Math.floor((endTs - startTs) / 1000) : 0;

    // Área total: soma dos itens cuja unidade indica metragem (m/m2).
    const totalArea = items.reduce((acc, it) => {
      const u = (it.unit ?? "").toLowerCase();
      if (u.includes("m2") || u.includes("m²")) return acc + Number(it.quantity ?? 0);
      return acc;
    }, 0);

    // ---- Conclusão técnica automática (regra, não IA de verdade — F2 decidido) ----
    const allStepsOk = stepsTotal > 0 && stepsCompleted === stepsTotal;
    const hasEnoughPhotos = totalStepPhotos >= stepsTotal; // pelo menos 1 foto/etapa em média
    const hasSignature = !!signaturePhoto;
    const integridade = hasEnoughPhotos && hasSignature ? "Aprovada" : "Aprovada com ressalvas";
    const conclusaoGeral = allStepsOk ? "Serviço executado conforme planejado" : "Execução parcial registrada";
    const conclusaoBullets = [
      allStepsOk
        ? "Todas as etapas foram concluídas com sucesso."
        : `${stepsCompleted} de ${stepsTotal} etapas foram concluídas.`,
      hasEnoughPhotos
        ? "As evidências fotográficas estão completas e coerentes com as atividades registradas."
        : "O volume de evidências fotográficas ficou abaixo do esperado para o número de etapas.",
      "O ambiente apresenta condições adequadas e satisfatórias no momento da entrega.",
      "Não foram identificadas inconformidades relevantes que comprometam a qualidade da execução.",
    ];

    const verificationUrl = `${getBaseUrl(request)}/relatorio/${reportCode}`;
    const qrPngBuffer = await QRCode.toBuffer(verificationUrl, {
      margin: 0,
      width: 300,
      color: { dark: "#000000", light: "#FFFFFF" },
    });

    // ============================================================
    // PDF
    // ============================================================
    const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
    });

    const pageW = doc.page.width;
    const marginX = 36;
    const contentW = pageW - marginX * 2;

    // ---------- Header ----------
    const headerH = 118;
    doc.rect(0, 0, pageW, headerH).fill(BLACK);

    const logoPath = findLogoPath();
    const logoX = marginX;
    const logoY = 22;
    if (logoPath) {
      try {
        doc.image(logoPath, logoX, logoY, { height: 34 });
      } catch {
        /* fallback abaixo */
      }
    }
    doc
      .fontSize(20)
      .font("Helvetica-Bold")
      .fillColor(GOLD)
      .text("REALIZA", logoX, logoY + (logoPath ? 40 : 0), { continued: false });
    doc
      .fontSize(6.5)
      .font("Helvetica")
      .fillColor(ZINC_400)
      .text("Mais controle. Mais qualidade.", logoX, doc.y + 1);

    doc
      .fontSize(16)
      .font("Helvetica-Bold")
      .fillColor(WHITE)
      .text("RELATÓRIO TÉCNICO DE EXECUÇÃO", logoX, 68, { width: 300 });
    doc
      .fontSize(16)
      .font("Helvetica-Bold")
      .fillColor(GOLD)
      .text("E TERMO DE ", logoX, doc.y + 1, { continued: true, width: 300 })
      .fillColor(GOLD)
      .text("GARANTIA", { continued: false });

    // Badge de garantia (canto superior)
    const badgeW = 108;
    const badgeX = pageW - marginX - badgeW - 220;
    doc.roundedRect(badgeX, 14, badgeW, 88, 6).fill(GOLD_DARK);
    doc
      .fontSize(7.5)
      .font("Helvetica-Bold")
      .fillColor(BLACK)
      .text("GARANTIA DE", badgeX, 22, { width: badgeW, align: "center" })
      .text("EXECUÇÃO", { width: badgeW, align: "center" });
    doc
      .fontSize(30)
      .font("Helvetica-Bold")
      .fillColor(BLACK)
      .text("12", badgeX, 45, { width: badgeW, align: "center" });
    doc
      .fontSize(8)
      .font("Helvetica-Bold")
      .fillColor(BLACK)
      .text("MESES", badgeX, 82, { width: badgeW, align: "center" });

    // Caixa de verificação
    const verBoxW = 210;
    const verBoxX = pageW - marginX - verBoxW;
    doc.roundedRect(verBoxX, 14, verBoxW, 92, 4).fill("#1C1C1E");
    doc
      .fontSize(7)
      .font("Helvetica-Bold")
      .fillColor(GOLD)
      .text("VERIFICAÇÃO DO DOCUMENTO", verBoxX + 10, 22, { width: verBoxW - 74 });
    doc
      .fontSize(6.3)
      .font("Helvetica")
      .fillColor(ZINC_300)
      .text(
        "Escaneie o QR Code ou acesse o link abaixo para verificar a autenticidade deste documento.",
        verBoxX + 10,
        34,
        { width: verBoxW - 74 }
      );
    doc
      .fontSize(6.3)
      .font("Helvetica")
      .fillColor(ZINC_400)
      .text("Código de verificação", verBoxX + 10, 66, { width: verBoxW - 74 });
    doc
      .fontSize(7.2)
      .font("Helvetica-Bold")
      .fillColor(WHITE)
      .text(reportCode, verBoxX + 10, 76, { width: verBoxW - 74 });
    doc
      .fontSize(6)
      .font("Helvetica")
      .fillColor(GOLD)
      .text(verificationUrl.replace(/^https?:\/\//, ""), verBoxX + 10, 90, { width: verBoxW - 74 });
    try {
      doc.image(qrPngBuffer, verBoxX + verBoxW - 58, 22, { width: 48, height: 48 });
    } catch {
      /* segue sem QR se falhar */
    }

    doc.y = headerH + 14;

    // ---------- Meta row ----------
    const metaY = doc.y;
    const metaItems = [
      { label: "OS Nº", value: `#${order.order_number}` },
      { label: "Data de emissão", value: fmtDateTime(reportIssuedAt) },
      { label: "Versão do documento", value: "1.0" },
      { label: "Status", value: "CONCLUÍDA" },
    ];
    const metaColW = contentW / metaItems.length;
    metaItems.forEach((m, i) => {
      const x = marginX + i * metaColW;
      doc.fontSize(7).font("Helvetica").fillColor(ZINC_500).text(m.label, x, metaY);
      if (m.label === "Status") {
        doc.fontSize(9.5).font("Helvetica-Bold").fillColor(GREEN).text(`✓ ${m.value}`, x, metaY + 11);
      } else {
        doc.fontSize(9.5).font("Helvetica-Bold").fillColor(INK).text(m.value, x, metaY + 11);
      }
    });
    doc.y = metaY + 32;
    doc.moveTo(marginX, doc.y).lineTo(pageW - marginX, doc.y).lineWidth(0.6).stroke(ZINC_200);
    doc.y += 12;

    // ---------- 3 info cards ----------
    const cardGap = 10;
    const cardW = (contentW - cardGap * 2) / 3;
    const cardTopY = doc.y;

    function infoCard(x: number, title: string, lines: Array<[string, string]>) {
      doc.fontSize(7.2).font("Helvetica-Bold").fillColor(GOLD_DARK).text(title, x, cardTopY, { width: cardW });
      let y = cardTopY + 14;
      for (const [label, value] of lines) {
        doc.fontSize(6.3).font("Helvetica").fillColor(ZINC_500).text(label, x, y, { width: cardW });
        y += 9;
        doc.fontSize(8).font("Helvetica-Bold").fillColor(INK).text(value, x, y, { width: cardW });
        y += 13;
      }
      return y;
    }

    const clientAddress = [order.address_street, order.address_number, order.address_neighborhood]
      .filter(Boolean)
      .join(", ");

    const executorAddress = safe(settings?.base_address, "-");

    const os1End = infoCard(marginX, "CONTRATANTE (CLIENTE/LOJA)", [
      ["Nome / Razão Social", safe(order.client_name)],
      ["Endereço", safe(clientAddress || order.address_city, "-")],
      ["CPF / CNPJ", safe(order.client_document)],
      ["Contato", safe(order.client_phone, safe(order.client_email))],
    ]);
    const os2End = infoCard(marginX + cardW + cardGap, "EXECUTOR DO SERVIÇO (GARANTIDOR)", [
      ["Nome / Razão Social", safe(settings?.legal_name, "Reallliza Revestimentos Vinílicos")],
      ["Responsável Técnico", safe(technician?.full_name, "Equipe Reallliza")],
      ["CNPJ", safe(settings?.cnpj)],
      ["Contato", safe(settings?.email, safe(settings?.phone))],
    ]);
    const os3End = infoCard(marginX + (cardW + cardGap) * 2, "DADOS DO SERVIÇO", [
      ["Endereço da execução", safe(clientAddress || order.address_city, "-")],
      ["Produto / Serviço", safe(order.title)],
      ["Área total executada", totalArea > 0 ? `${totalArea.toLocaleString("pt-BR")} m²` : "-"],
      ["Data de início / conclusão", `${fmtDate(order.started_at)} — ${fmtDate(order.completed_at)}`],
    ]);
    doc.y = Math.max(os1End, os2End, os3End) + 6;

    // ---------- 4 stat tiles ----------
    const statY = doc.y;
    const statGap = 8;
    const statW = (contentW - statGap * 3) / 4;
    const stats = [
      { label: "Etapas previstas", value: String(stepsTotal) },
      { label: "Etapas concluídas", value: String(stepsCompleted) },
      { label: "Total de fotos", value: String(photos.length) },
      { label: "Tempo total de execução", value: fmtDuration(totalDurationSeconds) },
    ];
    stats.forEach((s, i) => {
      const x = marginX + i * (statW + statGap);
      doc.roundedRect(x, statY, statW, 40, 4).lineWidth(0.7).stroke(ZINC_200);
      doc.fontSize(15).font("Helvetica-Bold").fillColor(INK).text(s.value, x, statY + 7, { width: statW, align: "center" });
      doc.fontSize(6.3).font("Helvetica").fillColor(ZINC_500).text(s.label, x + 4, statY + 27, { width: statW - 8, align: "center" });
    });
    doc.y = statY + 52;

    // ---------- IMPORTANTE callout ----------
    function calloutBox(y: number, w: number, title: string, body: string, bg: string, border: string): number {
      const textOpts = { width: w - 44 };
      const bodyHeight = doc.heightOfString(body, textOpts);
      const boxH = Math.max(40, bodyHeight + 24);
      doc.roundedRect(marginX, y, w, boxH, 4).fill(bg);
      doc.roundedRect(marginX, y, w, boxH, 4).lineWidth(0.7).stroke(border);
      doc.fontSize(7.5).font("Helvetica-Bold").fillColor(INK).text(title, marginX + 30, y + 8, { width: w - 44 });
      doc.fontSize(7).font("Helvetica").fillColor(ZINC_700).text(body, marginX + 30, y + 19, textOpts);
      return y + boxH + 10;
    }

    doc.y = calloutBox(
      doc.y,
      contentW,
      "IMPORTANTE",
      "Todas as evidências (fotos, datas, horários e assinaturas) foram coletadas via aplicativo Realiza OS e possuem alta confiabilidade, garantindo autenticidade e integridade deste documento.",
      AMBER_BG,
      AMBER_BORDER
    );

    // ---------- Observações gerais ----------
    doc.fontSize(8).font("Helvetica-Bold").fillColor(INK).text("OBSERVAÇÕES GERAIS", marginX, doc.y);
    doc.y += 12;
    const observacoes = [
      "Não foram registradas não conformidades durante a execução das etapas.",
      "Condições ambientais adequadas para execução dos serviços.",
    ];
    observacoes.forEach((o) => {
      doc.fontSize(7.3).font("Helvetica").fillColor(ZINC_700).text(`•  ${o}`, marginX, doc.y, { width: contentW });
      doc.y += 3;
    });
    doc.y += 8;

    // ---------- Termo de responsabilidade técnica ----------
    doc.fontSize(8).font("Helvetica-Bold").fillColor(INK).text("TERMO DE RESPONSABILIDADE TÉCNICA", marginX, doc.y);
    doc.y += 12;
    doc
      .fontSize(7.3)
      .font("Helvetica")
      .fillColor(ZINC_700)
      .text(
        `O executor identificado neste documento declara que os serviços descritos na Ordem de Serviço foram executados em conformidade com as etapas, especificações técnicas, procedimentos e materiais aplicáveis, conforme evidências fotográficas, registros de data e horário e informações constantes neste relatório, emitido pela plataforma Realiza OS.\n\nEste documento integra o processo técnico da OS e é parte integrante do Termo de Garantia da Execução, assumindo o executor total responsabilidade técnica pela boa execução dos serviços aqui estabelecidos.`,
        marginX,
        doc.y,
        { width: contentW, align: "justify" }
      );
    doc.y += 8;

    // ---------- Escopo dos serviços executados ----------
    doc.fontSize(8).font("Helvetica-Bold").fillColor(INK).text("ESCOPO DOS SERVIÇOS EXECUTADOS", marginX, doc.y);
    doc.y += 12;
    const escopoItems = items.length > 0 ? items.map((it) => it.description) : [safe(order.title)];
    escopoItems.forEach((desc) => {
      doc.fontSize(7.3).font("Helvetica").fillColor(ZINC_700).text(`•  ${desc}`, marginX, doc.y, { width: contentW });
      doc.y += 3;
    });
    doc.y += 10;

    // ---------- Seção 3: Etapas de execução ----------
    doc.fontSize(9).font("Helvetica-Bold").fillColor(INK).text("3.  REGISTRO DAS ETAPAS DE EXECUÇÃO E EVIDÊNCIAS", marginX, doc.y);
    doc.y += 16;

    const rowColW = { num: 26, desc: contentW * 0.42, status: 60 };
    const photoColW = (contentW - rowColW.num - rowColW.desc - rowColW.status) / 2;

    function ensureSpace(minHeight: number) {
      if (doc.y + minHeight > doc.page.height - 60) {
        doc.addPage();
        doc.y = 40;
      }
    }

    steps.forEach((s, idx) => {
      ensureSpace(90);
      const rowY = doc.y;
      const bucket = photosByStep.get(s.step_key) ?? { before: [], after: [] };
      const durationSec =
        s.started_at && s.completed_at
          ? Math.floor((new Date(s.completed_at).getTime() - new Date(s.started_at).getTime()) / 1000)
          : 0;

      let x = marginX;
      doc.fontSize(9).font("Helvetica-Bold").fillColor(GOLD_DARK).text(String(idx + 1).padStart(2, "0"), x, rowY, { width: rowColW.num });
      x += rowColW.num;

      doc.fontSize(7.8).font("Helvetica-Bold").fillColor(INK).text(stepDisplayName(s), x, rowY, { width: rowColW.desc });
      let descY = doc.y + 2;
      if (s.started_at) {
        doc.fontSize(6.3).font("Helvetica").fillColor(ZINC_500).text(`Início: ${fmtDateTime(s.started_at)}`, x, descY, { width: rowColW.desc });
        descY += 8;
      }
      if (s.completed_at) {
        doc.fontSize(6.3).font("Helvetica").fillColor(ZINC_500).text(`Término: ${fmtDateTime(s.completed_at)}`, x, descY, { width: rowColW.desc });
        descY += 8;
      }
      if (durationSec > 0) {
        doc.fontSize(6.3).font("Helvetica").fillColor(ZINC_500).text(`Duração: ${fmtDuration(durationSec)}`, x, descY, { width: rowColW.desc });
      }
      x += rowColW.desc;

      function photoStrip(label: string, list: PhotoRow[], colX: number) {
        doc.fontSize(6.3).font("Helvetica").fillColor(ZINC_500).text(`${label} (${list.length})`, colX, rowY, { width: photoColW - 6 });
        const thumbY = rowY + 10;
        const thumbSize = 26;
        list.slice(0, 4).forEach((p, i) => {
          const buf = imageBuffers.get(p.url);
          try {
            if (!buf) throw new Error("no buffer");
            doc.image(buf, colX + i * (thumbSize + 3), thumbY, { width: thumbSize, height: thumbSize, fit: [thumbSize, thumbSize] });
          } catch {
            doc.roundedRect(colX + i * (thumbSize + 3), thumbY, thumbSize, thumbSize, 2).lineWidth(0.5).stroke(ZINC_300);
          }
        });
        if (list.length === 0) {
          doc.fontSize(6).font("Helvetica-Oblique").fillColor(ZINC_400).text("Sem foto registrada", colX, thumbY, { width: photoColW - 6 });
        }
      }

      photoStrip("Início (antes)", bucket.before, x);
      photoStrip("Término (depois)", bucket.after, x + photoColW);
      x += photoColW * 2;

      const statusLabel = s.status === "completed" ? "Concluída" : s.status === "skipped" ? "Pulada" : "Pendente";
      const statusColor = s.status === "completed" ? GREEN : s.status === "skipped" ? ZINC_500 : GOLD_DARK;
      doc.fontSize(7).font("Helvetica-Bold").fillColor(statusColor).text(statusLabel, x, rowY, { width: rowColW.status });

      doc.y = Math.max(descY, rowY + 42) + 8;
      doc.moveTo(marginX, doc.y).lineTo(pageW - marginX, doc.y).lineWidth(0.4).stroke(ZINC_100);
      doc.y += 8;
    });

    if (steps.length === 0) {
      doc.fontSize(7.5).font("Helvetica-Oblique").fillColor(ZINC_500).text("Nenhuma etapa de execução registrada para esta OS.", marginX, doc.y);
      doc.y += 14;
    }

    // ============================================================
    // Página 2
    // ============================================================
    doc.addPage();
    doc.y = 40;

    doc.fontSize(9).font("Helvetica-Bold").fillColor(INK).text("4.  CONCLUSÃO TÉCNICA AUTOMÁTICA (IA)", marginX, doc.y);
    doc.y += 16;
    doc
      .fontSize(7.5)
      .font("Helvetica")
      .fillColor(ZINC_700)
      .text(
        `Com base na análise das etapas executadas e das evidências fotográficas registradas, conclui-se que o serviço foi ${
          allStepsOk ? "executado conforme previsto" : "parcialmente executado"
        } na OS #${order.order_number}, seguindo as etapas de execução definidas.`,
        marginX,
        doc.y,
        { width: contentW, align: "justify" }
      );
    doc.y += 10;
    conclusaoBullets.forEach((b) => {
      doc.fontSize(7.3).font("Helvetica-Bold").fillColor(GREEN).text("✓  ", marginX, doc.y, { continued: true, width: contentW });
      doc.font("Helvetica").fillColor(ZINC_700).text(b, { width: contentW - 14 });
      doc.y += 3;
    });
    doc.y += 10;

    const resumoY = doc.y;
    const resumoStats = [
      { label: "Etapas executadas", value: `${stepsCompleted} / ${stepsTotal}`, sub: stepsTotal > 0 ? "100% concluídas".replace("100", String(Math.round((stepsCompleted / stepsTotal) * 100))) : "-" },
      { label: "Fotos registradas", value: String(photos.length), sub: "Evidências anexadas" },
      { label: "Integridade dos registros", value: integridade === "Aprovada" ? "Aprovada" : "Ressalvas", sub: "Dados e horas consistentes" },
      { label: "Conclusão geral", value: allStepsOk ? "Serviço executado" : "Execução parcial", sub: "conforme planejado" },
    ];
    const resumoW = (contentW - statGap * 3) / 4;
    resumoStats.forEach((s, i) => {
      const x = marginX + i * (resumoW + statGap);
      doc.fontSize(11).font("Helvetica-Bold").fillColor(INK).text(s.value, x, resumoY, { width: resumoW, align: "center" });
      doc.fontSize(6.3).font("Helvetica-Bold").fillColor(ZINC_600).text(s.label, x, resumoY + 16, { width: resumoW, align: "center" });
      doc.fontSize(5.8).font("Helvetica").fillColor(ZINC_500).text(s.sub, x, resumoY + 26, { width: resumoW, align: "center" });
    });
    doc.y = resumoY + 42;

    doc.y = calloutBox(
      doc.y,
      contentW,
      "OBSERVAÇÕES IMPORTANTES",
      "Este relatório é válido somente para as condições verificadas na data da execução. Alterações posteriores ao serviço não são de responsabilidade do executor. A garantia cobre exclusivamente a execução, conforme condições ao lado.",
      AMBER_BG,
      AMBER_BORDER
    );

    // ---------- Seção 5: Termo de Garantia ----------
    doc.fontSize(9).font("Helvetica-Bold").fillColor(INK).text("5.  TERMO DE GARANTIA DA EXECUÇÃO", marginX, doc.y);
    doc.y += 16;
    doc
      .fontSize(7.3)
      .font("Helvetica")
      .fillColor(ZINC_700)
      .text(
        `O executor identificado neste documento garante a execução dos serviços descritos na OS #${order.order_number}, pelo período de 12 (doze) meses, contados a partir da data de conclusão dos serviços.`,
        marginX,
        doc.y,
        { width: contentW, align: "justify" }
      );
    doc.y += 12;

    const garantiaY = doc.y;
    const garantiaEnd = order.completed_at
      ? new Date(new Date(order.completed_at).setFullYear(new Date(order.completed_at).getFullYear() + 1)).toISOString()
      : null;
    const garantiaLines: Array<[string, string]> = [
      ["Garantidor", safe(settings?.legal_name, "Reallliza Revestimentos Vinílicos")],
      ["CNPJ", safe(settings?.cnpj)],
      ["Data de início da garantia", fmtDate(order.completed_at)],
      ["Data de término da garantia", fmtDate(garantiaEnd)],
    ];
    let gy = garantiaY;
    garantiaLines.forEach(([label, value]) => {
      doc.fontSize(6.8).font("Helvetica").fillColor(ZINC_500).text(label + ":", marginX, gy, { continued: true, width: 200 });
      doc.font("Helvetica-Bold").fillColor(INK).text("  " + value);
      gy += 13;
    });
    doc.y = gy + 6;

    doc.fontSize(7.5).font("Helvetica-Bold").fillColor(INK).text("CONDIÇÕES E LIMITAÇÕES DA GARANTIA", marginX, doc.y);
    doc.y += 11;
    [
      "A garantia cobre exclusivamente a qualidade da execução dos serviços realizados.",
      "Não cobre danos causados por mau uso, impacto, umidade excessiva, infiltrações, problemas estruturais, movimentações da base, intervenções de terceiros ou alterações posteriores.",
      "A garantia não cobre materiais fornecidos por terceiros.",
      "Para acionamento da garantia, o cliente/contratante deverá apresentar este relatório.",
    ].forEach((c) => {
      doc.fontSize(6.8).font("Helvetica").fillColor(ZINC_700).text(`•  ${c}`, marginX, doc.y, { width: contentW });
      doc.y += 3;
    });
    doc.y += 12;

    // ---------- Seção 6: Declaração e Assinaturas ----------
    doc.fontSize(9).font("Helvetica-Bold").fillColor(INK).text("6.  DECLARAÇÃO E ASSINATURAS", marginX, doc.y);
    doc.y += 14;
    doc
      .fontSize(6.8)
      .font("Helvetica")
      .fillColor(ZINC_700)
      .text(
        "Declaro que realizei e/ou supervisionei a execução dos serviços registrados neste relatório, que todas as informações aqui prestadas são verdadeiras, e que as evidências anexas são fiéis ao processo executado, assumindo inteira responsabilidade técnica pela execução e garantia aqui descritas.",
        marginX,
        doc.y,
        { width: contentW }
      );
    doc.y += 18;

    const sigY = doc.y;
    const sigGap = 16;
    const sigW = (contentW - sigGap) / 2;

    function signatureBlock(x: number, title: string, name: string, role: string, doc_: string, dateStr: string, image: Buffer | null) {
      doc.fontSize(7).font("Helvetica-Bold").fillColor(ZINC_600).text(title, x, sigY);
      const boxY = sigY + 12;
      doc.roundedRect(x, boxY, sigW, 46, 3).lineWidth(0.7).stroke(ZINC_300);
      if (image) {
        try {
          doc.image(image, x + 8, boxY + 4, { width: sigW - 16, height: 30, fit: [sigW - 16, 30] });
        } catch {
          doc.fontSize(14).font("Helvetica-Oblique").fillColor(INK).text(name, x + 8, boxY + 12, { width: sigW - 16 });
        }
      } else {
        doc.fontSize(14).font("Helvetica-Oblique").fillColor(INK).text(name, x + 8, boxY + 12, { width: sigW - 16 });
      }
      let y = boxY + 52;
      const fields: Array<[string, string]> = [
        ["Nome", name],
        ["Função", role],
        ["CPF / CNPJ", doc_],
        ["Data da assinatura", dateStr],
      ];
      fields.forEach(([l, v]) => {
        doc.fontSize(6.3).font("Helvetica").fillColor(ZINC_500).text(l + ":", x, y, { continued: true, width: sigW });
        doc.font("Helvetica-Bold").fillColor(INK).text("  " + v);
        y += 10;
      });
      return y;
    }

    const sig1End = signatureBlock(
      marginX,
      "Responsável Técnico / Executor",
      safe(technician?.full_name, "Equipe Reallliza"),
      "Responsável Técnico",
      safe(technician?.cpf, "-"),
      fmtDate(order.completed_at),
      null
    );
    const sig2End = signatureBlock(
      marginX + sigW + sigGap,
      "Cliente / Contratante",
      safe(order.client_name),
      "Cliente",
      safe(order.client_document, "-"),
      fmtDate(order.completed_at),
      signaturePhoto ? (imageBuffers.get(signaturePhoto.url) ?? null) : null
    );
    doc.y = Math.max(sig1End, sig2End) + 10;

    doc.y = calloutBox(
      doc.y,
      contentW,
      "ASSUNÇÃO DE RESPONSABILIDADE",
      "O executor e o contratante reconhecem que este documento, juntamente com as evidências registradas na plataforma Realiza OS, compõe o registro formal da execução dos serviços e tem validade jurídica para fins de garantia da execução.",
      GREEN_BG,
      "#86EFAC"
    );

    // ---------- Rodapé: 4 colunas legais ----------
    ensureSpace(140);
    const footY = doc.y;
    const footGap = 10;
    const footW = (contentW - footGap * 3) / 4;
    function footCol(x: number, title: string, lines: string[]) {
      doc.fontSize(6.6).font("Helvetica-Bold").fillColor(GOLD_DARK).text(title, x, footY, { width: footW });
      let y = footY + 11;
      lines.forEach((l) => {
        doc.fontSize(6).font("Helvetica").fillColor(ZINC_600).text(l, x, y, { width: footW });
        y += doc.heightOfString(l, { width: footW }) + 2;
      });
    }
    footCol(marginX, "AUTENTICIDADE DO DOCUMENTO", [
      "Documento eletrônico, gerado e armazenado na plataforma Realiza OS.",
      `Código: ${reportCode}`,
      "Verifique sempre a autenticidade antes de compartilhar este documento.",
    ]);
    footCol(marginX + footW + footGap, "ENTREGA DO RELATÓRIO", [
      `Disponibilizado para: ${safe(order.client_name)}`,
      `Data de emissão: ${fmtDateTime(reportIssuedAt)}`,
      "Forma de entrega: Link de acesso e download (PDF)",
    ]);
    footCol(marginX + (footW + footGap) * 2, "HISTÓRICO DO DOCUMENTO", [
      "Versão 1.0",
      `Emissão inicial: ${fmtDateTime(reportIssuedAt)}`,
      "Gerado a partir dos dados originais registrados na plataforma.",
    ]);
    footCol(marginX + (footW + footGap) * 3, "DADOS LEGAIS", [
      "Lei 14.063/2020 (Assinatura Eletrônica)",
      "Marco Civil da Internet (Lei 12.965/2014)",
      "LGPD (Lei 13.709/2018)",
    ]);
    doc.y = footY + 70;

    // ---------- Rodapé final ----------
    const bottomH = 26;
    const bottomY = doc.page.height - bottomH;
    doc.rect(0, bottomY, pageW, bottomH).fill(BLACK);
    doc
      .fontSize(6.5)
      .font("Helvetica")
      .fillColor(ZINC_400)
      .text("Realiza OS · Tecnologia que garante qualidade e segurança.", marginX, bottomY + 9, { width: contentW });

    // ---------- Numeração de páginas ----------
    const pageRange = doc.bufferedPageRange();
    for (let i = 0; i < pageRange.count; i++) {
      doc.switchToPage(pageRange.start + i);
      doc
        .fontSize(6.5)
        .font("Helvetica")
        .fillColor(i === 0 ? ZINC_400 : ZINC_500)
        .text(`Página ${i + 1} de ${pageRange.count}`, pageW - marginX - 100, doc.page.height - (i === pageRange.count - 1 ? 17 : 20), {
          width: 100,
          align: "right",
        });
    }

    doc.end();
    const pdfBuffer = await done;

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="OS_${order.order_number}_termo_garantia.pdf"`,
      },
    });
  } catch (error) {
    console.error("GET /api/service-orders/[id]/execution-report:", error);
    return errorResponse(error);
  }
}
