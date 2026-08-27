import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthError } from "@/lib/api-helpers/auth";

/**
 * Botões de ação e enquete de uma publicação.
 *
 * Nasceram sem caminho de entrada: as tabelas existiam desde a migration 063,
 * o aplicativo já sabia desenhar as duas coisas, e nem o editor nem a API
 * aceitavam criá-las. O único código que gravava nelas era a duplicação — que
 * copiava de um original que ninguém conseguia produzir.
 *
 * A consequência era em cadeia e silenciosa: sem botão não há pedido, sem
 * pedido não há lead, e "Conversões" no painel ficava em zero por construção,
 * parecendo campanha ruim em vez de funcionalidade inalcançável.
 *
 * A sincronização é por substituição, não por diferença. Um post tem no
 * máximo um punhado de botões e uma enquete; calcular o que mudou custaria
 * mais código do que apagar e regravar, e abriria espaço para o estado da
 * tela e o do banco divergirem.
 */

/** Os nove tipos que o José listou, mais os quatro que o modelo já previa. */
export const TIPOS_DE_BOTAO = [
  "conhecer_produto", "solicitar_contato", "baixar_catalogo",
  "participar_treinamento", "comprar_agora", "encontrar_revendedor",
  "solicitar_amostra", "utilizar_cupom", "saiba_mais",
  "assistir_video", "responder_pesquisa", "acessar_curso", "link_externo",
] as const;

export type TipoDeBotao = (typeof TIPOS_DE_BOTAO)[number];

/** Botões que abrem formulário de pedido em vez de navegar. */
export const BOTOES_QUE_GERAM_PEDIDO: Record<string, string> = {
  solicitar_contato: "contato",
  solicitar_amostra: "amostra",
  encontrar_revendedor: "revendedor",
  participar_treinamento: "treinamento",
};

/**
 * Normaliza a URL de um botão de ação antes de gravar ou abrir.
 *
 * Karol 27/08: "o botão não direciona pro destino configurado". O editor
 * (editor-de-anexos.tsx) sempre foi um `<Input placeholder="https://...">`
 * de texto livre, sem validar nada — quem colava "wa.me/551199999999" ou
 * "www.site.com.br" (bem natural, copiando de um link do WhatsApp ou de um
 * cartão de visita) salvava sem erro. `Linking.openURL` no app e `<a href>`
 * na web exigem um esquema (http/https/tel/mailto) pra funcionar; sem ele,
 * o app falha silenciosamente e a web resolve como link relativo do
 * próprio site — os dois "não fazem nada" ou vão pro lugar errado.
 *
 * Aplicada tanto ao salvar (pra dado novo já nascer certo) quanto ao abrir
 * nos dois renderizadores (mobile e leitor web), pra também corrigir o que
 * já estava salvo sem precisar de migração de dados.
 */
export function normalizarUrlDeBotao(url: string): string {
  const v = url.trim();
  if (!v) return v;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return v; // já tem esquema (http:, tel:, mailto:, whatsapp:, etc.)
  return `https://${v}`;
}

export interface BotaoDeAcao {
  cta_type: string;
  label: string;
  style?: string;
  target_url?: string | null;
  target_route?: string | null;
  target_media_id?: string | null;
  coupon_code?: string | null;
}

export interface EnquetePedida {
  question: string;
  options: string[];
  allow_multiple?: boolean;
  is_anonymous?: boolean;
  show_results?: "always" | "after_vote" | "after_close" | "never";
  closes_at?: string | null;
}

const MOSTRAR_RESULTADO = ["always", "after_vote", "after_close", "never"];

/**
 * Regrava os botões de ação da publicação.
 *
 * `undefined` significa "não mexer"; lista vazia significa "apagar todos".
 * A distinção existe porque o PATCH é parcial — salvar só o título não pode
 * varrer os botões junto.
 */
export async function sincronizarBotoes(
  supabase: SupabaseClient,
  postId: string,
  botoes: BotaoDeAcao[] | undefined
): Promise<number> {
  if (botoes === undefined) return -1;
  validarBotoes(botoes);

  await supabase.from("feed_post_ctas").delete().eq("post_id", postId);
  if (botoes.length === 0) return 0;

  const { error } = await supabase.from("feed_post_ctas").insert(
    botoes.map((b, i) => ({
      post_id: postId,
      position: i,
      cta_type: b.cta_type,
      label: b.label.trim(),
      style: b.style ?? "primary",
      target_url: b.target_url?.trim() ? normalizarUrlDeBotao(b.target_url) : null,
      target_route: b.target_route?.trim() || null,
      target_media_id: b.target_media_id || null,
      coupon_code: b.coupon_code?.trim() || null,
    }))
  );
  if (error) throw new Error(`Falha ao salvar os botões: ${error.message}`);
  return botoes.length;
}

/**
 * Confere botões e enquete SEM tocar no banco.
 *
 * Existe separado porque a criação insere a publicação primeiro e os anexos
 * depois: se a checagem só acontecesse na hora de gravar o anexo, um botão
 * inválido deixaria para trás uma publicação órfã, criada e recusada ao mesmo
 * tempo. Quem chama valida antes de inserir qualquer coisa.
 */
export function validarAnexos(
  botoes: BotaoDeAcao[] | undefined,
  enquete: EnquetePedida | null | undefined
): void {
  if (botoes !== undefined) validarBotoes(botoes);
  if (enquete !== undefined && enquete !== null) validarEnquete(enquete);
}

function validarBotoes(botoes: BotaoDeAcao[]): void {
  for (const [i, b] of botoes.entries()) {
    if (!TIPOS_DE_BOTAO.includes(b.cta_type as TipoDeBotao)) {
      throw new AuthError(400, `Tipo de botão desconhecido: "${b.cta_type}"`);
    }
    if (!b.label?.trim()) {
      throw new AuthError(400, `O botão ${i + 1} precisa de um texto`);
    }
    // Botão que gera pedido não precisa de destino — o destino é o formulário.
    // Os outros sem destino viram botão que não faz nada, e o profissional
    // toca, não acontece nada, e a culpa parece ser do aplicativo.
    const geraPedido = b.cta_type in BOTOES_QUE_GERAM_PEDIDO;
    const temDestino = b.target_url?.trim() || b.target_route?.trim() || b.target_media_id;
    if (!geraPedido && b.cta_type !== "utilizar_cupom" && !temDestino) {
      throw new AuthError(400, `O botão "${b.label}" precisa de um link ou destino`);
    }
    if (b.cta_type === "utilizar_cupom" && !b.coupon_code?.trim() && !temDestino) {
      throw new AuthError(400, `O botão "${b.label}" precisa do código do cupom`);
    }
  }
}

function validarEnquete(enquete: EnquetePedida): void {
  if (!String(enquete.question ?? "").trim()) {
    throw new AuthError(400, "A enquete precisa de uma pergunta");
  }
  const opcoes = (enquete.options ?? []).map((o) => String(o).trim()).filter(Boolean);
  if (opcoes.length < 2) throw new AuthError(400, "A enquete precisa de pelo menos duas opções");
  if (opcoes.length > 10) throw new AuthError(400, "A enquete aceita no máximo dez opções");
  if (new Set(opcoes.map((o) => o.toLowerCase())).size !== opcoes.length) {
    throw new AuthError(400, "Há opções repetidas na enquete");
  }
}

/**
 * Regrava a enquete.
 *
 * `undefined` não mexe; `null` apaga. Regravar apaga os votos junto, por
 * cascata — e isso é intencional: mudar as opções depois de votarem tornaria
 * o resultado anterior sem sentido. O editor avisa antes.
 */
export async function sincronizarEnquete(
  supabase: SupabaseClient,
  postId: string,
  enquete: EnquetePedida | null | undefined
): Promise<{ opcoes: number; votosApagados: number } | null> {
  if (enquete === undefined) return null;

  const { data: anterior } = await supabase
    .from("feed_polls")
    .select("id")
    .eq("post_id", postId)
    .maybeSingle();

  let votosApagados = 0;
  if (anterior) {
    const { count } = await supabase
      .from("feed_poll_votes")
      .select("user_id", { count: "exact", head: true })
      .eq("poll_id", anterior.id);
    votosApagados = count ?? 0;
    await supabase.from("feed_polls").delete().eq("id", anterior.id);
  }

  if (enquete === null) return { opcoes: 0, votosApagados };

  validarEnquete(enquete);
  const pergunta = String(enquete.question).trim();
  const opcoes = enquete.options.map((o) => String(o).trim()).filter(Boolean);

  const mostrar = MOSTRAR_RESULTADO.includes(enquete.show_results ?? "")
    ? enquete.show_results
    : "after_vote";

  const { data: nova, error } = await supabase
    .from("feed_polls")
    .insert({
      post_id: postId,
      question: pergunta,
      allow_multiple: !!enquete.allow_multiple,
      is_anonymous: enquete.is_anonymous !== false,
      show_results: mostrar,
      closes_at: enquete.closes_at || null,
    })
    .select("id")
    .single();

  if (error || !nova) throw new Error(`Falha ao salvar a enquete: ${error?.message}`);

  const { error: erroOpcoes } = await supabase.from("feed_poll_options").insert(
    opcoes.map((label, i) => ({ poll_id: nova.id, position: i, label }))
  );
  if (erroOpcoes) throw new Error(`Falha ao salvar as opções: ${erroOpcoes.message}`);

  return { opcoes: opcoes.length, votosApagados };
}
