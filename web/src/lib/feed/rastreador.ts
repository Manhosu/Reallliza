import { apiClient } from "@/lib/api/client";

/**
 * Medição do feed lido pelo navegador.
 *
 * O aplicativo tinha rastreador desde o primeiro dia; a web não tinha nenhum.
 * Na prática, tudo que administrador, técnico e parceiro liam pelo site era
 * invisível: impressão, visualização, clique e download valiam zero, e o
 * painel mostrava só a fatia do celular como se fosse o total.
 *
 * O desenho é o mesmo do lado do aplicativo, de propósito — mesma gramática
 * de evento, mesma deduplicação por sessão, mesmo envio em lote. Duas
 * definições de "impressão" dariam dois números, e a discussão de qual está
 * certo nunca termina.
 */

type TipoEvento =
  | "impression" | "view" | "click" | "download" | "link_open"
  | "poll_vote" | "share" | "save" | "carousel_swipe";

interface Evento {
  client_event_id: string;
  session_id: string;
  post_id: string;
  event_type: TipoEvento;
  media_id?: string | null;
  cta_id?: string | null;
  value_num?: number | null;
  occurred_at: string;
  platform: "web";
}

const INTERVALO_MS = 10_000;
const LOTE_MAXIMO = 200;

class RastreadorDoFeed {
  private fila: Evento[] = [];
  private sessao = crypto.randomUUID();
  private timer: ReturnType<typeof setInterval> | null = null;
  private jaContado = new Set<string>();
  private enviando = false;

  iniciar() {
    if (this.timer || typeof window === "undefined") return;
    this.timer = setInterval(() => void this.enviar(), INTERVALO_MS);

    // Fechar a aba é o fim mais comum de uma sessão de leitura. Sem isto, os
    // eventos dos últimos dez segundos morrem com a página.
    window.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void this.enviar();
    });
    window.addEventListener("pagehide", () => void this.enviar());
  }

  parar() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    void this.enviar();
  }

  /** Nova sessão a cada entrada no feed — é o que delimita a deduplicação. */
  novaSessao() {
    this.sessao = crypto.randomUUID();
    this.jaContado.clear();
  }

  registrar(
    tipo: TipoEvento,
    postId: string,
    extras?: { media_id?: string; cta_id?: string; value_num?: number }
  ) {
    // Impressão e visualização contam uma vez por publicação por sessão.
    // Rolar para cima e para baixo não é audiência nova.
    if (tipo === "impression" || tipo === "view") {
      const chave = `${tipo}:${postId}`;
      if (this.jaContado.has(chave)) return;
      this.jaContado.add(chave);
    }

    this.fila.push({
      client_event_id: crypto.randomUUID(),
      session_id: this.sessao,
      post_id: postId,
      event_type: tipo,
      media_id: extras?.media_id ?? null,
      cta_id: extras?.cta_id ?? null,
      value_num: extras?.value_num ?? null,
      occurred_at: new Date().toISOString(),
      platform: "web",
    });

    if (this.fila.length >= LOTE_MAXIMO) void this.enviar();
  }

  private async enviar() {
    if (this.enviando || this.fila.length === 0) return;
    this.enviando = true;

    const lote = this.fila.slice(0, LOTE_MAXIMO);
    try {
      await apiClient.post("/feed/events", { events: lote });
      this.fila = this.fila.slice(lote.length);
    } catch {
      // Falhou: o lote continua na fila para a próxima tentativa. Métrica
      // perdida por rede instável seria métrica que some sem ninguém notar.
    } finally {
      this.enviando = false;
    }
  }
}

export const rastreador = new RastreadorDoFeed();
