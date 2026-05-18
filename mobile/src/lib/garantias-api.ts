import { Platform } from 'react-native';
import type { VistoriaData, PericiaEvidencia } from './vistoria-types';

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

// ============================================================
// MARCO 5 — Ecossistema Operacional
// Endpoints /api/external/mobile/* do Garantias. O técnico é
// identificado pelo e-mail (mesmo do login). API key no header.
// ============================================================

export interface EcossistemaEspecialidade {
  id: string;
  nivel: number;
  especialidade: { id: string; nome: string } | null;
}
export interface EcossistemaPerfil {
  id: string;
  full_name: string;
  role: string;
  nivel: 'BRONZE' | 'PRATA' | 'OURO';
  avatar_url: string | null;
  cpf: string | null;
  phone: string | null;
  endereco_base: string | null;
  especialidades: EcossistemaEspecialidade[];
  avaliacoes_internas: { total: number; media: number };
  avaliacao_cliente: { total: number; media: number };
  certificacoes: { id: string; codigo: string; curso_nome: string | null; emitido_at: string }[];
}

export interface PropostaOS {
  id: string;
  status: string;
  score: number;
  ofertada_at: string;
  os: {
    id: string;
    numero: string;
    cliente_nome: string;
    endereco: string | null;
    valor_repasse_total: number;
    status: string;
    data_prevista: string | null;
  } | null;
}

export interface OsEtapaMobile {
  id: string;
  nome: string;
  ordem: number;
  status: 'PENDENTE' | 'EM_ANDAMENTO' | 'CONCLUIDA';
  foto_inicio_url: string | null;
  foto_fim_url: string | null;
  iniciada_at: string | null;
  concluida_at: string | null;
}
export interface OsDetalheMobile {
  id: string;
  numero: string;
  status: string;
  cliente_nome: string;
  cliente_telefone: string | null;
  endereco: string | null;
  endereco_lat: number | null;
  endereco_lng: number | null;
  valor_repasse_total: number;
  data_prevista: string | null;
  assinatura_cliente_url: string | null;
  itens: { id: string; descricao: string | null; quantidade: number; valor_repasse_unit: number }[];
  etapas: OsEtapaMobile[];
  eventos: { id: string; tipo: string; descricao: string | null; created_at: string }[];
}

/** Perfil profissional completo do técnico (nível, especialidades, avaliações). */
export async function fetchEcossistemaPerfil(email: string): Promise<EcossistemaPerfil> {
  const url = `${GARANTIAS_BASE_URL}/api/external/mobile/perfil?email=${encodeURIComponent(email)}`;
  const res = await fetch(url, { headers: authHeaders() });
  return parseResponse<EcossistemaPerfil>(res);
}

/** Propostas de OS ofertadas ao técnico. */
export async function fetchPropostasOS(email: string): Promise<PropostaOS[]> {
  const url = `${GARANTIAS_BASE_URL}/api/external/mobile/propostas?email=${encodeURIComponent(email)}`;
  const res = await fetch(url, { headers: authHeaders() });
  return parseResponse<PropostaOS[]>(res);
}

/** Detalhe de uma OS para o técnico. */
export async function fetchOsDetalhe(email: string, osId: string): Promise<OsDetalheMobile> {
  const url = `${GARANTIAS_BASE_URL}/api/external/mobile/os/${osId}?email=${encodeURIComponent(email)}`;
  const res = await fetch(url, { headers: authHeaders() });
  return parseResponse<OsDetalheMobile>(res);
}

/** Técnico aceita uma OS ofertada. */
export async function aceitarOS(email: string, osId: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${GARANTIAS_BASE_URL}/api/external/mobile/os/${osId}/aceitar`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ email }),
  });
  return parseResponse<{ ok: boolean }>(res);
}

/** Atualiza uma etapa da OS (início/fim + foto de evidência). */
export async function atualizarEtapaOS(opts: {
  email: string;
  osId: string;
  etapaId: string;
  status?: 'EM_ANDAMENTO' | 'CONCLUIDA';
  fotoInicioUrl?: string;
  fotoFimUrl?: string;
}): Promise<OsEtapaMobile> {
  const res = await fetch(`${GARANTIAS_BASE_URL}/api/external/mobile/os/${opts.osId}/etapa`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      email: opts.email,
      etapa_id: opts.etapaId,
      status: opts.status,
      foto_inicio_url: opts.fotoInicioUrl,
      foto_fim_url: opts.fotoFimUrl,
    }),
  });
  return parseResponse<OsEtapaMobile>(res);
}

/** Conclui a OS — exige a assinatura do cliente (gate). */
export async function concluirOS(opts: {
  email: string;
  osId: string;
  assinaturaClienteUrl: string;
}): Promise<{ ok: boolean }> {
  const res = await fetch(`${GARANTIAS_BASE_URL}/api/external/mobile/os/${opts.osId}/concluir`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      email: opts.email,
      assinatura_cliente_url: opts.assinaturaClienteUrl,
    }),
  });
  return parseResponse<{ ok: boolean }>(res);
}

export interface MinhaOS {
  id: string;
  numero: string;
  status: string;
  cliente_nome: string;
  endereco: string | null;
  valor_repasse_total: number;
  data_prevista: string | null;
  concluida_at: string | null;
  created_at: string;
}

/** Lista as OS atribuídas ao técnico (aceitas, em execução, concluídas). */
export async function fetchMinhasOS(email: string): Promise<MinhaOS[]> {
  const url = `${GARANTIAS_BASE_URL}/api/external/mobile/minhas-os?email=${encodeURIComponent(email)}`;
  const res = await fetch(url, { headers: authHeaders() });
  return parseResponse<MinhaOS[]>(res);
}

/** Upload de foto da OS (evidência de etapa ou assinatura). Retorna a URL pública. */
export async function uploadFotoOS(opts: {
  email: string;
  osId: string;
  tipo: 'etapa' | 'assinatura';
  file: { uri: string; name: string; type: string };
}): Promise<{ url: string }> {
  const form = new FormData();
  form.append('email', opts.email);
  form.append('tipo', opts.tipo);
  form.append('file', {
    uri: opts.file.uri,
    type: opts.file.type,
    name: opts.file.name,
  } as unknown as Blob);

  const res = await fetch(
    `${GARANTIAS_BASE_URL}/api/external/mobile/os/${opts.osId}/upload`,
    { method: 'POST', headers: { 'X-API-Key': GARANTIAS_API_KEY }, body: form }
  );
  return parseResponse<{ url: string }>(res);
}

/** Upload da foto de perfil do técnico. Vira a avatar_url no Garantias. */
export async function uploadFotoPerfil(opts: {
  email: string;
  file: { uri: string; name: string; type: string };
}): Promise<{ url: string }> {
  const form = new FormData();
  form.append('email', opts.email);
  form.append('file', {
    uri: opts.file.uri,
    type: opts.file.type,
    name: opts.file.name,
  } as unknown as Blob);

  const res = await fetch(`${GARANTIAS_BASE_URL}/api/external/mobile/perfil/foto`, {
    method: 'POST',
    headers: { 'X-API-Key': GARANTIAS_API_KEY },
    body: form,
  });
  return parseResponse<{ url: string }>(res);
}
