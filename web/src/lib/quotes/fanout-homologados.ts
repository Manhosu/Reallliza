import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cria proposta broadcast pra homologados da UF alvo. Chamado tanto
 * pelo convert-to-os (fluxo inicial) quanto pelo webhook Asaas ao
 * confirmar topup de edit-proposal (Jessica 20/07).
 *
 * - 1 registro em service_proposals com partner_id=null (broadcast)
 * - Notifica TODOS profiles.role='technician' + is_homologated=true
 *   com operating_region contendo a UF (createNotification priority=high)
 *
 * Fire-and-forget-safe: aceita cair sem quebrar o caller.
 */
export async function refanoutHomologadoProposal(
  supabase: SupabaseClient,
  input: {
    service_order_id: string;
    target_state: string | null;
    quote_number: string | number;
    client_name: string;
    offered_amount: number;
  }
): Promise<{ proposal_id: string | null; recipients: number }> {
  if (!input.target_state) {
    console.warn(
      `refanoutHomologado: OS ${input.service_order_id} sem UF alvo — sem broadcast.`
    );
    return { proposal_id: null, recipients: 0 };
  }
  const uf = input.target_state.toUpperCase();

  const { data: proposal, error: pErr } = await supabase
    .from("service_proposals")
    .insert({
      service_order_id: input.service_order_id,
      partner_id: null,
      status: "pending",
      target_state: uf,
      offered_amount: input.offered_amount,
    })
    .select("id")
    .single();

  if (pErr || !proposal) {
    console.error(
      `refanoutHomologado: falha criar proposal: ${pErr?.message ?? "unknown"}`
    );
    return { proposal_id: null, recipients: 0 };
  }

  // Jessica 20/07: fanout automatico so notificava homologados com
  // operating_region contendo a UF. Homologados com operating_region
  // NULL/vazio (comum no cadastro) eram silenciosamente excluidos. Mesma
  // logica tolerante do admin manual em /api/proposals: se region esta
  // vazio, inclui; se preenchido, precisa bater com a UF.
  const { data: allHomologados } = await supabase
    .from("profiles")
    .select("id, full_name, operating_region")
    .eq("role", "technician")
    .eq("status", "active")
    .eq("is_homologated", true);

  const list = (
    (allHomologados as Array<{
      id: string;
      full_name: string;
      operating_region: string | null;
    }>) || []
  ).filter((h) => {
    const region = (h.operating_region || "").toUpperCase().trim();
    return !region || region.includes(uf);
  });
  if (list.length === 0) {
    console.warn(
      `refanoutHomologado: 0 homologados encontrados em ${uf} — proposta ${(proposal as { id: string }).id} sem destinatarios.`
    );
    return { proposal_id: (proposal as { id: string }).id, recipients: 0 };
  }

  const { createNotification } = await import(
    "@/lib/api-helpers/notifications"
  );

  await Promise.allSettled(
    list.map((h) =>
      createNotification(
        h.id,
        "Nova proposta disponível",
        `Um serviço está disponível na região ${uf}. Primeiro homologado a aceitar leva.`,
        "proposal_available",
        {
          proposal_id: (proposal as { id: string }).id,
          service_order_id: input.service_order_id,
          quote_number: input.quote_number,
          target_state: uf,
          offered_amount: input.offered_amount,
        },
        { priority: "high" }
      )
    )
  );

  return {
    proposal_id: (proposal as { id: string }).id,
    recipients: list.length,
  };
}
