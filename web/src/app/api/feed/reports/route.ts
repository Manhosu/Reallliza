import { NextRequest } from "next/server";
import { authenticateRequest, checkRole, AuthError } from "@/lib/api-helpers/auth";
import { getAdminClient } from "@/lib/api-helpers/supabase-admin";
import { errorResponse } from "@/lib/api-helpers/response";
import { logAudit } from "@/lib/api-helpers/audit";
import { linhas as tipar } from "@/lib/api-helpers/rows";

/**
 * GET /api/feed/reports — relatório em CSV.
 *
 * Formato de planilha, não PDF: o relatório de campanha vira anexo de e-mail
 * para o fabricante e material de reunião, e nos dois casos alguém vai querer
 * somar uma coluna.
 *
 * `?tipo=` escolhe o recorte: publicacoes, campanhas, leads ou recortes.
 * `?dias=` a janela; `?sponsor_id=` e `?campaign_id=` filtram.
 *
 * Separador ponto e vírgula e BOM no começo, porque o Excel em português
 * abre CSV separado por vírgula tudo numa coluna só — e é no Excel que este
 * arquivo vai ser aberto.
 */
const csv = (linhas: (string | number | null | undefined)[][]) => {
  const escapar = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + linhas.map((l) => l.map(escapar).join(";")).join("\r\n");
};

const dataBr = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "";

type Nomeado = { name?: string } | null;

interface PublicacaoCsv {
  title: string; status: string; published_at: string | null; is_sponsored: boolean;
  impression_count: number; unique_reach: number; video_view_count: number;
  click_count: number; download_count: number; like_count: number;
  comment_count: number; share_count: number; save_count: number;
  lead_count: number; conversion_count: number;
  category: Nomeado; sponsor: Nomeado; campaign: Nomeado;
}

interface CampanhaCsv {
  id: string; name: string; status: string;
  starts_at: string | null; ends_at: string | null; contract_ref: string | null;
  budget_cents: number | null; goal_impressions: number | null;
  goal_clicks: number | null; goal_leads: number | null;
  sponsor: Nomeado;
}

interface LeadCsv {
  created_at: string; kind: string; name: string;
  email: string | null; phone: string | null; uf: string | null;
  city_name: string | null; message: string | null; status: string;
  converted_at: string | null;
  post: { title?: string } | null; sponsor: Nomeado; campaign: Nomeado;
}

interface RecorteCsv {
  dim_type: string; dim_value: string; pessoas: number;
  impressions: number | null; clicks: number | null; suprimido: boolean;
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    checkRole(user, ["admin"]);
    const supabase = getAdminClient();

    const { searchParams } = new URL(request.url);
    const tipo = searchParams.get("tipo") ?? "publicacoes";
    const dias = Math.min(Math.max(Number(searchParams.get("dias") ?? 30), 1), 365);
    const patrocinador = searchParams.get("sponsor_id");
    const campanha = searchParams.get("campaign_id");

    const desde = new Date();
    desde.setDate(desde.getDate() - dias);
    const desdeDia = desde.toISOString().slice(0, 10);

    let linhas: (string | number | null)[][] = [];
    let nome = "relatorio";

    if (tipo === "publicacoes") {
      nome = "publicacoes";
      let c = supabase
        .from("feed_posts")
        .select(
          "id, title, status, published_at, is_sponsored, impression_count, unique_reach, " +
            "video_view_count, click_count, download_count, like_count, comment_count, " +
            "share_count, save_count, lead_count, conversion_count, " +
            "category:feed_categories(name), sponsor:feed_sponsors(name), campaign:feed_campaigns(name)"
        )
        .neq("status", "draft")
        .order("published_at", { ascending: false });
      if (patrocinador) c = c.eq("sponsor_id", patrocinador);
      if (campanha) c = c.eq("campaign_id", campanha);

      const { data, error } = await c;
      if (error) throw new Error(error.message);

      linhas = [
        ["Publicação", "Situação", "Publicada em", "Categoria", "Patrocinador", "Campanha",
         "Patrocinada", "Impressões", "Alcance único", "Visualizações de vídeo", "Cliques",
         "Downloads", "Curtidas", "Comentários", "Compartilhamentos", "Salvamentos",
         "Leads", "Conversões", "CTR (%)"],
        ...tipar<PublicacaoCsv>(data).map((p) => {
          const cat = p.category;
          const sp = p.sponsor;
          const cp = p.campaign;
          return [
            p.title, p.status, dataBr(p.published_at), cat?.name ?? "", sp?.name ?? "",
            cp?.name ?? "", p.is_sponsored ? "Sim" : "Não",
            p.impression_count, p.unique_reach, p.video_view_count, p.click_count,
            p.download_count, p.like_count, p.comment_count, p.share_count, p.save_count,
            p.lead_count, p.conversion_count,
            p.impression_count > 0
              ? ((p.click_count / p.impression_count) * 100).toFixed(2).replace(".", ",")
              : "0,00",
          ];
        }),
      ];
    } else if (tipo === "campanhas") {
      nome = "campanhas";
      let c = supabase
        .from("feed_campaigns")
        .select("*, sponsor:feed_sponsors(name)")
        .order("created_at", { ascending: false });
      if (patrocinador) c = c.eq("sponsor_id", patrocinador);
      const { data, error } = await c;
      if (error) throw new Error(error.message);

      const { data: metricas } = await supabase
        .from("feed_post_daily_metrics")
        .select("campaign_id, impressions, clicks, leads, conversions")
        .not("campaign_id", "is", null);

      const soma = new Map<string, { i: number; c: number; l: number; v: number }>();
      for (const m of metricas ?? []) {
        const a = soma.get(m.campaign_id) ?? { i: 0, c: 0, l: 0, v: 0 };
        a.i += Number(m.impressions ?? 0);
        a.c += Number(m.clicks ?? 0);
        a.l += Number(m.leads ?? 0);
        a.v += Number(m.conversions ?? 0);
        soma.set(m.campaign_id, a);
      }

      linhas = [
        ["Campanha", "Patrocinador", "Situação", "Início", "Fim", "Contrato", "Investimento (R$)",
         "Meta impressões", "Impressões", "Meta cliques", "Cliques", "Meta leads", "Leads", "Conversões"],
        ...tipar<CampanhaCsv>(data).map((c2) => {
          const e = soma.get(c2.id) ?? { i: 0, c: 0, l: 0, v: 0 };
          const sp = c2.sponsor;
          return [
            c2.name, sp?.name ?? "", c2.status, dataBr(c2.starts_at), dataBr(c2.ends_at),
            c2.contract_ref ?? "",
            c2.budget_cents ? (c2.budget_cents / 100).toFixed(2).replace(".", ",") : "",
            c2.goal_impressions ?? "", e.i, c2.goal_clicks ?? "", e.c, c2.goal_leads ?? "", e.l, e.v,
          ];
        }),
      ];
    } else if (tipo === "leads") {
      nome = "leads";
      let c = supabase
        .from("feed_leads")
        .select("*, post:feed_posts(title), sponsor:feed_sponsors(name), campaign:feed_campaigns(name)")
        .gte("created_at", desde.toISOString())
        .order("created_at", { ascending: false });
      if (patrocinador) c = c.eq("sponsor_id", patrocinador);
      if (campanha) c = c.eq("campaign_id", campanha);
      const { data, error } = await c;
      if (error) throw new Error(error.message);

      linhas = [
        ["Data", "Tipo", "Nome", "E-mail", "Telefone", "UF", "Cidade", "Publicação",
         "Campanha", "Patrocinador", "Mensagem", "Situação", "Convertido em"],
        ...tipar<LeadCsv>(data).map((l) => {
          const p = l.post;
          const sp = l.sponsor;
          const cp = l.campaign;
          return [
            dataBr(l.created_at), l.kind, l.name, l.email ?? "", l.phone ?? "",
            l.uf ?? "", l.city_name ?? "", p?.title ?? "", cp?.name ?? "", sp?.name ?? "",
            l.message ?? "", l.status, dataBr(l.converted_at),
          ];
        }),
      ];
    } else if (tipo === "recortes") {
      nome = "recortes";
      const post = searchParams.get("post_id");
      if (!post) throw new AuthError(400, "Informe a publicação para o relatório de recortes");

      const { data, error } = await supabase.rpc("feed_recortes_seguros", {
        p_post_id: post,
        p_minimo: Number(searchParams.get("minimo") ?? 5),
      });
      if (error) throw new Error(error.message);

      linhas = [
        ["Recorte", "Valor", "Pessoas", "Impressões", "Cliques", "Observação"],
        ...tipar<RecorteCsv>(data).map((r) => [
          r.dim_type, r.dim_value, r.pessoas,
          r.suprimido ? "" : Number(r.impressions),
          r.suprimido ? "" : Number(r.clicks),
          // A linha suprimida aparece com o motivo, e não some: sumir daria a
          // impressão de que aquele recorte não teve movimento.
          r.suprimido ? "Suprimido — poucas pessoas para relatar sem identificar alguém" : "",
        ]),
      ];
    } else {
      throw new AuthError(400, "Tipo inválido. Use: publicacoes, campanhas, leads ou recortes");
    }

    logAudit({
      userId: user.id,
      action: "feed_report.exported",
      entityType: "feed_report",
      entityId: tipo,
      newData: { tipo, dias, linhas: linhas.length - 1, patrocinador, campanha },
    });

    const hoje = new Date().toISOString().slice(0, 10);
    return new Response(csv(linhas), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="reallliza-${nome}-${hoje}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
