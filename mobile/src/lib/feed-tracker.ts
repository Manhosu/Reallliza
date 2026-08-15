import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import { apiClient } from './api';

/**
 * Coleta de métricas do feed.
 *
 * Acumula em memória e envia em lote. Um evento por requisição faria um
 * técnico rolando o feed gerar trinta chamadas em vinte segundos, cada uma
 * pagando autenticação — que consulta sessão e perfil.
 *
 * Cada evento leva um identificador próprio, então reenvio depois de falha
 * de rede não duplica a contagem no servidor.
 *
 * O espelho em disco existe para o técnico que fica sem sinal em obra: os
 * eventos sobrevivem ao fechamento do aplicativo. Com teto — sem ele, dias
 * offline encheriam o armazenamento local e travariam o app.
 */

const CHAVE = 'reallliza:feed-eventos';
const TETO_BUFFER = 300;
const INTERVALO_MS = 10_000;
const LOTE_MAXIMO = 200;

export type TipoEvento =
  | 'impression' | 'view' | 'video_start' | 'video_q25' | 'video_q50'
  | 'video_q75' | 'video_complete' | 'video_watch' | 'click' | 'download'
  | 'poll_vote' | 'expand' | 'carousel_swipe' | 'link_open';

interface Evento {
  client_event_id: string;
  post_id: string;
  event_type: TipoEvento;
  media_id?: string | null;
  cta_id?: string | null;
  session_id: string;
  value_num?: number | null;
  occurred_at: string;
  platform: string;
  app_version?: string | null;
}

function uuid(): string {
  // Sem dependência nova: o formato só precisa ser único, não criptográfico.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

class FeedTracker {
  private buffer: Evento[] = [];
  private sessao = uuid();
  private timer: ReturnType<typeof setInterval> | null = null;
  // Impressão é contada uma vez por publicação por sessão: subir e descer o
  // feed não pode virar quatro impressões da mesma coisa.
  private jaContado = new Set<string>();
  private enviando = false;

  async iniciar() {
    if (this.timer) return;
    await this.restaurar();

    this.timer = setInterval(() => this.enviar(), INTERVALO_MS);

    AppState.addEventListener('change', (estado) => {
      if (estado === 'background' || estado === 'inactive') {
        this.enviar();
        this.persistir();
      }
    });
  }

  parar() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.enviar();
  }

  /** Nova sessão a cada entrada no feed — é o que delimita a deduplicação. */
  novaSessao() {
    this.sessao = uuid();
    this.jaContado.clear();
  }

  registrar(
    tipo: TipoEvento,
    postId: string,
    extras?: { media_id?: string; cta_id?: string; value_num?: number }
  ) {
    if (tipo === 'impression' || tipo === 'view') {
      const chave = `${tipo}:${postId}`;
      if (this.jaContado.has(chave)) return;
      this.jaContado.add(chave);
    }

    this.buffer.push({
      client_event_id: uuid(),
      post_id: postId,
      event_type: tipo,
      media_id: extras?.media_id ?? null,
      cta_id: extras?.cta_id ?? null,
      session_id: this.sessao,
      value_num: extras?.value_num ?? null,
      occurred_at: new Date().toISOString(),
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      app_version: Constants.expoConfig?.version ?? null,
    });

    // Descarta o mais antigo ao estourar: métrica velha vale menos que um
    // aplicativo que continua funcionando.
    if (this.buffer.length > TETO_BUFFER) {
      this.buffer.splice(0, this.buffer.length - TETO_BUFFER);
    }
    if (this.buffer.length >= 25) this.enviar();
  }

  private async enviar() {
    if (this.enviando || this.buffer.length === 0) return;
    this.enviando = true;

    const lote = this.buffer.slice(0, LOTE_MAXIMO);
    try {
      await apiClient.post('/feed/events', { events: lote });
      this.buffer = this.buffer.slice(lote.length);
      await this.persistir();
    } catch {
      // Mantém no buffer para a próxima tentativa. Métrica não pode
      // atrapalhar quem está usando o aplicativo.
    } finally {
      this.enviando = false;
    }
  }

  private async persistir() {
    try {
      await AsyncStorage.setItem(CHAVE, JSON.stringify(this.buffer.slice(-TETO_BUFFER)));
    } catch {
      /* cota cheia: ignorar */
    }
  }

  private async restaurar() {
    try {
      const cru = await AsyncStorage.getItem(CHAVE);
      if (cru) {
        const lista = JSON.parse(cru);
        if (Array.isArray(lista)) this.buffer = lista.slice(-TETO_BUFFER);
      }
    } catch {
      /* ignora */
    }
  }
}

export const feedTracker = new FeedTracker();
