export const runtime = "nodejs";

import { NextRequest } from "next/server";
import sharp from "sharp";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/service-orders/[id]/photos
 * List photos for a service order.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id: serviceOrderId } = await params;

    const supabase = getAdminClient();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    let query = supabase
      .from("photos")
      .select("*")
      .eq("service_order_id", serviceOrderId)
      .order("created_at", { ascending: true });

    if (type) {
      const validTypes = ["before", "during", "after", "issue", "signature"];
      if (validTypes.includes(type)) {
        query = query.eq("type", type);
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error(`Failed to fetch photos: ${error.message}`);
      throw new Error("Failed to fetch photos");
    }

    return jsonResponse(data || []);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/service-orders/[id]/photos
 * Upload a photo for a service order.
 * Accepts multipart/form-data with: file, type, description?, geo_lat?, geo_lng?
 */
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "technician"]);

    const { id: serviceOrderId } = await params;
    const formData = await request.formData();

    const file = formData.get("file") as File | null;
    const type = formData.get("type") as string | null;
    const description = formData.get("description") as string | null;
    const geoLatRaw = formData.get("geo_lat") as string | null;
    const geoLngRaw = formData.get("geo_lng") as string | null;

    if (!file) {
      throw new AuthError(400, "File is required");
    }

    if (!type) {
      throw new AuthError(400, "type is required");
    }

    const validTypes = ["before", "during", "after", "issue", "signature"];
    if (!validTypes.includes(type)) {
      throw new AuthError(
        400,
        `Invalid type '${type}'. Must be one of: ${validTypes.join(", ")}`
      );
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      throw new AuthError(400, `File type '${file.type}' is not allowed`);
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new AuthError(400, "File size exceeds 10MB limit");
    }

    const geoLat = geoLatRaw ? parseFloat(geoLatRaw) : null;
    const geoLng = geoLngRaw ? parseFloat(geoLngRaw) : null;

    const supabase = getAdminClient();

    // Verify service order exists
    const { data: so, error: soError } = await supabase
      .from("service_orders")
      .select("id")
      .eq("id", serviceOrderId)
      .single();

    if (soError || !so) {
      throw new AuthError(404, `Service order ${serviceOrderId} not found`);
    }

    // Process image
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const mainBuffer = await sharp(buffer)
      .resize(1920, 1920, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    const thumbnailBuffer = await sharp(buffer)
      .resize(300, 300, { fit: "cover" })
      .webp({ quality: 70 })
      .toBuffer();

    const uuid = crypto.randomUUID();
    const mainPath = `os/${serviceOrderId}/${uuid}.webp`;
    const thumbPath = `os/${serviceOrderId}/${uuid}_thumb.webp`;

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from("photos")
      .upload(mainPath, mainBuffer, { contentType: "image/webp" });

    if (uploadError) {
      throw new Error(`Failed to upload photo: ${uploadError.message}`);
    }

    const { error: thumbError } = await supabase.storage
      .from("photos")
      .upload(thumbPath, thumbnailBuffer, { contentType: "image/webp" });

    const { data: { publicUrl } } = supabase.storage.from("photos").getPublicUrl(mainPath);
    const { data: { publicUrl: thumbnailUrl } } = supabase.storage.from("photos").getPublicUrl(thumbPath);

    const { data: photo, error: insertError } = await supabase
      .from("photos")
      .insert({
        service_order_id: serviceOrderId,
        type,
        url: publicUrl,
        thumbnail_url: thumbError ? null : thumbnailUrl,
        description: description || null,
        original_filename: file.name,
        file_size: mainBuffer.length,
        geo_lat: geoLat,
        geo_lng: geoLng,
        uploaded_by: user.id,
      })
      .select()
      .single();

    if (insertError) {
      await supabase.storage.from("photos").remove([mainPath, thumbPath]);
      throw new Error(`Failed to create photo record: ${insertError.message}`);
    }

    return jsonResponse(photo, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
