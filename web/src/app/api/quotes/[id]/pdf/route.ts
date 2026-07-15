export const runtime = "nodejs";

import { NextRequest } from "next/server";
import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/quotes/[id]/pdf
 *
 * Layout Jessica 10/07 — modelo do arquivo
 * "modelo de orcamento para loja atualizado 10.07.2026.pdf". Identidade
 * Reallliza (amarelo #EAB308 + preto/zinc). Se logo local nao existir,
 * usa fallback texto "REALLLIZA".
 *
 * Secoes: Header, Dados Contratada, Dados Contratante, Dados do Tomador,
 * Descricao dos Servicos (tabela), Resumo da Contratacao (5 caixas),
 * Info Execucao + Escopo + Obs Importantes (3 colunas), Condicoes
 * Comerciais (3 colunas), Observacoes Gerais, Rodape.
 *
 * Permissoes: admin/gestor/diretor/supervisor/operador veem tudo;
 * partner ve so os proprios (partners.user_id = auth.uid()).
 */

const YELLOW = "#EAB308";
const YELLOW_SOFT = "#F5D020";
const BLACK = "#111111";
const ZINC_900 = "#18181B";
const ZINC_700 = "#374151";
const ZINC_500 = "#6B7280";
const ZINC_300 = "#D1D5DB";
const ZINC_100 = "#F3F4F6";
const GREEN = "#10B981";

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  awaiting_payment: "Aguardando pagamento",
  paid: "Pago",
  converted: "Em andamento",
  cancelled: "Cancelado",
};

const fmtBRL = (v: number | string | null | undefined): string => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "R$ 0,00";
  return `R$ ${n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const fmtDate = (d: string | null | undefined): string =>
  d ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR") : "-";

const safe = (v: string | null | undefined, fallback = "-"): string =>
  v && String(v).trim() ? String(v).trim() : fallback;

function findLogoPath(): string | null {
  const candidates = [
    "public/logo-reallliza.png",
    "public/logo-reallliza.jpg",
    "public/logo.png",
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const admin = getAdminClient();
    const { id } = await params;

    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    const role = (profile?.role as string | undefined) ?? "";

    const { data: quote, error: qErr } = await admin
      .from("quotes")
      .select("*, items:quote_items(*)")
      .eq("id", id)
      .maybeSingle();

    if (qErr || !quote) throw new AuthError(404, "Orçamento não encontrado");

    // Permissoes
    if (role === "partner") {
      const { data: myPartner } = await admin
        .from("partners")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!myPartner || myPartner.id !== quote.partner_id) {
        throw new AuthError(403, "Sem permissão para este orçamento");
      }
    } else if (
      !["admin", "gestor", "diretor", "supervisor", "operador"].includes(role)
    ) {
      throw new AuthError(403, "Sem permissão");
    }

    // Dados institucionais Reallliza (Contratada)
    const { data: settings } = await admin
      .from("company_settings")
      .select(
        "legal_name, cnpj, base_address, base_state, phone, email"
      )
      .limit(1)
      .maybeSingle();

    // Loja Contratante
    type PartnerRow = {
      company_name?: string | null;
      cnpj?: string | null;
      contact_email?: string | null;
      contact_phone?: string | null;
      address?: {
        street?: string;
        city?: string;
        state?: string;
        zip?: string;
      } | null;
    };
    let partner: PartnerRow | null = null;
    if (quote.partner_id) {
      const { data: p } = await admin
        .from("partners")
        .select("company_name, cnpj, contact_email, contact_phone, address")
        .eq("id", quote.partner_id)
        .maybeSingle();
      partner = (p as PartnerRow | null) ?? null;
    }
    const partnerAddress = partner?.address
      ? [
          partner.address.street,
          partner.address.city,
          partner.address.state,
          partner.address.zip,
        ]
          .filter(Boolean)
          .join(", ")
      : "";

    // ============================================================
    // Monta PDF
    // ============================================================
    // margins.bottom=0 previne que o rodape (desenhado em Y>792) gere
    // pagina automatica extra. Layout controla o Y absoluto de cada bloco.
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 30, left: 30, right: 30, bottom: 0 },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
    });

    const pageW = doc.page.width - 60;
    const pageH = doc.page.height;
    const leftX = 30;
    const rightX = leftX + pageW;
    const logoPath = findLogoPath();

    // ============ HEADER ============
    // Coluna esquerda: logo (ou texto)
    if (logoPath) {
      try {
        doc.image(logoPath, leftX, 30, { width: 160 });
      } catch {
        renderLogoText(doc, leftX, 40);
      }
    } else {
      renderLogoText(doc, leftX, 40);
    }

    // Coluna direita: ORCAMENTO + info
    const rightBlockX = leftX + pageW - 180;
    doc
      .fontSize(22)
      .font("Helvetica-Bold")
      .fillColor(BLACK)
      .text("ORÇAMENTO", rightBlockX, 32, { width: 180, align: "right" });

    const infoY = 68;
    const drawInfoRow = (label: string, value: string, yOffset: number) => {
      doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor(ZINC_500)
        .text(label, rightBlockX, infoY + yOffset, {
          width: 90,
          align: "right",
        });
      doc
        .fontSize(9)
        .font("Helvetica-Bold")
        .fillColor(BLACK)
        .text(value, rightBlockX + 90, infoY + yOffset, {
          width: 90,
          align: "right",
        });
    };
    drawInfoRow(
      "Orçamento nº:",
      String(quote.quote_number).padStart(3, "0"),
      0
    );
    drawInfoRow("Data:", fmtDate(new Date().toISOString()), 14);
    drawInfoRow(
      "Situação:",
      STATUS_LABELS[quote.status as string] ?? String(quote.status),
      28
    );

    // Linha dourada
    doc
      .moveTo(leftX, 118)
      .lineTo(rightX, 118)
      .strokeColor(YELLOW)
      .lineWidth(2)
      .stroke();

    doc.y = 130;

    // ============ DADOS CONTRATADA + CONTRATANTE (2 colunas) ============
    const colW = (pageW - 10) / 2;
    const drawInfoBox = (
      title: string,
      x: number,
      y: number,
      w: number,
      lines: Array<{ label: string; value: string }>
    ) => {
      const boxHeight = 20 + lines.length * 14;
      // Titulo em barra dourada
      doc.rect(x, y, w, 18).fill(YELLOW);
      doc
        .fontSize(9)
        .font("Helvetica-Bold")
        .fillColor(BLACK)
        .text(title.toUpperCase(), x + 8, y + 5, { width: w - 16 });
      // Caixa
      doc
        .rect(x, y + 18, w, boxHeight - 18)
        .lineWidth(0.5)
        .strokeColor(ZINC_300)
        .stroke();

      let ly = y + 24;
      for (const l of lines) {
        doc
          .fontSize(8)
          .font("Helvetica")
          .fillColor(ZINC_500)
          .text(l.label, x + 8, ly, { width: 60, continued: false });
        doc
          .fontSize(9)
          .font("Helvetica-Bold")
          .fillColor(ZINC_900)
          .text(l.value, x + 70, ly, { width: w - 78 });
        ly += 14;
      }
      return y + boxHeight;
    };

    const contratadaLines = [
      { label: "Empresa:", value: safe(settings?.legal_name, "Reallliza Revestimento Vinílico") },
      { label: "CNPJ:", value: safe(settings?.cnpj) },
      { label: "Endereço:", value: safe(settings?.base_address) },
      { label: "Telefone:", value: safe(settings?.phone) },
      { label: "E-mail:", value: safe(settings?.email, "comercial@reallliza.com.br") },
    ];
    const contratanteLines = [
      { label: "Empresa:", value: safe(partner?.company_name) },
      { label: "CNPJ:", value: safe(partner?.cnpj) },
      { label: "Endereço:", value: partnerAddress || "-" },
      { label: "Telefone:", value: safe(partner?.contact_phone) },
      { label: "E-mail:", value: safe(partner?.contact_email) },
    ];

    const y1 = drawInfoBox(
      "Dados da Contratada",
      leftX,
      doc.y,
      colW,
      contratadaLines
    );
    const y2 = drawInfoBox(
      "Dados da Contratante",
      leftX + colW + 10,
      doc.y,
      colW,
      contratanteLines
    );
    doc.y = Math.max(y1, y2) + 12;

    // ============ DADOS DO TOMADOR (cliente final) ============
    const tomadorEndereco = [
      quote.address_street,
      quote.address_number,
      quote.address_neighborhood,
    ]
      .filter(Boolean)
      .join(", ");
    const tomadorLines = [
      { label: "Nome:", value: safe(quote.client_name as string) },
      { label: "CPF/CNPJ:", value: safe(quote.client_document as string) },
      { label: "Endereço:", value: tomadorEndereco || "-" },
      {
        label: "Cidade/UF:",
        value:
          quote.address_city
            ? `${quote.address_city} / ${quote.address_state ?? "-"}`
            : "-",
      },
      { label: "CEP:", value: safe(quote.address_zip as string) },
      { label: "Telefone:", value: safe(quote.client_phone as string) },
    ];
    doc.y = drawInfoBox(
      "Dados do Tomador dos Serviços (Cliente Final)",
      leftX,
      doc.y,
      pageW,
      tomadorLines
    );
    doc.y += 12;

    // ============ DESCRICAO DOS SERVICOS (tabela) ============
    const tableY = doc.y;
    // Titulo em barra dourada
    doc.rect(leftX, tableY, pageW, 20).fill(YELLOW);
    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .fillColor(BLACK)
      .text("DESCRIÇÃO DOS SERVIÇOS", leftX + 8, tableY + 6, {
        width: pageW - 16,
        align: "center",
      });
    doc.y = tableY + 20;

    // Header da tabela
    const cols = [
      { label: "ITEM", w: 40 },
      { label: "DESCRIÇÃO DO SERVIÇO", w: pageW - 40 - 55 - 55 - 75 - 75 },
      { label: "QUANT.", w: 55, align: "center" as const },
      { label: "UNIDADE", w: 55, align: "center" as const },
      { label: "VALOR UNITÁRIO", w: 75, align: "right" as const },
      { label: "VALOR TOTAL", w: 75, align: "right" as const },
    ];
    const rowY = doc.y;
    doc.rect(leftX, rowY, pageW, 18).fill(ZINC_100);
    let cx = leftX;
    for (const c of cols) {
      doc
        .fontSize(8)
        .font("Helvetica-Bold")
        .fillColor(ZINC_700)
        .text(c.label, cx + 4, rowY + 5, {
          width: c.w - 8,
          align: (c.align as "left" | "center" | "right") ?? "left",
        });
      cx += c.w;
    }
    doc.y = rowY + 18;

    // Linhas da tabela
    const items = (quote.items as Array<{
      quantity: number;
      unit: string | null;
      unit_price: number;
      service_name: string;
    }> | null) ?? [];

    let itemsTotal = 0;
    items.forEach((it, idx) => {
      if (doc.y > pageH - 80) doc.addPage();
      const y = doc.y;
      const total = Number(it.quantity) * Number(it.unit_price);
      itemsTotal += total;
      // fundo alternado
      if (idx % 2 === 1) {
        doc.rect(leftX, y, pageW, 18).fill(ZINC_100);
      }
      let x = leftX;
      const values = [
        { text: String(idx + 1).padStart(2, "0"), align: "left" as const },
        { text: safe(it.service_name), align: "left" as const },
        {
          text: Number(it.quantity).toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }),
          align: "center" as const,
        },
        { text: safe(it.unit) || "un", align: "center" as const },
        { text: fmtBRL(it.unit_price), align: "right" as const },
        { text: fmtBRL(total), align: "right" as const },
      ];
      values.forEach((v, ci) => {
        doc
          .fontSize(9)
          .font("Helvetica")
          .fillColor(ZINC_900)
          .text(v.text, x + 4, y + 5, {
            width: cols[ci].w - 8,
            align: v.align,
          });
        x += cols[ci].w;
      });
      doc.y = y + 18;
    });

    // Linha VALOR TOTAL DOS SERVICOS
    doc.rect(leftX, doc.y, pageW, 22).fill(YELLOW);
    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .fillColor(BLACK)
      .text("VALOR TOTAL DOS SERVIÇOS", leftX + 8, doc.y + 6, {
        width: pageW - 100,
      });
    doc
      .fontSize(11)
      .font("Helvetica-Bold")
      .fillColor(BLACK)
      .text(
        fmtBRL(quote.subtotal_services ?? itemsTotal),
        rightX - 100 - 8,
        doc.y - 15,
        { width: 100, align: "right" }
      );
    doc.y += 22 + 12;

    // ============ RESUMO DA CONTRATACAO (5 caixas) ============
    // 5 caixas + label ocupam ~90px — quebra so se falta menos que isso
    if (doc.y > pageH - 130) doc.addPage();
    const resumoY = doc.y;
    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .fillColor(BLACK)
      .text("4. RESUMO DA CONTRATAÇÃO", leftX, resumoY);
    doc.y += 16;

    const boxes = [
      {
        label: "TIPO DE SERVIÇO",
        value: safe(quote.service_type as string),
      },
      {
        label: "ÁREA TOTAL",
        value:
          quote.total_area_m2 != null && Number(quote.total_area_m2) > 0
            ? `${Number(quote.total_area_m2).toLocaleString("pt-BR", {
                maximumFractionDigits: 2,
              })} m²`
            : "-",
      },
      { label: "AMBIENTES", value: safe(quote.rooms as string) },
      {
        label: "CIDADE",
        value: quote.address_city
          ? `${quote.address_city} / ${quote.address_state ?? "-"}`
          : "-",
      },
      {
        label: "RESPONSÁVEL TÉCNICO",
        value: safe(
          quote.technical_responsible as string,
          "Equipe Reallliza"
        ),
      },
    ];
    const bY = doc.y;
    const bW = pageW / 5;
    boxes.forEach((b, i) => {
      const x = leftX + i * bW;
      doc
        .rect(x, bY, bW, 55)
        .lineWidth(0.5)
        .strokeColor(ZINC_300)
        .stroke();
      doc
        .fontSize(7)
        .font("Helvetica-Bold")
        .fillColor(ZINC_500)
        .text(b.label, x + 6, bY + 8, {
          width: bW - 12,
          align: "center",
        });
      doc
        .fontSize(9)
        .font("Helvetica-Bold")
        .fillColor(BLACK)
        .text(b.value, x + 6, bY + 24, {
          width: bW - 12,
          align: "center",
        });
    });
    doc.y = bY + 55 + 12;

    // ============ INFO EXECUCAO + ESCOPO + OBS IMPORTANTES (3 colunas) ============
    // Bloco ~180px (6 items * 24 + header)
    if (doc.y > pageH - 200) doc.addPage();
    const c3Y = doc.y;
    const c3W = (pageW - 20) / 3;

    // Coluna 1: Info execucao
    drawSectionHeader(
      doc,
      "6. INFORMAÇÕES DA EXECUÇÃO",
      leftX,
      c3Y,
      c3W
    );
    let cy = c3Y + 22;
    const infoItems = [
      { label: "Data prevista da execução:", value: fmtDate((quote.execution_start_date ?? quote.service_date) as string | null) },
      { label: "Horário previsto:", value: quote.service_time ? String(quote.service_time).slice(0, 5) : "-" },
      { label: "Tempo estimado:", value: quote.total_days ? `${quote.total_days} ${Number(quote.total_days) === 1 ? "dia" : "dias"}` : "-" },
      { label: "Quantidade de técnicos:", value: quote.technicians_count ? `${quote.technicians_count} profissionais` : "-" },
      { label: "Responsável pela equipe:", value: safe(quote.technical_responsible as string, "Equipe Reallliza") },
      { label: "Material a ser instalado:", value: safe(quote.material_description as string) },
    ];
    for (const it of infoItems) {
      doc
        .fontSize(7)
        .font("Helvetica-Bold")
        .fillColor(ZINC_500)
        .text(it.label, leftX + 4, cy, { width: c3W - 8 });
      doc
        .fontSize(8)
        .font("Helvetica")
        .fillColor(ZINC_900)
        .text(it.value, leftX + 4, cy + 8, { width: c3W - 8 });
      cy += 24;
    }
    const col1End = cy;

    // Coluna 2: Escopo
    const c2X = leftX + c3W + 10;
    drawSectionHeader(doc, "7. ESCOPO DOS SERVIÇOS (INCLUSO)", c2X, c3Y, c3W);
    cy = c3Y + 22;
    const scopeArr = Array.isArray(quote.scope_items)
      ? (quote.scope_items as string[])
      : [];
    if (scopeArr.length === 0) {
      doc
        .fontSize(8)
        .font("Helvetica-Oblique")
        .fillColor(ZINC_500)
        .text("Nenhum item de escopo cadastrado.", c2X + 4, cy, { width: c3W - 8 });
    } else {
      for (const item of scopeArr) {
        doc
          .fontSize(9)
          .font("Helvetica-Bold")
          .fillColor(GREEN)
          .text("✓", c2X + 4, cy, { continued: true })
          .font("Helvetica")
          .fillColor(ZINC_900)
          .text("  " + item, { width: c3W - 20 });
        cy += 15;
      }
    }
    const col2End = cy;

    // Coluna 3: Obs importantes
    const c3X = leftX + 2 * (c3W + 10);
    drawSectionHeader(doc, "8. OBSERVAÇÕES IMPORTANTES", c3X, c3Y, c3W);
    cy = c3Y + 22;
    const importantArr = quote.important_notes
      ? String(quote.important_notes).split("\n").filter((l) => l.trim())
      : [];
    if (importantArr.length === 0) {
      doc
        .fontSize(8)
        .font("Helvetica-Oblique")
        .fillColor(ZINC_500)
        .text("-", c3X + 4, cy, { width: c3W - 8 });
    } else {
      for (const line of importantArr) {
        doc
          .fontSize(8)
          .font("Helvetica")
          .fillColor(ZINC_900)
          .text("• " + line, c3X + 4, cy, { width: c3W - 8 });
        cy += 14;
      }
    }
    const col3End = cy;

    doc.y = Math.max(col1End, col2End, col3End) + 12;

    // ============ CONDICOES COMERCIAIS ============
    // 3 caixas 70px + label 16px + rodape 50px reservado
    if (doc.y > pageH - 130) doc.addPage();
    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .fillColor(BLACK)
      .text("9. CONDIÇÕES COMERCIAIS", leftX, doc.y);
    doc.y += 16;

    const ccY = doc.y;
    const ccW = (pageW - 20) / 3;
    const warrantyMonths = Number(quote.warranty_months ?? 12);
    const ccBoxes = [
      {
        title: "GARANTIA",
        body: `${warrantyMonths} meses contra defeitos de instalação, conforme termo de garantia da Reallliza Revestimento Vinílico.`,
      },
      {
        title: "INÍCIO DO SERVIÇO",
        body: `O serviço será iniciado a partir da data de ${fmtDate((quote.execution_start_date ?? quote.service_date) as string | null)}, mediante confirmação e liberação do ambiente.`,
      },
      {
        title: "PRAZO DE EXECUÇÃO",
        body: `O prazo estimado para execução dos serviços é de ${quote.total_days ?? "-"} ${Number(quote.total_days ?? 0) === 1 ? "dia" : "dias"}.`,
      },
    ];
    ccBoxes.forEach((b, i) => {
      const x = leftX + i * (ccW + 10);
      doc
        .rect(x, ccY, ccW, 70)
        .lineWidth(0.5)
        .strokeColor(ZINC_300)
        .stroke();
      doc
        .fontSize(9)
        .font("Helvetica-Bold")
        .fillColor(YELLOW)
        .text(b.title, x + 8, ccY + 8, { width: ccW - 16 });
      doc
        .fontSize(8)
        .font("Helvetica")
        .fillColor(ZINC_900)
        .text(b.body, x + 8, ccY + 24, { width: ccW - 16 });
    });
    doc.y = ccY + 70 + 12;

    // ============ OBSERVACOES GERAIS ============
    if (quote.general_notes) {
      // 3 linhas de texto + label + rodape 50px reservado
      if (doc.y > pageH - 80) doc.addPage();
      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .fillColor(BLACK)
        .text("10. OBSERVAÇÕES GERAIS", leftX, doc.y);
      doc.y += 14;
      doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor(ZINC_700)
        .text(String(quote.general_notes), leftX, doc.y, {
          width: pageW,
          align: "justify",
        });
      doc.y += 6;
    }

    // ============ RODAPE PRETO ============
    // Textos com lineBreak:false + width limitado pra nao gerar pagina extra
    const footerHeight = 34;
    const footerY = pageH - footerHeight;
    doc.rect(0, footerY, doc.page.width, footerHeight).fill(BLACK);
    doc
      .fontSize(8)
      .font("Helvetica-Bold")
      .fillColor("#FFFFFF")
      .text(
        "QUALIDADE QUE SE VÊ. COMPROMISSO QUE SE SENTE.",
        leftX,
        footerY + 12,
        { width: pageW / 2, lineBreak: false }
      );
    doc
      .fontSize(8)
      .font("Helvetica-Oblique")
      .fillColor(YELLOW_SOFT)
      .text("Excelência em cada detalhe.", leftX + pageW / 2, footerY + 12, {
        width: pageW / 2,
        align: "right",
        lineBreak: false,
      });

    doc.end();
    const pdfBuffer = await done;

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="orcamento_${quote.quote_number}.pdf"`,
      },
    });
  } catch (error) {
    console.error("GET /api/quotes/[id]/pdf:", error);
    return errorResponse(error);
  }
}

function renderLogoText(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number
): void {
  doc
    .fontSize(28)
    .font("Helvetica-Bold")
    .fillColor(YELLOW)
    .text("R", x, y, { continued: true })
    .fillColor(BLACK)
    .text("EALLLIZA");
  doc
    .fontSize(7)
    .font("Helvetica")
    .fillColor(ZINC_500)
    .text("REVESTIMENTO VINÍLICO", x, y + 32);
}

function drawSectionHeader(
  doc: PDFKit.PDFDocument,
  title: string,
  x: number,
  y: number,
  w: number
): void {
  doc.rect(x, y, w, 18).fill(YELLOW);
  doc
    .fontSize(9)
    .font("Helvetica-Bold")
    .fillColor(BLACK)
    .text(title, x + 6, y + 5, { width: w - 12 });
}
