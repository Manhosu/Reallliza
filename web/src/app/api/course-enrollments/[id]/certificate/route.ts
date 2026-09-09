export const runtime = "nodejs";

import { NextRequest } from "next/server";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { errorResponse } from "@/lib/api-helpers/response";

function getBaseUrl(request: NextRequest): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  const host = request.headers.get("host") ?? "reallliza-web.vercel.app";
  const proto = host.startsWith("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}

/**
 * GET /api/course-enrollments/[id]/certificate
 * Gera PDF de certificado do curso concluido. Disponivel quando
 * enrollment.status='completed' e enrollment.certificate_code != null.
 *
 * Apenas o proprio user ou admin pode baixar.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id } = await params;

    const supabase = getAdminClient();
    const { data: enr } = await supabase
      .from("course_enrollments")
      .select(
        "*, course:courses(title, description, workload_hours), user:profiles(full_name, email)"
      )
      .eq("id", id)
      .single();

    if (!enr) throw new AuthError(404, "Matricula nao encontrada");

    const e = enr as {
      user_id: string;
      status: string;
      certificate_code: string | null;
      certificate_issued_at: string | null;
      progress_pct: number;
      completed_at: string | null;
      course: { title: string; description: string | null; workload_hours: number | null } | null;
      user: { full_name: string; email: string } | null;
    };

    if (user.role !== "admin" && user.id !== e.user_id) {
      throw new AuthError(403, "Sem permissao");
    }
    if (e.status !== "completed" || !e.certificate_code) {
      throw new AuthError(400, "Certificado ainda nao disponivel");
    }

    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 40,
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
    });

    const w = doc.page.width;
    const h = doc.page.height;

    // Borda decorativa
    doc.lineWidth(3).strokeColor("#EAB308")
      .rect(20, 20, w - 40, h - 40)
      .stroke();
    doc.lineWidth(0.5).strokeColor("#A16207")
      .rect(30, 30, w - 60, h - 60)
      .stroke();

    // Cabecalho
    doc.fontSize(36).font("Helvetica-Bold").fillColor("#1F2937")
      .text("CERTIFICADO", 0, 80, { align: "center", width: w });
    doc.fontSize(14).font("Helvetica").fillColor("#666666")
      .text("Reallliza Revestimentos", 0, 130, { align: "center", width: w });

    // Corpo
    doc.fontSize(14).font("Helvetica").fillColor("#222222")
      .text("Certificamos que", 0, 200, { align: "center", width: w });

    doc.fontSize(28).font("Helvetica-Bold").fillColor("#EAB308")
      .text(e.user?.full_name ?? "—", 0, 230, { align: "center", width: w });

    doc.fontSize(14).font("Helvetica").fillColor("#222222")
      .text("concluiu com aproveitamento o curso", 0, 290, { align: "center", width: w });

    doc.fontSize(22).font("Helvetica-Bold").fillColor("#1F2937")
      .text(e.course?.title ?? "—", 0, 320, { align: "center", width: w });

    if (e.course?.workload_hours) {
      doc.fontSize(11).font("Helvetica-Bold").fillColor("#A16207")
        .text(`Carga horária: ${e.course.workload_hours}h`, 0, 352, {
          align: "center",
          width: w,
        });
    }

    if (e.course?.description) {
      doc.fontSize(11).font("Helvetica-Oblique").fillColor("#666666")
        .text(e.course.description.slice(0, 200), 80, 372, {
          align: "center",
          width: w - 160,
        });
    }

    // Rodape
    const completedDate = e.completed_at
      ? new Date(e.completed_at).toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })
      : "—";
    doc.fontSize(11).font("Helvetica").fillColor("#444444")
      .text(`Concluido em ${completedDate}`, 0, h - 140, {
        align: "center",
        width: w,
      });
    doc.fontSize(10).fillColor("#888888")
      .text(`Codigo de verificacao: ${e.certificate_code}`, 0, h - 110, {
        align: "center",
        width: w,
      });
    doc.fontSize(8).fillColor("#AAAAAA")
      .text(
        `Reallliza Revestimentos · Documento gerado em ${new Date().toLocaleString("pt-BR")}`,
        0,
        h - 70,
        { align: "center", width: w }
      );

    // QR de validação — mesmo padrão de execution-report/route.ts, aponta
    // pra página pública que confirma o certificado direto no banco.
    if (e.certificate_code) {
      try {
        const verificationUrl = `${getBaseUrl(request)}/certificado/${e.certificate_code}`;
        const qrPngBuffer = await QRCode.toBuffer(verificationUrl, {
          margin: 0,
          width: 200,
          color: { dark: "#000000", light: "#FFFFFF" },
        });
        doc.image(qrPngBuffer, w - 130, h - 130, { width: 70, height: 70 });
      } catch {
        /* segue sem QR se falhar */
      }
    }

    doc.end();
    const pdfBuffer = await done;

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="certificado_${e.certificate_code}.pdf"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
