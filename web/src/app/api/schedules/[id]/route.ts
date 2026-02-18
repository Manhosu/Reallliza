import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";

/**
 * GET /api/schedules/[id]
 * Get a single schedule by ID with technician and service order details.
 * Accessible by all authenticated users.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    const { id } = await params;

    const supabase = getAdminClient();

    const { data: schedule, error } = await supabase
      .from("schedules")
      .select(
        `
        *,
        technician:profiles!schedules_technician_id_fkey(id, full_name, email, phone, avatar_url, specialties),
        service_order:service_orders!schedules_service_order_id_fkey(id, order_number, title, status, priority, client_name, client_phone, address_street, address_number, address_city, address_state)
      `
      )
      .eq("id", id)
      .single();

    if (error || !schedule) {
      return jsonResponse({ message: `Schedule with ID ${id} not found` }, 404);
    }

    return jsonResponse(schedule);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PUT /api/schedules/[id]
 * Update an existing schedule.
 * Only admin and manager roles can update schedules.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "manager"]);
    const { id } = await params;

    const body = await request.json();
    const supabase = getAdminClient();

    // Verify the schedule exists
    const { data: existing, error: findError } = await supabase
      .from("schedules")
      .select("id, technician_id, date")
      .eq("id", id)
      .single();

    if (findError || !existing) {
      return jsonResponse({ message: `Schedule with ID ${id} not found` }, 404);
    }

    // Check for time conflicts if times are being updated
    const technicianId = body.technician_id || existing.technician_id;
    const scheduledDate = body.date || existing.date;

    if (body.start_time && body.end_time) {
      let conflictQuery = supabase
        .from("schedules")
        .select("id, start_time, end_time")
        .eq("technician_id", technicianId)
        .eq("date", scheduledDate)
        .not("status", "eq", "cancelled")
        .not("start_time", "is", null)
        .not("end_time", "is", null)
        .neq("id", id);

      const { data: existingSchedules, error: conflictError } =
        await conflictQuery;

      if (conflictError) {
        console.error(
          `Failed to check schedule conflicts: ${conflictError.message}`
        );
        throw new Error("Failed to check schedule conflicts");
      }

      if (existingSchedules && existingSchedules.length > 0) {
        for (const sched of existingSchedules) {
          if (sched.start_time && sched.end_time) {
            if (
              body.start_time < sched.end_time &&
              body.end_time > sched.start_time
            ) {
              return jsonResponse(
                {
                  message: `Schedule conflict detected: technician already has a schedule from ${sched.start_time} to ${sched.end_time} on ${scheduledDate}`,
                },
                400
              );
            }
          }
        }
      }
    }

    // Build update payload from provided fields
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    const allowedFields = [
      "service_order_id",
      "technician_id",
      "date",
      "start_time",
      "end_time",
      "status",
      "notes",
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    const { data: schedule, error } = await supabase
      .from("schedules")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error(`Failed to update schedule ${id}: ${error.message}`);
      throw new Error("Failed to update schedule");
    }

    return jsonResponse(schedule);
  } catch (error) {
    return errorResponse(error);
  }
}
