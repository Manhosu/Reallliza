export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import {
  authenticateRequest,
  checkRole,
  AuthError,
} from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

const ALLOWED_MIME = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
];

const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

/**
 * GET /api/os-projects?service_order_id=...
 * Lista anexos de projeto (PDF/imagem) de uma OS.
 * Qualquer usuário autenticado; RLS faz o gating fino por OS.
 */
export async function GET(request: NextRequest) {
  try {
    await authenticateRequest(request);
    const serviceOrderId = request.nextUrl.searchParams.get(
      "service_order_id"
    );
    if (!serviceOrderId) {
      throw new AuthError(400, "service_order_id is required");
    }

    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from("os_projects")
      .select(
        "id, service_order_id, file_url, file_name, mime_type, size_bytes, uploaded_by, created_at"
      )
      .eq("service_order_id", serviceOrderId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(`Failed to list os_projects: ${error.message}`);
      throw new Error("Failed to list project attachments");
    }

    return jsonResponse(data ?? []);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/os-projects
 * Upload de um anexo (PDF ou imagem) da OS. Apenas admin.
 * Multipart: service_order_id + file.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const serviceOrderId = formData.get("service_order_id") as string | null;

    if (!file) {
      throw new AuthError(400, "File is required");
    }
    if (!serviceOrderId) {
      throw new AuthError(400, "service_order_id is required");
    }
    if (!ALLOWED_MIME.includes(file.type)) {
      throw new AuthError(
        400,
        `Tipo '${file.type}' não suportado. Use JPG, PNG, WEBP ou PDF.`
      );
    }
    if (file.size > MAX_SIZE) {
      throw new AuthError(400, "Arquivo maior que 20 MB.");
    }

    const supabase = getAdminClient();

    // Verify service order exists
    const { data: so, error: soErr } = await supabase
      .from("service_orders")
      .select("id")
      .eq("id", serviceOrderId)
      .single();
    if (soErr || !so) {
      throw new AuthError(404, `OS ${serviceOrderId} não encontrada`);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const extByMime: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "application/pdf": "pdf",
    };
    const uuid = crypto.randomUUID();
    const ext = extByMime[file.type] ?? "bin";
    const path = `os/${serviceOrderId}/${uuid}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from("os-projects")
      .upload(path, buffer, {
        contentType: file.type,
        upsert: false,
      });
    if (upErr) {
      console.error(`Failed to upload os-project: ${upErr.message}`);
      throw new Error(`Falha no upload: ${upErr.message}`);
    }

    // URL pública não funciona em bucket privado — geramos signed URL com TTL longo.
    const { data: signed } = await supabase.storage
      .from("os-projects")
      .createSignedUrl(path, 60 * 60 * 24 * 365); // 1 ano

    const fileUrl = signed?.signedUrl ?? path;

    const { data: row, error: insErr } = await supabase
      .from("os_projects")
      .insert({
        service_order_id: serviceOrderId,
        uploaded_by: user.id,
        file_url: fileUrl,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
      })
      .select()
      .single();

    if (insErr) {
      await supabase.storage.from("os-projects").remove([path]);
      throw new Error(`Falha ao criar registro: ${insErr.message}`);
    }

    logAudit({
      userId: user.id,
      action: "os_project.created",
      entityType: "os_project",
      entityId: row.id,
      newData: {
        service_order_id: serviceOrderId,
        file_name: file.name,
        mime_type: file.type,
      },
    });

    return jsonResponse(row, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
