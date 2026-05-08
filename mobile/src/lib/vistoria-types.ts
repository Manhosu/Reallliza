// Tipos espelhados do Garantias (lib/supabase/database.types.ts).
// Mantenha sincronizado quando o schema da vistoria mudar.

export type VistoriaPatologiaTipo =
  | 'CONDICOES_AMBIENTAIS'
  | 'CANOAMENTO'
  | 'CLIQUE_QUEBRADO'
  | 'REBARBA_EXTREMIDADE'
  | 'PECAS_LEVANTANDO'
  | 'DESLOCAMENTO_CAPA_PROTETORA';

export type LadoChave = 'a' | 'b' | 'c' | 'd';

export interface EspacamentoPerimetral {
  a: number | null;
  b: number | null;
  c: number | null;
  d: number | null;
  descricoes?: Partial<Record<LadoChave, string>>;
}

export interface VistoriaPatologia {
  id: string;
  tipo: VistoriaPatologiaTipo;
  descricao_tecnica: string;
  descricao_patologias: string;
  exposicao_solar?: { sim: boolean; periodo: 'MANHA' | 'TARDE' | 'INTEGRAL' | null };
  direcao?: 'TRANSVERSAL' | 'LONGITUDINAL' | null;
}

export interface VistoriaAmbiente {
  id: string;
  nome: string;
  largura: number;
  comprimento: number;
  tipo_substituicao?: 'COMPLETO' | 'PARCIAL';
  espacamento_longitudinal?: EspacamentoPerimetral;
  espacamento_transversal?: EspacamentoPerimetral;
  temperatura?: {
    minima: number;
    media: number;
    maxima: number;
    descricao_tecnica?: string;
    descricao_patologias?: string;
  };
  patologias?: VistoriaPatologia[];
}

export interface VistoriaData {
  ambientes: VistoriaAmbiente[];
}

export interface PericiaEvidencia {
  id: string;
  ticket_id: string;
  laudo_id: string | null;
  nome_arquivo: string;
  tipo_arquivo: string;
  url: string;
  tipo: string;
  descricao: string | null;
  referencia_item: string | null;
  created_at: string;
}

export const PATOLOGIA_OPTIONS: Array<{
  tipo: VistoriaPatologiaTipo;
  label: string;
  descricao: string;
  temExposicao?: boolean;
  temDirecao?: boolean;
}> = [
  {
    tipo: 'CONDICOES_AMBIENTAIS',
    label: 'Condicoes Ambientais',
    descricao:
      'Exposicao solar direta pode afetar o piso vinilico: perda de cor, expansao, contracao e deterioracao.',
    temExposicao: true,
  },
  {
    tipo: 'CANOAMENTO',
    label: 'Canoamento (empenamento longitudinal)',
    descricao:
      'Verifique desniveis visiveis, espacamento irregular, ruidos e dificuldade na abertura de portas.',
  },
  {
    tipo: 'CLIQUE_QUEBRADO',
    label: 'Clique quebrado',
    descricao: 'Verifique desalinhamento, folgas, movimento ou fissuras nos encaixes.',
  },
  {
    tipo: 'REBARBA_EXTREMIDADE',
    label: 'Rebarba na extremidade de peca',
    descricao: 'Toque, visualizacao, raspe e alinhamento — areas asperas, elevacoes ou irregularidades nas bordas.',
  },
  {
    tipo: 'PECAS_LEVANTANDO',
    label: 'Pecas levantando-se',
    descricao: 'Curvatura (transversal/longitudinal), deslocamento lateral e espacos abertos entre pecas.',
    temDirecao: true,
  },
  {
    tipo: 'DESLOCAMENTO_CAPA_PROTETORA',
    label: 'Deslocamento de capa protetora de fio decorativo',
    descricao: 'Desalinhamento, folgas, danos ou movimento da capa protetora.',
  },
];

export const LADOS: LadoChave[] = ['a', 'b', 'c', 'd'];

export function emptyEspacamento(): EspacamentoPerimetral {
  return { a: null, b: null, c: null, d: null, descricoes: {} };
}

export function emptyTemperatura() {
  return {
    minima: 0,
    media: 0,
    maxima: 0,
    descricao_tecnica: '',
    descricao_patologias: '',
  };
}

export function newAmbiente(): VistoriaAmbiente {
  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    nome: '',
    largura: 0,
    comprimento: 0,
    tipo_substituicao: 'COMPLETO',
    espacamento_longitudinal: emptyEspacamento(),
    espacamento_transversal: emptyEspacamento(),
    temperatura: emptyTemperatura(),
    patologias: [],
  };
}

export function newPatologia(tipo: VistoriaPatologiaTipo): VistoriaPatologia {
  const opt = PATOLOGIA_OPTIONS.find((o) => o.tipo === tipo);
  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    tipo,
    descricao_tecnica: '',
    descricao_patologias: '',
    ...(opt?.temExposicao && { exposicao_solar: { sim: false, periodo: null } }),
    ...(opt?.temDirecao && { direcao: null }),
  };
}
