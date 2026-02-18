import { NextRequest } from "next/server";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { authenticateRequest, checkRole } from "@/lib/api-helpers/auth";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { createNotification } from "@/lib/api-helpers/notifications";

/**
 * GET /api/schedules
 * List schedules with pagination and filters.
 * Accessible by all authenticated users.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const technician_id = searchParams.get("technician_id");
    const date_from = searchParams.get("date_from");
    const date_to = searchParams.get("date_to");
    const status = searchParams.get("status");

    const offset = (page - 1) * limit;
    const supabase = getAdminClient();

    let query = supabase
      .from("schedules")
      .select(
        `
        *,
        technician:profiles!schedules_technician_id_fkey(id, full_name, email, phone, avatar_url),
        service_order:service_orders!schedules_service_order_id_fkey(id, order_number, title, status, client_name, address_city)
      `,
        { count: "exact" }
      );

    // If the user is a technician, only show their own schedules
    if (user.role === "technician") {
      query = query.eq("technician_id", user.id);
    } else if (technician_id) {
      query = query.eq("technician_id", technician_id);
    }

    if (status) {
      query = query.eq("status", status);
    }

    if (date_from) {
      query = query.gte("date", date_from);
    }

    if (date_to) {
      query = query.lte("date", date_to);
    }

    query = query
      .order("date", { ascending: true })
      .order("start_time", { ascending: true })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error(`Failed to fetch schedules: ${error.message}`);
      throw new Error("Failed to fetch schedules");
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
 * POST /api/schedules
 * Create a new schedule.
 * Only admin and manager roles can create schedules.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin", "manager"]);

    const body = await request.json();
    const {
      service_order_id,
      technician_id,
      date,
      start_time,
      end_time,
      status: scheduleStatus,
      notes,
    } = body;

    if (!technician_id || !date) {
      return jsonResponse(
        { message: "technician_id and date are required" },
        400
      );
    }

    const supabase = getAdminClient();

    // Check for time conflicts if start and end times are provided
    if (start_time && end_time) {
      let conflictQuery = supabase
        .from("schedules")
        .select("id, start_time, end_time")
        .eq("technician_id", technician_id)
        .eq("date", date)
        .not("status", "eq", "cancelled")
        .not("start_time", "is", null)
        .not("end_time", "is", null);

      const { data: existingSchedules, error: conflictError } =
        await conflictQuery;

      if (conflictError) {
        console.error(
          `Failed to check schedule conflicts: ${conflictError.message}`
        );
        throw new Error("Failed to check schedule conflicts");
      }

      if (existingSchedules && existingSchedules.length > 0) {
        for (const existing of existingSchedules) {
          if (existing.start_time && existing.end_time) {
            if (
              start_time < existing.end_time &&
              end_time > existing.start_time
            ) {
              return jsonResponse(
                {
                  message: `Schedule conflict detected: technician already has a schedule from ${existing.start_time} to ${existing.end_time} on ${date}`,
                },
                400
              );
            }
          }
        }
      }
    }

    const { data: schedule, error } = await supabase
      .from("schedules")
      .insert({
        service_order_id: service_order_id || null,
        technician_id,
        date,
        start_time: start_time || null,
        end_time: end_time || null,
        status: scheduleStatus || "scheduled",
        notes: notes || null,
      })
      .select()
      .single();

    if (error) {
      console.error(`Failed to create schedule: ${error.message}`);
      throw new Error("Failed to create schedule");
    }

    // Notify the technician about the new schedule
    try {
      await createNotification(
        technician_id,
        "Novo agendamento",
        `Novo agendamento para ${date}`,
        "schedule_created",
        { schedule_id: schedule.id }
      );
    } catch {
      // Notification failure should not break the main operation
    }

    return jsonResponse(schedule, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
