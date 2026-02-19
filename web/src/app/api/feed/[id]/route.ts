import { NextRequest } from "next/server";
import { authenticateRequest, checkRole } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

/**
 * GET /api/feed/[id]
 * Get a single feed post by ID with author info.
 * Accessible by: any authenticated user
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await authenticateRequest(request);
    const { id } = await params;

    const supabase = getAdminClient();

    const { data: post, error } = await supabase
      .from("feed_posts")
      .select(
        `
        *,
        author:profiles!feed_posts_author_id_fkey(id, full_name, avatar_url)
      `
      )
      .eq("id", id)
      .single();

    if (error || !post) {
      return jsonResponse(
        { message: `Feed post with ID ${id} not found` },
        404
      );
    }

    return jsonResponse(post);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PUT /api/feed/[id]
 * Update a feed post.
 * Accessible by: admin only
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const { id } = await params;

    const body = await request.json();

    const supabase = getAdminClient();

    // Verify the post exists and capture old data for audit
    const { data: existing, error: findError } = await supabase
      .from("feed_posts")
      .select("*")
      .eq("id", id)
      .single();

    if (findError || !existing) {
      return jsonResponse(
        { message: `Feed post with ID ${id} not found` },
        404
      );
    }

    // Validate audience if provided
    const validAudiences = ["all", "employees", "partners"];
    if (body.audience && !validAudiences.includes(body.audience)) {
      return jsonResponse(
        { message: `audience must be one of: ${validAudiences.join(", ")}` },
        400
      );
    }

    // Only allow specific fields to be updated
    const updateData: Record<string, unknown> = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.content !== undefined) updateData.content = body.content;
    if (body.media_urls !== undefined) updateData.media_urls = body.media_urls;
    if (body.audience !== undefined) updateData.audience = body.audience;
    if (typeof body.is_pinned === "boolean") updateData.is_pinned = body.is_pinned;
    if (typeof body.is_published === "boolean") updateData.is_published = body.is_published;

    const { data: post, error } = await supabase
      .from("feed_posts")
      .update(updateData)
      .eq("id", id)
      .select(
        `
        *,
        author:profiles!feed_posts_author_id_fkey(id, full_name, avatar_url)
      `
      )
      .single();

    if (error) {
      console.error(`Failed to update feed post ${id}: ${error.message}`);
      return jsonResponse({ message: "Failed to update feed post" }, 500);
    }

    // Log audit
    logAudit({
      userId: user.id,
      action: "UPDATE",
      entityType: "feed_post",
      entityId: id,
      oldData: existing as Record<string, unknown>,
      newData: post as Record<string, unknown>,
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });

    return jsonResponse(post);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * DELETE /api/feed/[id]
 * Delete a feed post.
 * Accessible by: admin only
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const { id } = await params;

    const supabase = getAdminClient();

    // Verify the post exists and capture data for audit
    const { data: existing, error: findError } = await supabase
      .from("feed_posts")
      .select("*")
      .eq("id", id)
      .single();

    if (findError || !existing) {
      return jsonResponse(
        { message: `Feed post with ID ${id} not found` },
        404
      );
    }

    const { error } = await supabase
      .from("feed_posts")
      .delete()
      .eq("id", id);

    if (error) {
      console.error(`Failed to delete feed post ${id}: ${error.message}`);
      return jsonResponse({ message: "Failed to delete feed post" }, 500);
    }

    // Log audit
    logAudit({
      userId: user.id,
      action: "DELETE",
      entityType: "feed_post",
      entityId: id,
      oldData: existing as Record<string, unknown>,
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });

    return jsonResponse({ message: "Feed post deleted successfully" });
  } catch (error) {
    return errorResponse(error);
  }
}
