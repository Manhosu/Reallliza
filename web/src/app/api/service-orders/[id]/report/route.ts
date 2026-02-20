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

const PRIORITY_LABELS: Record<string, string> = {
  low: "Baixa",
  medium: "Media",
  high: "Alta",
  urgent: "Urgente",
};

/**
 * GET /api/service-orders/[id]/report
 * Generate a PDF report for a single service order.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await authenticateRequest(request);
    const { id } = await params;

    const supabase = getAdminClient();

    // Fetch OS with related data
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

    // Fetch checklists
    const { data: checklists } = await supabase
      .from("checklists")
      .select(
        `
        *,
        template:checklist_templates(id, name)
      `
      )
      .eq("service_order_id", id)
      .order("created_at", { ascending: true });

    // Fetch photos
    const { data: photos } = await supabase
      .from("photos")
      .select("*")
      .eq("service_order_id", id)
      .order("created_at", { ascending: true });

    // Fetch status history
    const { data: history } = await supabase
      .from("os_status_history")
      .select(
        `
        *,
        changed_by_user:profiles!os_status_history_changed_by_fkey(id, full_name)
      `
      )
      .eq("service_order_id", id)
      .order("created_at", { ascending: true });

    // Generate PDF
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));

    const pdfPromise = new Promise<Buffer>((resolve) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
    });

    // --- Header ---
    doc
      .fontSize(20)
      .font("Helvetica-Bold")
      .text("REALLLIZA REVESTIMENTOS", { align: "center" });
    doc.fontSize(12).font("Helvetica").text("Relatorio de Ordem de Servico", {
      align: "center",
    });
    doc.moveDown(0.5);
    doc
      .strokeColor("#EAB308")
      .lineWidth(2)
      .moveTo(50, doc.y)
      .lineTo(545, doc.y)
      .stroke();
    doc.moveDown(1);

    // --- OS Info ---
    doc.fontSize(14).font("Helvetica-Bold").text("Informacoes da OS");
    doc.moveDown(0.3);
    doc.fontSize(10).font("Helvetica");

    const orderNumber = order.order_number || "N/A";
    const lines = [
      `Numero: #${orderNumber}`,
      `Titulo: ${order.title || "N/A"}`,
      `Status: ${STATUS_LABELS[order.status] || order.status}`,
      `Prioridade: ${PRIORITY_LABELS[order.priority] || order.priority}`,
      `Descricao: ${order.description || "N/A"}`,
    ];
    lines.forEach((line) => doc.text(line));
    doc.moveDown(1);

    // --- Client Info ---
    doc.fontSize(14).font("Helvetica-Bold").text("Dados do Cliente");
    doc.moveDown(0.3);
    doc.fontSize(10).font("Helvetica");
    doc.text(`Nome: ${order.client_name || "N/A"}`);
    doc.text(`Telefone: ${order.client_phone || "N/A"}`);
    doc.text(`E-mail: ${order.client_email || "N/A"}`);
    doc.text(`CPF/CNPJ: ${order.client_document || "N/A"}`);

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
      doc.text(`Endereco: ${addressParts.join(", ")}`);
    }
    doc.moveDown(1);

    // --- Responsavel ---
    doc.fontSize(14).font("Helvetica-Bold").text("Responsavel");
    doc.moveDown(0.3);
    doc.fontSize(10).font("Helvetica");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tech = order.technician as any;
    doc.text(`Tecnico: ${tech?.full_name || "Nao atribuido"}`);
    doc.text(`Telefone: ${tech?.phone || "N/A"}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const creator = order.creator as any;
    doc.text(`Criado por: ${creator?.full_name || "N/A"}`);
    doc.moveDown(1);

    // --- Datas ---
    doc.fontSize(14).font("Helvetica-Bold").text("Datas");
    doc.moveDown(0.3);
    doc.fontSize(10).font("Helvetica");
    const fmtDate = (d: string | null) =>
      d ? new Date(d).toLocaleDateString("pt-BR") : "N/A";
    const fmtDateTime = (d: string | null) =>
      d
        ? new Date(d).toLocaleString("pt-BR")
        : "N/A";
    doc.text(`Criada em: ${fmtDateTime(order.created_at)}`);
    doc.text(`Agendada para: ${fmtDate(order.scheduled_date)}`);
    doc.text(`Iniciada em: ${fmtDateTime(order.started_at)}`);
    doc.text(`Concluida em: ${fmtDateTime(order.completed_at)}`);
    doc.moveDown(1);

    // --- Financeiro ---
    if (order.estimated_value || order.final_value) {
      doc.fontSize(14).font("Helvetica-Bold").text("Financeiro");
      doc.moveDown(0.3);
      doc.fontSize(10).font("Helvetica");
      const fmt = (v: number | null) =>
        v != null
          ? `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
          : "N/A";
      doc.text(`Valor Estimado: ${fmt(order.estimated_value)}`);
      doc.text(`Valor Final: ${fmt(order.final_value)}`);
      doc.moveDown(1);
    }

    // --- Checklists ---
    if (checklists && checklists.length > 0) {
      doc.addPage();
      doc.fontSize(14).font("Helvetica-Bold").text("Checklists");
      doc.moveDown(0.3);

      for (const cl of checklists) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tpl = cl.template as any;
        doc
          .fontSize(11)
          .font("Helvetica-Bold")
          .text(tpl?.name || cl.title || "Checklist");
        doc
          .fontSize(9)
          .font("Helvetica")
          .text(
            `Status: ${cl.is_completed ? "Concluido" : "Pendente"} | Data: ${fmtDateTime(cl.completed_at || cl.created_at)}`
          );
        doc.moveDown(0.2);

        const items = (cl.items || []) as Array<{
          label?: string;
          checked?: boolean;
          notes?: string;
        }>;
        for (const item of items) {
          const check = item.checked ? "[x]" : "[ ]";
          doc.fontSize(9).font("Helvetica").text(`  ${check} ${item.label || ""}`);
          if (item.notes) {
            doc
              .fontSize(8)
              .fillColor("#666666")
              .text(`      Obs: ${item.notes}`)
              .fillColor("#000000");
          }
        }
        doc.moveDown(0.5);
      }
    }

    // --- Photos ---
    if (photos && photos.length > 0) {
      doc.addPage();
      doc.fontSize(14).font("Helvetica-Bold").text("Registro Fotografico");
      doc.moveDown(0.3);
      doc.fontSize(10).font("Helvetica");

      const TYPE_LABELS: Record<string, string> = {
        before: "Antes",
        during: "Durante",
        after: "Depois",
        issue: "Problema",
        signature: "Assinatura",
      };

      for (const photo of photos) {
        doc.text(
          `- [${TYPE_LABELS[photo.type] || photo.type}] ${photo.description || photo.original_filename || "Foto"} (${fmtDateTime(photo.created_at)})`
        );
      }
      doc.moveDown(1);
    }

    // --- Status History ---
    if (history && history.length > 0) {
      doc.fontSize(14).font("Helvetica-Bold").text("Historico de Status");
      doc.moveDown(0.3);
      doc.fontSize(10).font("Helvetica");

      for (const entry of history) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const user = entry.changed_by_user as any;
        const from = STATUS_LABELS[entry.from_status] || entry.from_status || "N/A";
        const to = STATUS_LABELS[entry.to_status] || entry.to_status;
        doc.text(
          `${fmtDateTime(entry.created_at)} - ${from} -> ${to} (por ${user?.full_name || "Sistema"})`
        );
        if (entry.notes) {
          doc
            .fontSize(8)
            .fillColor("#666666")
            .text(`   Obs: ${entry.notes}`)
            .fillColor("#000000")
            .fontSize(10);
        }
      }
    }

    // --- Footer ---
    doc.moveDown(2);
    doc
      .fontSize(8)
      .fillColor("#999999")
      .text(
        `Relatorio gerado em ${new Date().toLocaleString("pt-BR")} | Reallliza Revestimentos`,
        { align: "center" }
      );

    doc.end();

    const pdfBuffer = await pdfPromise;

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="OS_${orderNumber}_relatorio.pdf"`,
        "Content-Length": String(pdfBuffer.length),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
