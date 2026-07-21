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
  // Jessica 16/07: enviou logo horizontal branca+amarela em fundo escuro
  // (logo-reallliza-plataforma.png). Fallbacks mantidos por compatibilidade.
  const candidates = [
    "public/logo-reallliza-plataforma.png",
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
    // Logo Jessica 16/07 e' branca+amarela em fundo escuro — desenha bloco
    // preto arredondado atras pra ficar legivel no papel branco.
    if (logoPath) {
      try {
        const logoBoxX = leftX;
        const logoBoxY = 24;
        const logoBoxW = 200;
        const logoBoxH = 70;
        // Bloco preto arredondado
        doc.roundedRect(logoBoxX, logoBoxY, logoBoxW, logoBoxH, 8).fill(BLACK);
        // Logo dentro do bloco com margem
        doc.image(logoPath, logoBoxX + 15, logoBoxY + 10, {
          fit: [logoBoxW - 30, logoBoxH - 20],
          align: "center",
          valign: "center",
        });
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
    drawInfoRow("Validade:", "30 dias", 28);
    drawInfoRow(
      "Situação:",
      STATUS_LABELS[quote.status as string] ?? String(quote.status),
      42
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

    // Linha TOTAL DOS SERVIÇOS (subtotal apenas dos itens)
    const totalRow = (
      label: string,
      value: string,
      opts: {
        highlight?: boolean;
        color?: string;
        bg?: string;
      } = {}
    ) => {
      const rowH = opts.highlight ? 26 : 20;
      if (opts.bg) {
        doc.rect(leftX, doc.y, pageW, rowH).fill(opts.bg);
      }
      const yRow = doc.y;
      doc
        .fontSize(opts.highlight ? 11 : 10)
        .font(opts.highlight ? "Helvetica-Bold" : "Helvetica")
        .fillColor(opts.color ?? BLACK)
        .text(label, leftX + 8, yRow + (opts.highlight ? 7 : 5), {
          width: pageW - 116,
        });
      doc
        .fontSize(opts.highlight ? 12 : 10)
        .font("Helvetica-Bold")
        .fillColor(opts.color ?? BLACK)
        .text(value, rightX - 100 - 8, yRow + (opts.highlight ? 7 : 5), {
          width: 100,
          align: "right",
        });
      doc.y = yRow + rowH;
    };

    doc.moveDown(0.2);
    totalRow(
      "TOTAL DOS SERVIÇOS",
      fmtBRL(quote.subtotal_services ?? itemsTotal),
      { bg: ZINC_100 }
    );

    // Adicionais (Jessica 16/07 — bug do PDF que nao mostrava esses valores)
    if (Number(quote.travel_cost) > 0) {
      const km =
        Number(quote.travel_distance_km) > 0
          ? ` (${Number(quote.travel_distance_km).toFixed(1)} km · ida+volta)`
          : "";
      totalRow(`Deslocamento${km}`, fmtBRL(quote.travel_cost));
    }
    if (Number(quote.stay_cost) > 0) {
      const days =
        Number(quote.stay_count) > 0
          ? ` (${Number(quote.stay_count)} ${
              Number(quote.stay_count) === 1 ? "diária" : "diárias"
            })`
          : "";
      totalRow(`Estadia${days}`, fmtBRL(quote.stay_cost));
    }
    if (quote.is_special_hour && Number(quote.special_hour_extra) > 0) {
      totalRow(
        "Horário especial (+25%)",
        fmtBRL(quote.special_hour_extra),
        { color: "#D97706" }
      );
    }

    // VALOR TOTAL destacado
    doc.moveDown(0.2);
    totalRow("VALOR TOTAL", fmtBRL(quote.total_amount), {
      highlight: true,
      bg: YELLOW,
    });
    doc.moveDown(0.4);

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
    ];
    const bY = doc.y;
    // Jessica 20/07: 4 caixas (removida "Responsavel Tecnico")
    const bW = pageW / 4;
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

    // ============ INFO EXECUCAO + OBS IMPORTANTES (2 colunas) ============
    // Jessica 16/07: removida coluna Escopo pois o card do form saiu.
    if (doc.y > pageH - 200) doc.addPage();
    const c3Y = doc.y;
    const c3W = (pageW - 10) / 2;

    // Coluna 1: Info execucao
    drawSectionHeader(
      doc,
      "6. INFORMAÇÕES DA EXECUÇÃO",
      leftX,
      c3Y,
      c3W
    );
    let cy = c3Y + 22;
    // Jessica 16/07: removidas linhas Qtd tecnicos, Responsavel; renomeado
    // material a ser instalado -> material disponivel no local.
    const infoItems = [
      { label: "Data prevista da execução:", value: fmtDate((quote.execution_start_date ?? quote.service_date) as string | null) },
      { label: "Horário previsto:", value: quote.service_time ? String(quote.service_time).slice(0, 5) : "-" },
      { label: "Tempo estimado:", value: quote.total_days ? `${quote.total_days} ${Number(quote.total_days) === 1 ? "dia" : "dias"}` : "-" },
      { label: "Material disponível no local:", value: safe(quote.material_description as string) },
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

    // Coluna 2: Obs importantes (Jessica 16/07 — Escopo removido)
    const col2End = c3Y + 22;
    const c3X = leftX + c3W + 10;
    drawSectionHeader(doc, "7. OBSERVAÇÕES IMPORTANTES", c3X, c3Y, c3W);
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

    // Jessica 20/07: removida secao CONDIÇÕES COMERCIAIS (Garantia +
    // Inicio + Prazo) — nao consta no modelo novo. Fica so CONDIÇÕES
    // GERAIS + ACEITE DO CLIENTE abaixo.

    // ============ CONDIÇÕES GERAIS + ACEITE (Jessica 16/07) ============
    // Duas colunas: bullets padrao + espaco em branco pra data e assinatura
    if (doc.y > pageH - 130) doc.addPage();
    const cgY = doc.y;
    const cgColW = (pageW - 20) / 2;

    // Coluna esquerda: CONDIÇÕES GERAIS
    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .fillColor(BLACK)
      .text("8. CONDIÇÕES GERAIS", leftX, cgY);
    const cgBullets = [
      "Este orçamento tem validade de 30 dias a partir da data de emissão.",
      "Após aprovação, será emitida a ordem de serviço e agendamento da execução.",
      "Pagamento conforme acordo comercial entre as partes.",
      ...(quote.general_notes ? [String(quote.general_notes)] : []),
    ];
    let cgY2 = cgY + 16;
    for (const b of cgBullets) {
      doc
        .fontSize(8)
        .font("Helvetica-Bold")
        .fillColor(YELLOW)
        .text("•", leftX + 4, cgY2, { continued: true })
        .fillColor(ZINC_700)
        .font("Helvetica")
        .text("  " + b, { width: cgColW - 10 });
      cgY2 = doc.y + 4;
    }

    // Coluna direita: ACEITE DO CLIENTE
    const acX = leftX + cgColW + 20;
    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .fillColor(BLACK)
      .text("ACEITE DO CLIENTE", acX, cgY);
    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor(ZINC_700)
      .text("_____/_____/_____", acX, cgY + 22, {
        width: cgColW - 10,
      });
    doc.y = cgY + 60;
    doc
      .moveTo(acX, doc.y)
      .lineTo(acX + cgColW - 10, doc.y)
      .strokeColor(ZINC_500)
      .lineWidth(0.5)
      .stroke();
    doc
      .fontSize(8)
      .font("Helvetica")
      .fillColor(ZINC_500)
      .text("Assinatura e Carimbo", acX, doc.y + 3, {
        width: cgColW - 10,
        align: "center",
      });

    doc.y = Math.max(cgY2, doc.y + 18);

    // ============ RODAPE HORIZONTAL COM CONTATO ============
    // 4 blocos horizontais (telefone / email / site / endereço) + slogan
    const footerHeight = 40;
    const footerY = pageH - footerHeight;
    doc.rect(0, footerY, doc.page.width, footerHeight).fill(BLACK);

    const contatos = [
      { label: safe(settings?.phone, "83 98714-5195") },
      { label: safe(settings?.email, "comercial@reallliza.com.br") },
      { label: "www.reallliza.com.br" },
      { label: safe(settings?.base_address, "Av. Angola, 33 - Santa Rita - PB") },
    ];
    const blockW = pageW / contatos.length;
    contatos.forEach((c, i) => {
      doc
        .fontSize(7)
        .font("Helvetica")
        .fillColor("#FFFFFF")
        .text(c.label, leftX + i * blockW, footerY + 15, {
          width: blockW - 8,
          align: "center",
          lineBreak: false,
          ellipsis: true,
        });
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
