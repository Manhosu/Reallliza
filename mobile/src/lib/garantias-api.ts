import { Platform } from 'react-native';
import type { VistoriaData, PericiaEvidencia } from './vistoria-types';

// Cliente do Garantias — usado apenas para a perícia/vistoria técnica,
// que é domínio do sistema de Garantias. O fluxo operacional de OS, o
// perfil e os níveis ficam 100% na Execução (ver src/lib/api.ts).

const getDefaultGarantiasUrl = () => {
  if (Platform.OS === 'android') return 'http://10.0.2.2:3001';
  return 'http://localhost:3001';
};

export const GARANTIAS_BASE_URL =
  process.env.EXPO_PUBLIC_GARANTIAS_URL || getDefaultGarantiasUrl();
export const GARANTIAS_API_KEY = process.env.EXPO_PUBLIC_GARANTIAS_API_KEY || '';

export interface GarantiasTicket {
  id: string;
  protocolo: string;
  status: string;
  cliente_nome: string;
  cliente_telefone: string;
  endereco_obra: string | null;
  produto: string | null;
  descricao_problema: string | null;
  periciador_id: string | null;
}

export interface GarantiasLaudo {
  id: string;
  ticket_id: string;
  periciador_id: string;
  vistoria: VistoriaData | null;
  vistoria_finalizada_at: string | null;
}

export interface GetVistoriaResponse {
  ticket: GarantiasTicket;
  laudo: GarantiasLaudo | null;
  evidencias: PericiaEvidencia[];
}

class GarantiasApiError extends Error {
  status: number;
  details: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'GarantiasApiError';
    this.status = status;
    this.details = details;
  }
}

async function parseResponse<T>(res: Response): Promise<T> {
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    if (!res.ok) throw new GarantiasApiError(res.status, res.statusText);
    return undefined as unknown as T;
  }
  if (!res.ok) {
    const body = data as Record<string, unknown> | undefined;
    const msg = (body?.error as string) || (body?.message as string) || res.statusText;
    throw new GarantiasApiError(res.status, msg, body);
  }
  return data as T;
}

function authHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-API-Key': GARANTIAS_API_KEY,
  };
}

export async function fetchVistoria(opts: {
  ticketId?: string;
  protocol?: string;
}): Promise<GetVistoriaResponse> {
  const qs = new URLSearchParams();
  if (opts.ticketId) qs.set('ticket_id', opts.ticketId);
  else if (opts.protocol) qs.set('ticket_protocol', opts.protocol);

  const url = `${GARANTIAS_BASE_URL}/api/external/vistoria?${qs.toString()}`;
  const res = await fetch(url, { headers: authHeaders() });
  return parseResponse<GetVistoriaResponse>(res);
}

export async function saveVistoriaRemote(opts: {
  ticketId: string;
  vistoria: VistoriaData;
  finalizar?: boolean;
}): Promise<{ success: boolean; laudo_id: string; finalizada: boolean }> {
  const res = await fetch(`${GARANTIAS_BASE_URL}/api/external/vistoria`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      ticket_id: opts.ticketId,
      vistoria: opts.vistoria,
      finalizar: !!opts.finalizar,
    }),
  });
  return parseResponse<{ success: boolean; laudo_id: string; finalizada: boolean }>(res);
}

export async function uploadEvidenciaRemote(opts: {
  ticketId: string;
  referenciaItem: string;
  file: { uri: string; name: string; type: string };
  descricao?: string;
  tipo?: 'FOTO' | 'VIDEO' | 'DOCUMENTO';
}): Promise<{ success: boolean; evidencia: PericiaEvidencia; url: string }> {
  const form = new FormData();
  form.append('ticket_id', opts.ticketId);
  form.append('referencia_item', opts.referenciaItem);
  if (opts.descricao) form.append('descricao', opts.descricao);
  form.append('tipo', opts.tipo || 'FOTO');
  form.append('file', {
    uri: opts.file.uri,
    type: opts.file.type,
    name: opts.file.name,
  } as unknown as Blob);

  const res = await fetch(`${GARANTIAS_BASE_URL}/api/external/vistoria/evidencia`, {
    method: 'POST',
    headers: { 'X-API-Key': GARANTIAS_API_KEY },
    body: form,
  });
  return parseResponse<{ success: boolean; evidencia: PericiaEvidencia; url: string }>(res);
}
