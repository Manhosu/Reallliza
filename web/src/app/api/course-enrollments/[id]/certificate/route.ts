export const runtime = "nodejs";

import { NextRequest } from "next/server";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, AuthError } from "@/lib/api-helpers/auth";
import { errorResponse } from "@/lib/api-helpers/response";

const BODY_BG = "#F8F7F5";
const HEADER_BG = "#171717";
const TEXT_DARK = "#1F2937";

// Dimensões da arte de referência (Jéssica, 17/09) usada como fundo do PDF —
// o layout é fixo, só os campos abaixo variam por certificado. Qualquer
// posição de texto é calculada em cima destas dimensões e escalada pra A4
// paisagem na hora de desenhar.
const SRC_W = 1491;
const SRC_H = 1055;

function getBaseUrl(request: NextRequest): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  const host = request.headers.get("host") ?? "reallliza-web.vercel.app";
  const proto = host.startsWith("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}

function findTemplatePath(): string | null {
  const p = path.join(process.cwd(), "public/certificate-template.jpg");
  try {
    if (fs.existsSync(p)) return p;
  } catch {
    /* ignore */
  }
  return null;
}

/** Busca uma imagem remota (ex: Storage) como Buffer — pdfkit não aceita URL direto. */
async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * GET /api/course-enrollments/[id]/certificate
 * Gera PDF de certificado do curso concluido. Disponivel quando
 * enrollment.status='completed' e enrollment.certificate_code != null.
 *
 * Layout (Jéssica, 17/09): usa a arte de marketing da Reallliza
 * (public/certificate-template.jpg) como fundo — pixel a pixel igual ao
 * modelo aprovado — e só cobre+redesenha os campos que variam por aluno
 * (nome, curso, carga horária, data, aproveitamento, QR, código). A frase
 * "Pessoas mais preparadas / Lojas mais fortes" do canto superior direito
 * foi removida a pedido, sem substituição. A assinatura (imagem + nome +
 * cargo) só é sobrescrita se algo estiver configurado em Configurações
 * Globais — sem configuração, mantém a arte original tal como está.
 *
 * "Aproveitamento" = média das notas de quiz do curso. Sem quiz nenhum,
 * concluir já implica 100% do conteúdo obrigatório visto.
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
      course_id: string;
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

    let scorePct = 100;
    const { data: courseLessons } = await supabase
      .from("course_lessons")
      .select("id, module:course_modules!inner(course_id)")
      .eq("module.course_id", e.course_id);
    const lessonIds = ((courseLessons as Array<{ id: string }> | null) ?? []).map((l) => l.id);
    if (lessonIds.length > 0) {
      const { data: scores } = await supabase
        .from("lesson_progress")
        .select("quiz_score")
        .eq("user_id", e.user_id)
        .in("lesson_id", lessonIds)
        .not("quiz_score", "is", null);
      if (scores && scores.length > 0) {
        scorePct = Math.round(
          scores.reduce((sum, s) => sum + (s.quiz_score ?? 0), 0) / scores.length
        );
      }
    }

    const { data: companyRow } = await supabase
      .from("company_settings")
      .select("certificate_signature_url, certificate_signer_name, certificate_signer_title")
      .limit(1)
      .maybeSingle();
    const company = companyRow as {
      certificate_signature_url: string | null;
      certificate_signer_name: string | null;
      certificate_signer_title: string | null;
    } | null;

    const signatureBuffer = company?.certificate_signature_url
      ? await fetchImageBuffer(company.certificate_signature_url)
      : null;
    const signerName = company?.certificate_signer_name ?? null;
    const signerTitle = company?.certificate_signer_title ?? null;

    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
    });

    const w = doc.page.width;
    const h = doc.page.height;
    const sx = w / SRC_W;
    const sy = h / SRC_H;
    const X = (px: number) => px * sx;
    const Y = (py: number) => py * sy;
    const W = (pw: number) => pw * sx;
    const H = (ph: number) => ph * sy;
    const cover = (px: number, py: number, pw: number, ph: number, color: string) => {
      doc.rect(X(px), Y(py), W(pw), H(ph)).fill(color);
    };

    const templatePath = findTemplatePath();
    if (templatePath) {
      doc.image(templatePath, 0, 0, { width: w, height: h });
    }

    // Remove a frase "Pessoas mais preparadas / Lojas mais fortes" (Jéssica,
    // 17/09) — sem substituição, só limpa o canto do header.
    cover(1210, 15, 281, 140, HEADER_BG);

    // Nome do aluno.
    cover(480, 385, 970, 68, BODY_BG);
    doc.font("Helvetica-Bold").fontSize(H(46)).fillColor(TEXT_DARK)
      .text((e.user?.full_name ?? "—").toUpperCase(), X(480), Y(392), {
        width: W(970),
        align: "center",
      });

    // Curso.
    cover(480, 490, 970, 62, BODY_BG);
    doc.font("Helvetica-Bold").fontSize(H(34)).fillColor(TEXT_DARK)
      .text((e.course?.title ?? "—").toUpperCase(), X(480), Y(497), {
        width: W(970),
        align: "center",
      });

    // Carga horária / conclusão / aproveitamento.
    const completedDate = e.completed_at
      ? new Date(e.completed_at).toLocaleDateString("pt-BR")
      : "—";
    const workloadLabel = e.course?.workload_hours ? `${e.course.workload_hours} horas` : "—";

    cover(488, 670, 220, 55, BODY_BG);
    doc.font("Helvetica-Bold").fontSize(H(28)).fillColor(TEXT_DARK)
      .text(workloadLabel, X(495), Y(678), { width: W(200) });

    cover(822, 670, 200, 55, BODY_BG);
    doc.font("Helvetica-Bold").fontSize(H(28)).fillColor(TEXT_DARK)
      .text(completedDate, X(830), Y(678), { width: W(190) });

    cover(1140, 670, 150, 55, BODY_BG);
    doc.font("Helvetica-Bold").fontSize(H(28)).fillColor(TEXT_DARK)
      .text(`${scorePct}%`, X(1148), Y(678), { width: W(140) });

    // QR de validação — mesmo padrão de execution-report/route.ts.
    if (e.certificate_code) {
      try {
        const verificationUrl = `${getBaseUrl(request)}/certificado/${e.certificate_code}`;
        const qrPngBuffer = await QRCode.toBuffer(verificationUrl, {
          margin: 0,
          width: 240,
          color: { dark: "#000000", light: "#FFFFFF" },
        });
        cover(438, 745, 125, 125, BODY_BG);
        doc.image(qrPngBuffer, X(445), Y(752), { width: W(110), height: H(110) });

        cover(576, 788, 300, 35, BODY_BG);
        doc.font("Helvetica").fontSize(H(20)).fillColor(TEXT_DARK)
          .text(e.certificate_code, X(580), Y(793), { width: W(290) });
      } catch {
        /* segue sem QR se falhar */
      }
    }

    // Assinatura — só sobrescreve o que foi de fato configurado em
    // Configurações Globais. Sem nada configurado, a arte original (Ricardo
    // Sousa) permanece intacta. Trocando só o nome sem subir uma imagem
    // nova, apaga o rabisco antigo em vez de deixar uma assinatura que não
    // bate com o nome impresso embaixo.
    if (signerName || signerTitle || signatureBuffer) {
      cover(860, 740, 240, 65, BODY_BG);
      if (signatureBuffer) {
        try {
          doc.image(signatureBuffer, X(870), Y(745), { fit: [W(220), H(55)], align: "center" });
        } catch {
          /* segue sem imagem se o buffer não for válido */
        }
      }
    }
    if (signerName || signerTitle) {
      cover(840, 805, 360, 80, BODY_BG);
      doc.font("Helvetica-Bold").fontSize(H(22)).fillColor(TEXT_DARK)
        .text(signerName || "—", X(840), Y(812), { width: W(360), align: "center" });
      doc.font("Helvetica").fontSize(H(18)).fillColor("#555555")
        .text(signerTitle || "", X(840), Y(838), { width: W(360), align: "center" });
      doc.font("Helvetica").fontSize(H(15)).fillColor("#999999")
        .text("REALLLIZA Revestimentos Vinílicos", X(840), Y(862), {
          width: W(360),
          align: "center",
        });
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
