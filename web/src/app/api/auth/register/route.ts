import { NextRequest } from "next/server";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { jsonResponse, errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);

    const body = await request.json();
    const {
      email,
      password,
      full_name,
      role,
      phone,
      cpf,
      address,
      specialty_ratings,
    } = body as {
      email: string;
      password: string;
      full_name: string;
      role: string;
      phone?: string;
      cpf?: string;
      address?: string;
      // Aceita os 2 formatos (compat retro):
      // [{name, stars}] (legado, usado até 28/05) ou
      // [{specialty_id, name?, stars}] (novo, vindo do CMS dinâmico).
      specialty_ratings?: Array<{
        name?: string;
        specialty_id?: string;
        stars: number;
      }>;
    };

    if (!email || !password || !full_name || !role) {
      throw new AuthError(400, "Email, password, full_name, and role are required");
    }

    if (password.length < 6) {
      throw new AuthError(400, "Password must be at least 6 characters");
    }

    const validRoles = ["admin", "manager", "technician", "partner"];
    if (!validRoles.includes(role)) {
      throw new AuthError(
        400,
        `Role must be one of: ${validRoles.join(", ")}`
      );
    }

    const supabase = getAdminClient();

    // Normaliza specialty_ratings. Quando vier specialty_id (formato novo),
    // resolvemos o nome via tabela specialties pra manter o jsonb auto-contido.
    let ratings: Array<{ specialty_id?: string; name: string; stars: number }> = [];
    if (Array.isArray(specialty_ratings) && specialty_ratings.length > 0) {
      const idsToResolve = specialty_ratings
        .map((r) => r?.specialty_id)
        .filter((v): v is string => typeof v === "string" && v.length > 0);

      const nameById = new Map<string, string>();
      if (idsToResolve.length > 0) {
        const { data: specs } = await supabase
          .from("specialties")
          .select("id, name")
          .in("id", idsToResolve);
        for (const s of specs ?? []) {
          nameById.set(s.id as string, s.name as string);
        }
      }

      ratings = specialty_ratings
        .map((r) => {
          const resolvedName =
            (r.specialty_id && nameById.get(r.specialty_id)) ||
            (typeof r.name === "string" ? r.name.trim() : "");
          if (!resolvedName) return null;
          return {
            specialty_id: r.specialty_id,
            name: resolvedName,
            stars: Math.max(1, Math.min(5, Math.round(Number(r.stars) || 0))),
          };
        })
        .filter(Boolean) as typeof ratings;
    }

    // Check if user already exists
    const { data: existingUsers } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .limit(1);

    if (existingUsers && existingUsers.length > 0) {
      throw new AuthError(409, "A user with this email already exists");
    }

    // Create user in Supabase Auth using admin API
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name,
          role,
        },
      });

    if (authError) {
      throw new AuthError(500, `Failed to create user: ${authError.message}`);
    }

    // Upsert profile to be safe (trigger may also create it)
    const profileData: Record<string, unknown> = {
      id: authData.user.id,
      email,
      full_name,
      role,
      status: "active",
    };
    if (phone) profileData.phone = phone;
    if (cpf) profileData.cpf = cpf;
    if (address) profileData.address = address;
    if (ratings.length > 0) {
      profileData.specialty_ratings = ratings;
      // Mantém o array `specialties` espelhado pra compat retro (busca por texto)
      profileData.specialties = ratings.map((r) => r.name);
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .upsert(profileData, { onConflict: "id" });

    // Cria/atualiza technician_specialty_scores com a nota inicial do cadastro
    // (stars 1-5). Quando OS forem executadas, a média será recalculada
    // automaticamente — esse é só o ponto de partida.
    if (role === "technician" && ratings.length > 0) {
      const tssRows = ratings
        .filter((r) => r.specialty_id)
        .map((r) => ({
          technician_id: authData.user.id,
          specialty_id: r.specialty_id!,
          os_count: 0,
          score_avg: r.stars, // 1..5
        }));
      if (tssRows.length > 0) {
        await supabase
          .from("technician_specialty_scores")
          .upsert(tssRows, {
            onConflict: "technician_id,specialty_id",
          });
      }
    }

    if (profileError) {
      console.error(
        `Failed to create profile for ${email}: ${profileError.message}`
      );
      // Don't throw - the user was created in auth, profile can be fixed later
    }

    logAudit({
      userId: user.id,
      action: "CREATE",
      entityType: "user",
      entityId: authData.user.id,
      newData: { email, full_name, role },
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });

    return jsonResponse(
      {
        id: authData.user.id,
        email: authData.user.email,
        full_name,
        role,
      },
      201
    );
  } catch (error) {
    return errorResponse(error);
  }
}
