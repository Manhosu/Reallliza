import { NextRequest } from "next/server";
import { authenticateRequest, checkRole } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { createNotification } from "@/lib/api-helpers/notifications";

/**
 * GET /api/feed
 * List feed posts with pagination.
 * Filters by audience based on user role. Pinned posts first, then by created_at desc.
 * Accessible by: any authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    const supabase = getAdminClient();
    const offset = (page - 1) * limit;

    // Determine audience filter based on user role
    const audienceFilters: string[] = ["all"];
    if (user.role === "admin" || user.role === "technician") {
      audienceFilters.push("employees");
    }
    if (user.role === "admin" || user.role === "partner") {
      audienceFilters.push("partners");
    }

    let query = supabase
      .from("feed_posts")
      .select(
        `
        *,
        author:profiles!feed_posts_author_id_fkey(id, full_name, avatar_url)
      `,
        { count: "exact" }
      )
      .eq("is_published", true)
      .in("audience", audienceFilters)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error(`Failed to fetch feed posts: ${error.message}`);
      return jsonResponse({ message: "Failed to fetch feed posts" }, 500);
    }

    return jsonResponse({
      data: data || [],
      meta: {
        total: count || 0,
        page,
        limit,
        total_pages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/feed
 * Create a new feed post.
 * Accessible by: admin only
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const body = await request.json();
    const { title, content, media_urls, audience, is_pinned } = body;

    if (!title || !content) {
      return jsonResponse(
        { message: "title and content are required" },
        400
      );
    }

    // Validate audience if provided
    const validAudiences = ["all", "employees", "partners"];
    if (audience && !validAudiences.includes(audience)) {
      return jsonResponse(
        { message: `audience must be one of: ${validAudiences.join(", ")}` },
        400
      );
    }

    const supabase = getAdminClient();

    const insertData: Record<string, unknown> = {
      author_id: user.id,
      title,
      content,
    };
    if (media_urls) insertData.media_urls = media_urls;
    if (audience) insertData.audience = audience;
    if (typeof is_pinned === "boolean") insertData.is_pinned = is_pinned;

    const { data: post, error } = await supabase
      .from("feed_posts")
      .insert(insertData)
      .select(
        `
        *,
        author:profiles!feed_posts_author_id_fkey(id, full_name, avatar_url)
      `
      )
      .single();

    if (error) {
      console.error(`Failed to create feed post: ${error.message}`);
      return jsonResponse({ message: "Failed to create feed post" }, 500);
    }

    // Log audit
    logAudit({
      userId: user.id,
      action: "CREATE",
      entityType: "feed_post",
      entityId: post.id,
      newData: post as Record<string, unknown>,
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });

    // Send push notifications to target audience (fire-and-forget)
    const targetAudience = post.audience || "all";
    const roleFilter: string[] = [];
    if (targetAudience === "all") {
      roleFilter.push("admin", "technician", "partner");
    } else if (targetAudience === "employees") {
      roleFilter.push("admin", "technician");
    } else if (targetAudience === "partners") {
      roleFilter.push("admin", "partner");
    }

    // Fire-and-forget: send notifications to target audience
    (async () => {
      try {
        const { data: recipients } = await supabase
          .from("profiles")
          .select("id")
          .in("role", roleFilter)
          .eq("status", "active")
          .neq("id", user.id);

        if (recipients) {
          for (const r of recipients) {
            createNotification(
              r.id,
              `Novo comunicado: ${post.title}`,
              post.content.substring(0, 100),
              "general",
              { feed_post_id: post.id }
            ).catch(() => {});
          }
        }
      } catch {
        // Notification failure should not break the main operation
      }
    })();

    return jsonResponse(post, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
