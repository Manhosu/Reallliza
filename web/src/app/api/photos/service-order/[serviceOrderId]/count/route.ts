import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ serviceOrderId: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "technician", "partner"]);

    const { serviceOrderId } = await params;
    const supabase = getAdminClient();

    // Get all photos for this service order to count by type
    const { data, error } = await supabase
      .from("photos")
      .select("type")
      .eq("service_order_id", serviceOrderId);

    if (error) {
      console.error(
        `Failed to fetch photo counts for service order ${serviceOrderId}: ${error.message}`
      );
      throw new Error("Failed to fetch photo counts");
    }

    // Build counts by type
    const counts: Record<string, number> = {
      before: 0,
      during: 0,
      after: 0,
      issue: 0,
      signature: 0,
    };

    let total = 0;
    if (data) {
      for (const photo of data) {
        const photoType = photo.type as string;
        if (photoType in counts) {
          counts[photoType]++;
        }
        total++;
      }
    }

    return jsonResponse({
      service_order_id: serviceOrderId,
      total,
      by_type: counts,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
