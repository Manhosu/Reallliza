export const runtime = "nodejs";

import { NextRequest } from "next/server";
import PDFDocument from "pdfkit";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest } from "@/lib/api-helpers/auth";
import { errorResponse } from "@/lib/api-helpers/response";

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  pending: "Pendente",
  assigned: "Atribuida",
  in_progress: "Em Andamento",
  paused: "Pausada",
  completed: "Concluida",
  approved: "Aprovada",
  invoiced: "Faturada",
  cancelled: "Cancelada",
  rejected: "Rejeitada",
};

const KIND_LABELS: Record<string, string> = { S: "Serv.", P: "Prod." };

const fmtBRL = (v: number | string | null | undefined): string => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "R$ 0,00";
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtDate = (d: string | null): string =>
  d ? new Date(d).toLocaleDateString("pt-BR") : "-";

const fmtDateTime = (d: string | null): string =>
  d ? new Date(d).toLocaleString("pt-BR") : "-";

const fmtTime = (d: string | null): string =>
  d
    ? new Date(d).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";

const fmtDuration = (seconds: number | null | undefined): string => {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h && m) return `${h}h ${m}min`;
  if (h) return `${h}h`;
  return `${m}min`;
};

/**
 * GET /api/service-orders/[id]/report
 * Gera PDF da OS no layout Cenize (cabecalho, cliente, itens,
 * totais, parcelas, observacoes, aprovacao).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await authenticateRequest(request);
    const { id } = await params;

    const supabase = getAdminClient();

    const { data: order, error: orderError } = await supabase
      .from("service_orders")
      .select(
        `
        *,
        technician:profiles!service_orders_technician_id_fkey(id, full_name, email, phone),
        creator:profiles!service_orders_created_by_fkey(id, full_name)
      `
      )
      .eq("id", id)
      .single();

    if (orderError || !order) {
      return new Response("Service order not found", { status: 404 });
    }

    const { data: items } = await supabase
      .from("service_order_items")
      .select("*")
      .eq("service_order_id", id)
      .order("position", { ascending: true });

    const { data: payments } = await supabase
      .from("service_order_payments")
      .select("*")
      .eq("service_order_id", id)
      .order("position", { ascending: true });

    // Cronograma de execucao (Jessica 18/06): le os_step_executions
    // pra montar a timeline de inicio/pausas/retomadas/conclusao.
    // Estes campos vieram da migration 036 — OSs antigas devolvem array vazio.
    const { data: stepExecs } = await supabase
      .from("os_step_executions")
      .select(
        "id, step_key, order_index, status, started_at, completed_at, " +
          "paused_at, pause_count, total_pause_seconds, pause_log, metadata"
      )
      .eq("service_order_id", id)
      .order("order_index", { ascending: true });

    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    const pdfPromise = new Promise<Buffer>((resolve) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
    });

    const pageWidth = doc.page.width - 80; // 555 - 40 - 40
    const leftX = 40;
    const rightX = doc.page.width - 40;

    // ============================================
    // HEADER
    // ============================================
    const headerTop = doc.y;

    // Lado esquerdo: empresa
    doc
      .fontSize(14)
      .font("Helvetica-Bold")
      .fillColor("#000000")
      .text("REALLLIZA REVESTIMENTOS VINILICOS", leftX, headerTop, { width: 320 });
    doc
      .fontSize(8)
      .font("Helvetica")
      .fillColor("#444444")
      .text("VEXA REVESTIMENTOS LTDA", leftX, doc.y + 2, { width: 320 });
    doc
      .fontSize(8)
      .fillColor("#666666")
      .text("Av. Brasil, 1234 - Centro - Sao Paulo/SP", leftX, doc.y + 1, { width: 320 });
    doc.text("contato@reallliza.com.br", leftX, doc.y + 1, { width: 320 });

    // Lado direito: dados da OS
    const rightBoxX = 380;
    const rightBoxW = rightX - rightBoxX;
    doc
      .fontSize(13)
      .font("Helvetica-Bold")
      .fillColor("#EAB308")
      .text("Ordem de Servico", rightBoxX, headerTop, { width: rightBoxW, align: "right" });
    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor("#000000")
      .text(`Numero: #${order.order_number || "N/A"}`, rightBoxX, doc.y + 2, {
        width: rightBoxW,
        align: "right",
      });
    doc.text(`Data: ${fmtDate(order.created_at)}`, rightBoxX, doc.y + 1, {
      width: rightBoxW,
      align: "right",
    });
    doc.text(
      `Situacao: ${STATUS_LABELS[order.status] || order.status}`,
      rightBoxX,
      doc.y + 1,
      { width: rightBoxW, align: "right" }
    );
    doc.text(
      `Prev. Conclusao: ${fmtDate(order.previsao_conclusao)}`,
      rightBoxX,
      doc.y + 1,
      { width: rightBoxW, align: "right" }
    );

    // Linha amarela
    const lineY = Math.max(doc.y, headerTop + 70) + 6;
    doc
      .strokeColor("#EAB308")
      .lineWidth(1.5)
      .moveTo(leftX, lineY)
      .lineTo(rightX, lineY)
      .stroke();
    doc.y = lineY + 8;

    // ============================================
    // HISTORICO
    // ============================================
    if (order.historico) {
      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .fillColor("#000000")
        .text("Historico", leftX, doc.y);
      doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor("#222222")
        .text(order.historico, leftX, doc.y + 2, { width: pageWidth });
      doc.moveDown(0.5);
    }

    // ============================================
    // CLIENTE
    // ============================================
    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .fillColor("#000000")
      .text("Cliente", leftX, doc.y);

    doc.fontSize(9).font("Helvetica").fillColor("#222222");
    doc.text(`Nome: ${order.client_name || "-"}`, leftX, doc.y + 2);

    const addressParts = [
      order.address_street,
      order.address_number,
      order.address_complement,
      order.address_neighborhood,
      order.address_city,
      order.address_state,
      order.address_zip,
    ].filter(Boolean);
    if (addressParts.length > 0) {
      doc.text(`Endereco: ${addressParts.join(", ")}`, leftX, doc.y + 1, { width: pageWidth });
    }

    doc.text(
      `CPF/CNPJ: ${order.client_document || "-"}    RG/Insc.Estadual: ${order.client_rg_ie || "-"}`,
      leftX,
      doc.y + 1
    );
    doc.text(
      `Telefone: ${order.client_phone || "-"}    Contato: ${order.client_contact_name || "-"}`,
      leftX,
      doc.y + 1
    );
    doc.moveDown(0.5);

    // ============================================
    // PRODUTOS E SERVICOS
    // ============================================
    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .fillColor("#000000")
      .text("Produtos e Servicos", leftX, doc.y);

    const itemList = items || [];
    const tableTop = doc.y + 4;
    const colX = {
      kind: leftX,
      ident: leftX + 36,
      desc: leftX + 76,
      unit: leftX + 320,
      value: leftX + 360,
      qtde: leftX + 425,
      total: leftX + 470,
    };
    const colW = {
      kind: 36,
      ident: 40,
      desc: 244,
      unit: 40,
      value: 65,
      qtde: 45,
      total: 45,
    };

    // Header row
    doc
      .rect(leftX, tableTop, pageWidth, 16)
      .fillColor("#F5F5F5")
      .fill();
    doc.fillColor("#000000").fontSize(8).font("Helvetica-Bold");
    doc.text("Cod.B.", colX.kind + 2, tableTop + 4, { width: colW.kind - 4 });
    doc.text("Identif.", colX.ident + 2, tableTop + 4, { width: colW.ident - 4 });
    doc.text("Descricao", colX.desc + 2, tableTop + 4, { width: colW.desc - 4 });
    doc.text("Un.", colX.unit + 2, tableTop + 4, { width: colW.unit - 4 });
    doc.text("Valor", colX.value + 2, tableTop + 4, { width: colW.value - 4, align: "right" });
    doc.text("Qtde", colX.qtde + 2, tableTop + 4, { width: colW.qtde - 4, align: "right" });
    doc.text("Total", colX.total + 2, tableTop + 4, { width: colW.total - 4, align: "right" });

    let rowY = tableTop + 16;
    doc.font("Helvetica").fontSize(8);
    let subtotal = 0;
    if (itemList.length === 0) {
      doc.fillColor("#888888").text("(Sem itens)", leftX + 4, rowY + 4);
      rowY += 16;
    } else {
      for (const it of itemList) {
        // Quebra de pagina
        if (rowY > 740) {
          doc.addPage();
          rowY = 40;
        }
        const total = Number(it.total ?? Number(it.unit_value) * Number(it.quantity));
        subtotal += total;
        doc.fillColor("#222222");
        doc.text(KIND_LABELS[it.kind] || it.kind, colX.kind + 2, rowY + 2, { width: colW.kind - 4 });
        doc.text(it.identification || "-", colX.ident + 2, rowY + 2, { width: colW.ident - 4 });
        doc.text(it.description || "-", colX.desc + 2, rowY + 2, { width: colW.desc - 4 });
        doc.text(it.unit || "-", colX.unit + 2, rowY + 2, { width: colW.unit - 4 });
        doc.text(fmtBRL(it.unit_value), colX.value + 2, rowY + 2, { width: colW.value - 4, align: "right" });
        doc.text(String(it.quantity), colX.qtde + 2, rowY + 2, { width: colW.qtde - 4, align: "right" });
        doc.text(fmtBRL(total), colX.total + 2, rowY + 2, { width: colW.total - 4, align: "right" });
        rowY += 14;
        // Separador
        doc.strokeColor("#EEEEEE").lineWidth(0.5).moveTo(leftX, rowY).lineTo(rightX, rowY).stroke();
      }
    }

    doc.y = rowY + 6;

    // ============================================
    // TOTAIS
    // ============================================
    const acrescimo = Number(order.acrescimo || 0);
    const desconto = Number(order.desconto || 0);
    const valeTroca = Number(order.vale_troca || 0);
    const totalLiquido = subtotal + acrescimo - desconto - valeTroca;

    const totalsLeftLabel = leftX;
    doc.fontSize(9).font("Helvetica").fillColor("#444444");
    doc.text(`Total de Itens: ${itemList.length}`, totalsLeftLabel, doc.y);

    const totalsX = 360;
    const totalsW = rightX - totalsX;
    let totalsY = doc.y - 12;

    const drawTotalRow = (
      label: string,
      value: string,
      bold: boolean = false,
      highlight: boolean = false
    ) => {
      if (highlight) {
        doc.rect(totalsX, totalsY, totalsW, 16).fillColor("#FFF7CC").fill();
      }
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 10 : 9);
      doc.fillColor(bold ? "#000000" : "#444444");
      doc.text(label, totalsX + 4, totalsY + 3, { width: totalsW * 0.5 });
      doc.text(value, totalsX + 4 + totalsW * 0.5, totalsY + 3, {
        width: totalsW * 0.5 - 4,
        align: "right",
      });
      totalsY += 14;
    };

    drawTotalRow("Total Produtos/Servicos", fmtBRL(subtotal));
    drawTotalRow("Acrescimo", fmtBRL(acrescimo));
    drawTotalRow("Desconto", fmtBRL(desconto));
    drawTotalRow("Vale Troca", fmtBRL(valeTroca));
    drawTotalRow("Total Liquido", fmtBRL(totalLiquido), true, true);

    doc.y = Math.max(doc.y, totalsY) + 10;

    // ============================================
    // PARCELAS
    // ============================================
    const pmts = payments || [];
    if (pmts.length > 0) {
      if (doc.y > 700) {
        doc.addPage();
      }
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#000000").text("Parcelas", leftX, doc.y);
      const pTop = doc.y + 4;
      const pColX = {
        type: leftX,
        num: leftX + 130,
        doc: leftX + 200,
        due: leftX + 290,
        val: leftX + 400,
      };
      const pColW = { type: 130, num: 70, doc: 90, due: 110, val: 115 };

      doc.rect(leftX, pTop, pageWidth, 16).fillColor("#F5F5F5").fill();
      doc.fillColor("#000000").fontSize(8).font("Helvetica-Bold");
      doc.text("Tipo Pgto", pColX.type + 2, pTop + 4, { width: pColW.type - 4 });
      doc.text("Numero", pColX.num + 2, pTop + 4, { width: pColW.num - 4 });
      doc.text("Num.Doc", pColX.doc + 2, pTop + 4, { width: pColW.doc - 4 });
      doc.text("Vencimento", pColX.due + 2, pTop + 4, { width: pColW.due - 4 });
      doc.text("Valor", pColX.val + 2, pTop + 4, { width: pColW.val - 4, align: "right" });

      let pY = pTop + 16;
      doc.font("Helvetica").fontSize(8);
      for (const p of pmts) {
        if (pY > 740) {
          doc.addPage();
          pY = 40;
        }
        doc.fillColor("#222222");
        doc.text(p.payment_type || "-", pColX.type + 2, pY + 2, { width: pColW.type - 4 });
        doc.text(p.number_label || "-", pColX.num + 2, pY + 2, { width: pColW.num - 4 });
        doc.text(p.doc_number || "-", pColX.doc + 2, pY + 2, { width: pColW.doc - 4 });
        doc.text(fmtDate(p.due_date), pColX.due + 2, pY + 2, { width: pColW.due - 4 });
        doc.text(fmtBRL(p.value), pColX.val + 2, pY + 2, { width: pColW.val - 4, align: "right" });
        pY += 14;
        doc.strokeColor("#EEEEEE").lineWidth(0.5).moveTo(leftX, pY).lineTo(rightX, pY).stroke();
      }
      doc.y = pY + 6;
    }

    // ============================================
    // OUTRAS INFORMACOES
    // ============================================
    if (doc.y > 700) doc.addPage();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const creator = order.creator as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tech = order.technician as any;
    doc.fontSize(10).font("Helvetica-Bold").fillColor("#000000").text("Outras Informacoes", leftX, doc.y);
    doc.fontSize(9).font("Helvetica").fillColor("#222222");
    doc.text(`Responsavel: ${creator?.full_name || "-"}`, leftX, doc.y + 2);
    doc.text(`Tecnico: ${tech?.full_name || "-"}`, leftX, doc.y + 1);
    if (order.notes) {
      doc.text(`Observacoes: ${order.notes}`, leftX, doc.y + 1, { width: pageWidth });
    }
    doc.moveDown(0.5);

    // ============================================
    // CRONOGRAMA DE EXECUCAO (Jessica 18/06)
    // Ponto do dia do tecnico: inicio, pausas, retomadas e finalizacao,
    // mais total efetivo / pausado / geral.
    // ============================================
    type TimelineEvent = {
      at: string;
      kind: "start" | "pause" | "resume" | "complete";
      stepName: string;
      reason?: string;
    };

    interface StepRow {
      step_key: string;
      started_at: string | null;
      completed_at: string | null;
      total_pause_seconds: number | null;
      pause_log:
        | Array<{
            paused_at: string;
            resumed_at: string;
            duration_seconds: number;
            reason?: string;
          }>
        | null;
      metadata: Record<string, unknown> | null;
    }

    const rows = ((stepExecs ?? []) as unknown) as StepRow[];
    const stepLabel = (s: StepRow) =>
      ((s.metadata as { name?: string } | null)?.name as string | undefined) ??
      s.step_key;

    const events: TimelineEvent[] = [];
    let summaryStart: string | null = null;
    let summaryEnd: string | null = null;
    let totalActiveSec = 0;
    let totalPauseSec = 0;

    for (const s of rows) {
      const name = stepLabel(s);
      if (s.started_at) {
        events.push({ at: s.started_at, kind: "start", stepName: name });
        if (!summaryStart || s.started_at < summaryStart)
          summaryStart = s.started_at;
      }
      for (const p of s.pause_log ?? []) {
        events.push({
          at: p.paused_at,
          kind: "pause",
          stepName: name,
          reason: p.reason,
        });
        events.push({ at: p.resumed_at, kind: "resume", stepName: name });
      }
      if (s.completed_at) {
        events.push({ at: s.completed_at, kind: "complete", stepName: name });
        if (!summaryEnd || s.completed_at > summaryEnd)
          summaryEnd = s.completed_at;
      }
      if (s.started_at && s.completed_at) {
        const totalSec = Math.round(
          (new Date(s.completed_at).getTime() -
            new Date(s.started_at).getTime()) /
            1000
        );
        totalActiveSec += Math.max(0, totalSec - (s.total_pause_seconds ?? 0));
      }
      totalPauseSec += s.total_pause_seconds ?? 0;
    }
    events.sort((a, b) => a.at.localeCompare(b.at));
    const totalGeralSec = totalActiveSec + totalPauseSec;

    if (rows.length > 0 && events.length > 0) {
      if (doc.y > 640) doc.addPage();
      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .fillColor("#000000")
        .text("Cronograma de Execucao", leftX, doc.y);
      doc.fontSize(9).font("Helvetica").fillColor("#222222");

      const headerY = doc.y + 4;
      doc.text(
        `Inicio do servico: ${fmtDateTime(summaryStart)}`,
        leftX,
        headerY
      );
      doc.text(`Finalizacao: ${fmtDateTime(summaryEnd)}`, leftX, doc.y + 1);

      // KPIs alinhados a direita, na mesma altura do bloco de horarios.
      doc.text(`Total efetivo: ${fmtDuration(totalActiveSec)}`, rightX - 180, headerY, {
        width: 180,
        align: "right",
      });
      doc.text(
        `Total pausado: ${fmtDuration(totalPauseSec)}`,
        rightX - 180,
        headerY + 11,
        { width: 180, align: "right" }
      );
      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .text(
          `Total geral: ${fmtDuration(totalGeralSec)}`,
          rightX - 180,
          headerY + 22,
          { width: 180, align: "right" }
        );

      doc.moveDown(0.8);
      doc
        .fontSize(9)
        .font("Helvetica-Bold")
        .fillColor("#000000")
        .text("Acoes do dia:", leftX, doc.y);
      doc.font("Helvetica").fillColor("#333333");

      const KIND_LABEL: Record<TimelineEvent["kind"], string> = {
        start: "Inicio",
        pause: "Pausa",
        resume: "Retomada",
        complete: "Concluida",
      };

      for (const ev of events) {
        if (doc.y > 760) doc.addPage();
        const time = fmtTime(ev.at);
        const label = KIND_LABEL[ev.kind];
        const tail =
          ev.kind === "pause" && ev.reason
            ? ` - ${ev.reason}`
            : ev.kind === "start" || ev.kind === "complete"
              ? ` - ${ev.stepName}`
              : "";
        doc.text(`  ${time}   ${label}${tail}`, leftX, doc.y + 2, {
          width: pageWidth,
        });
      }
      doc.moveDown(0.5);
    }

    // ============================================
    // APROVACAO
    // ============================================
    if (doc.y > 720) doc.addPage();
    doc.fontSize(10).font("Helvetica-Bold").fillColor("#000000").text("Aprovacao", leftX, doc.y);
    doc.fontSize(9).font("Helvetica").fillColor("#222222");
    doc.text(`Aprovado Em: ${fmtDateTime(order.aprovado_em)}`, leftX, doc.y + 2);
    doc.text(`Aprovado Por: ${order.aprovado_por || "-"}`, leftX, doc.y + 1);

    // Linha de assinatura
    const sigY = doc.y + 30;
    doc.strokeColor("#000000").lineWidth(0.8).moveTo(leftX + 40, sigY).lineTo(leftX + 280, sigY).stroke();
    doc.fontSize(8).fillColor("#666666").text("Assinatura", leftX + 40, sigY + 4, { width: 240, align: "center" });

    // Footer
    doc
      .fontSize(7)
      .fillColor("#999999")
      .text(
        `Documento gerado em ${new Date().toLocaleString("pt-BR")} - Reallliza Revestimentos`,
        leftX,
        780,
        { align: "center", width: pageWidth }
      );

    doc.end();

    const pdfBuffer = await pdfPromise;

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="OS_${order.order_number || id}_relatorio.pdf"`,
        "Content-Length": String(pdfBuffer.length),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
