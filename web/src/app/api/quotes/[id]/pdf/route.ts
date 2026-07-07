export const runtime = "nodejs";

import { NextRequest } from "next/server";
import PDFDocument from "pdfkit";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/quotes/[id]/pdf
 *
 * Gera PDF do orcamento pra loja parceira baixar e enviar pro cliente final
 * (Jessica 24/06). Layout inspirado no resumo da tela de novo orcamento —
 * inclui item "Horário especial (+25%)" quando aplicavel, com o valor.
 * Nao mostra "Duracao estimada" (Jessica pediu pra tirar).
 *
 * Permissao: admin ve tudo; partner ve o proprio; outros roles admin-like
 * (gestor, diretor, supervisor) tambem veem.
 */

const fmtBRL = (v: number | string | null | undefined): string => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "R$ 0,00";
  return `R$ ${n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const fmtDate = (d: string | null | undefined): string =>
  d ? new Date(d).toLocaleDateString("pt-BR") : "-";

const fmtDateTime = (d: string | null | undefined): string =>
  d ? new Date(d).toLocaleString("pt-BR") : "-";

const safe = (v: string | null | undefined, fallback = "Não informado"): string =>
  v && String(v).trim() ? String(v).trim() : fallback;

const MODALITY_LABELS: Record<string, string> = {
  reallliza: "Reallliza (equipe própria)",
  homologados: "Homologados (rede parceira)",
};

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

    if (qErr || !quote) {
      throw new AuthError(404, "Orçamento não encontrado");
    }

    // Partner so pode ver o proprio orcamento
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

    // Nome do parceiro (opcional — pro rodape do doc)
    let partnerName = "";
    if (quote.partner_id) {
      const { data: p } = await admin
        .from("partners")
        .select("company_name")
        .eq("id", quote.partner_id)
        .maybeSingle();
      partnerName = (p as { company_name?: string } | null)?.company_name ?? "";
    }

    // ================================================================
    // Monta PDF
    // ================================================================
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
    });

    const pageW = doc.page.width - 80;
    const leftX = 40;

    // Cabecalho
    doc
      .fontSize(20)
      .font("Helvetica-Bold")
      .fillColor("#111827")
      .text(`Orçamento #${quote.quote_number}`, leftX, 45, { width: pageW });
    doc
      .moveTo(leftX, 76)
      .lineTo(leftX + pageW, 76)
      .strokeColor("#EAB308")
      .lineWidth(2)
      .stroke();
    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor("#6B7280")
      .text(
        `Emitido em ${new Date().toLocaleString("pt-BR")}${
          partnerName ? `  ·  ${partnerName}` : ""
        }`,
        leftX,
        84,
        { width: pageW }
      );

    doc.y = 108;

    const section = (title: string) => {
      if (doc.y > 720) doc.addPage();
      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .fillColor("#111827")
        .text(title.toUpperCase(), leftX, doc.y, { width: pageW });
      doc
        .moveTo(leftX, doc.y + 2)
        .lineTo(leftX + pageW, doc.y + 2)
        .strokeColor("#E5E7EB")
        .lineWidth(0.5)
        .stroke();
      doc.moveDown(0.4);
    };

    const kv = (k: string, v: string) => {
      if (doc.y > 740) doc.addPage();
      doc
        .fontSize(8)
        .font("Helvetica")
        .fillColor("#6B7280")
        .text(k, leftX, doc.y, { width: pageW });
      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .fillColor("#111827")
        .text(v, leftX, doc.y + 2, { width: pageW });
      doc.moveDown(0.4);
    };

    // === Cliente ===
    section("Cliente");
    kv("Nome", safe(quote.client_name as string));
    if (quote.client_phone) kv("Telefone", safe(quote.client_phone as string));
    if (quote.client_whatsapp)
      kv("WhatsApp", safe(quote.client_whatsapp as string));
    if (quote.client_email) kv("E-mail", safe(quote.client_email as string));
    if (quote.client_document) kv("CPF/CNPJ", safe(quote.client_document as string));

    const enderecoObra = [
      quote.address_street,
      quote.address_number,
      quote.address_neighborhood,
      quote.address_city,
      quote.address_state,
      quote.address_zip,
    ]
      .filter(Boolean)
      .join(", ") || null;
    if (enderecoObra) kv("Endereço", enderecoObra);

    // === Servico ===
    section("Serviço");
    if (quote.modality) {
      kv(
        "Modalidade",
        MODALITY_LABELS[quote.modality as string] ?? String(quote.modality)
      );
    }
    if (quote.service_date) {
      const dateStr = fmtDate(quote.service_date as string);
      const timeStr = quote.service_time
        ? ` às ${(quote.service_time as string).slice(0, 5)}`
        : "";
      kv("Data prevista", `${dateStr}${timeStr}`);
    }

    // === Itens ===
    section("Itens");
    const items = (quote.items as Array<{
      quantity: number;
      unit: string | null;
      unit_price: number;
      service_name: string;
    }> | null) || [];

    // Cabecalho da tabela
    const colName = leftX;
    const colValue = leftX + pageW;
    doc
      .fontSize(8)
      .font("Helvetica-Bold")
      .fillColor("#6B7280")
      .text("Serviço", colName, doc.y, { width: pageW - 100 });
    doc.text("Valor", colValue - 100, doc.y - 10, {
      width: 100,
      align: "right",
    });
    doc.moveDown(0.3);
    doc
      .moveTo(leftX, doc.y)
      .lineTo(leftX + pageW, doc.y)
      .strokeColor("#E5E7EB")
      .lineWidth(0.5)
      .stroke();
    doc.moveDown(0.3);

    for (const it of items) {
      if (doc.y > 740) doc.addPage();
      const line = `${it.quantity}× ${it.service_name}`;
      const total = Number(it.quantity) * Number(it.unit_price);
      doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor("#111827")
        .text(line, colName, doc.y, { width: pageW - 100 });
      doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor("#111827")
        .text(fmtBRL(total), colValue - 100, doc.y - 11, {
          width: 100,
          align: "right",
        });
      doc.moveDown(0.4);
    }

    doc.moveDown(0.4);

    // === Resumo (breakdown modelo Jessica 24/06) ===
    section("Resumo");

    const summaryLine = (label: string, value: string, highlight = false) => {
      if (doc.y > 740) doc.addPage();
      const color = highlight ? "#D97706" : "#111827";
      doc
        .fontSize(highlight ? 10 : 9)
        .font(highlight ? "Helvetica-Bold" : "Helvetica")
        .fillColor(color)
        .text(label, colName, doc.y, { width: pageW - 100 });
      doc
        .fontSize(highlight ? 10 : 9)
        .font(highlight ? "Helvetica-Bold" : "Helvetica")
        .fillColor(color)
        .text(value, colValue - 100, doc.y - (highlight ? 12 : 11), {
          width: 100,
          align: "right",
        });
      doc.moveDown(0.35);
    };

    if (Number(quote.subtotal_services) > 0) {
      summaryLine("Subtotal de serviços", fmtBRL(quote.subtotal_services));
    }
    if (Number(quote.travel_cost) > 0) {
      const km =
        Number(quote.travel_distance_km) > 0
          ? ` (${Number(quote.travel_distance_km).toFixed(1)} km)`
          : "";
      summaryLine(`Deslocamento${km}`, fmtBRL(quote.travel_cost));
    }
    if (Number(quote.stay_cost) > 0) {
      const days =
        Number(quote.stay_count) > 0
          ? ` (${Number(quote.stay_count)} ${
              Number(quote.stay_count) === 1 ? "diária" : "diárias"
            })`
          : "";
      summaryLine(`Estadia${days}`, fmtBRL(quote.stay_cost));
    }

    // Horario especial — o pedido central da Jessica 24/06.
    // Aparece com destaque em laranja, exatamente como na tela.
    if (quote.is_special_hour && Number(quote.special_hour_extra) > 0) {
      summaryLine(
        "Horário especial (+25%)",
        fmtBRL(quote.special_hour_extra),
        true
      );
    }

    // Linha divisoria antes do total
    doc.moveDown(0.3);
    doc
      .moveTo(leftX, doc.y)
      .lineTo(leftX + pageW, doc.y)
      .strokeColor("#111827")
      .lineWidth(1)
      .stroke();
    doc.moveDown(0.4);

    // Total
    doc
      .fontSize(12)
      .font("Helvetica-Bold")
      .fillColor("#111827")
      .text("Total", colName, doc.y, { width: pageW - 100 });
    doc
      .fontSize(13)
      .font("Helvetica-Bold")
      .fillColor("#111827")
      .text(fmtBRL(quote.total_amount), colValue - 100, doc.y - 14, {
        width: 100,
        align: "right",
      });
    doc.moveDown(1);

    // Observacoes
    if (quote.notes) {
      section("Observações");
      doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor("#374151")
        .text(String(quote.notes), leftX, doc.y, {
          width: pageW,
          align: "justify",
        });
    }

    // Rodape
    const footY = doc.page.height - 40;
    doc
      .fontSize(7)
      .fillColor("#9CA3AF")
      .font("Helvetica")
      .text(
        `Reallliza Revestimentos · Orçamento #${quote.quote_number} · Gerado automaticamente em ${fmtDateTime(new Date().toISOString())}`,
        leftX,
        footY,
        { align: "center", width: pageW }
      );

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
