import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "technician", "partner"]);

    const { id } = await params;
    const supabase = getAdminClient();

    const { data: photo, error } = await supabase
      .from("photos")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !photo) {
      throw new AuthError(404, `Photo with ID ${id} not found`);
    }

    return jsonResponse(photo);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "technician"]);

    const { id } = await params;
    const supabase = getAdminClient();

    // Get the photo record
    const { data: photo, error: findError } = await supabase
      .from("photos")
      .select("*")
      .eq("id", id)
      .single();

    if (findError || !photo) {
      throw new AuthError(404, `Photo with ID ${id} not found`);
    }

    // Extract storage paths from URLs and delete from storage
    const url = photo.url as string;
    const bucketPath = url.split("/storage/v1/object/public/photos/");
    if (bucketPath.length === 2) {
      const storagePath = decodeURIComponent(bucketPath[1]);
      const pathsToRemove = [storagePath];

      // Also remove thumbnail if it exists
      if (photo.thumbnail_url) {
        const thumbUrl = photo.thumbnail_url as string;
        const thumbBucketPath = thumbUrl.split("/storage/v1/object/public/photos/");
        if (thumbBucketPath.length === 2) {
          pathsToRemove.push(decodeURIComponent(thumbBucketPath[1]));
        }
      }

      const { error: deleteStorageError } = await supabase.storage
        .from("photos")
        .remove(pathsToRemove);

      if (deleteStorageError) {
        console.warn(
          `Failed to delete photo from storage: ${deleteStorageError.message}`
        );
      }
    }

    // Delete the database record
    const { error: deleteError } = await supabase
      .from("photos")
      .delete()
      .eq("id", id);

    if (deleteError) {
      console.error(`Failed to delete photo record ${id}: ${deleteError.message}`);
      throw new Error("Failed to delete photo");
    }

    // Audit log
    logAudit({
      userId: user.id,
      action: "photo.deleted",
      entityType: "photo",
      entityId: id,
      oldData: photo as Record<string, unknown>,
    });

    return jsonResponse({ message: "Photo deleted successfully" });
  } catch (error) {
    return errorResponse(error);
  }
}
