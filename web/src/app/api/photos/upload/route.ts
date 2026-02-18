export const runtime = "nodejs";

import { NextRequest } from "next/server";
import sharp from "sharp";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "technician"]);

    const formData = await request.formData();

    // Extract fields from form data
    const file = formData.get("file") as File | null;
    const serviceOrderId = formData.get("service_order_id") as string | null;
    const type = formData.get("type") as string | null;
    const description = formData.get("description") as string | null;
    const geoLatRaw = formData.get("geo_lat") as string | null;
    const geoLngRaw = formData.get("geo_lng") as string | null;

    // Validate required fields
    if (!file) {
      throw new AuthError(400, "File is required");
    }

    if (!serviceOrderId) {
      throw new AuthError(400, "service_order_id is required");
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

    // Validate file type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      throw new AuthError(
        400,
        `File type '${file.type}' is not allowed. Allowed types: jpeg, jpg, png, webp, heic`
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      throw new AuthError(400, "File size exceeds the maximum allowed size of 10MB");
    }

    // Parse optional geo coordinates
    const geoLat = geoLatRaw ? parseFloat(geoLatRaw) : null;
    const geoLng = geoLngRaw ? parseFloat(geoLngRaw) : null;

    const supabase = getAdminClient();

    // Verify service order exists
    const { data: serviceOrder, error: soError } = await supabase
      .from("service_orders")
      .select("id")
      .eq("id", serviceOrderId)
      .single();

    if (soError || !serviceOrder) {
      throw new AuthError(404, `Service order with ID ${serviceOrderId} not found`);
    }

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Process image with sharp - resize main and create thumbnail, output as webp
    const mainBuffer = await sharp(buffer)
      .resize(1920, 1920, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    const thumbnailBuffer = await sharp(buffer)
      .resize(300, 300, { fit: "cover" })
      .webp({ quality: 70 })
      .toBuffer();

    // Generate unique file paths
    const uuid = crypto.randomUUID();
    const mainPath = `os/${serviceOrderId}/${uuid}.webp`;
    const thumbPath = `os/${serviceOrderId}/${uuid}_thumb.webp`;

    // Upload main image to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("photos")
      .upload(mainPath, mainBuffer, {
        contentType: "image/webp",
      });

    if (uploadError) {
      console.error(`Failed to upload photo to storage: ${uploadError.message}`);
      throw new Error(`Failed to upload photo: ${uploadError.message}`);
    }

    // Upload thumbnail to Supabase Storage
    let thumbnailUploadFailed = false;
    const { error: thumbUploadError } = await supabase.storage
      .from("photos")
      .upload(thumbPath, thumbnailBuffer, {
        contentType: "image/webp",
      });

    if (thumbUploadError) {
      console.warn(`Failed to upload thumbnail: ${thumbUploadError.message}`);
      thumbnailUploadFailed = true;
    }

    // Get public URLs
    const {
      data: { publicUrl },
    } = supabase.storage.from("photos").getPublicUrl(mainPath);

    const {
      data: { publicUrl: thumbnailUrl },
    } = supabase.storage.from("photos").getPublicUrl(thumbPath);

    // Insert record into photos table
    const { data: photo, error: insertError } = await supabase
      .from("photos")
      .insert({
        service_order_id: serviceOrderId,
        type,
        url: publicUrl,
        thumbnail_url: thumbnailUploadFailed ? null : thumbnailUrl,
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
      console.error(
        `Failed to create photo record: ${insertError.message} | details: ${JSON.stringify(insertError)}`
      );
      // Attempt to clean up uploaded files
      await supabase.storage.from("photos").remove([mainPath, thumbPath]);
      throw new Error(`Failed to create photo record: ${insertError.message}`);
    }

    return jsonResponse(photo, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
