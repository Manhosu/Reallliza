/**
 * Enquete do Feed.
 *
 * O modelo existia desde a migration 064 e o feed ja entregava a enquete
 * montada na consulta — mas nao havia como votar, nem aqui nem no site. Duas
 * das onze categorias pedidas sao Pesquisas e Enquetes, entao a lacuna valia
 * mais do que parecia: perguntar a trezentos instaladores qual cola eles usam
 * e informacao que fabricante compra.
 *
 * Resultado so aparece conforme a configuracao da enquete. `after_vote` e o
 * padrao porque ver o placar antes de responder enviesa a resposta — que e o
 * contrario do que uma pesquisa quer.
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

export interface OpcaoEnquete {
  id: string;
  position: number;
  label: string;
  vote_count: number;
}

export interface EnqueteFeed {
  id: string;
  question: string;
  allow_multiple: boolean;
  is_anonymous: boolean;
  show_results: 'always' | 'after_vote' | 'after_close' | 'never';
  closes_at: string | null;
  total_votes: number;
  unique_voters: number;
  options: OpcaoEnquete[];
  minha_resposta?: string[] | null;
}

interface Props {
  enquete: EnqueteFeed;
  aoVotar: (opcoes: string[]) => Promise<EnqueteFeed | null>;
}

export function FeedEnquete({ enquete, aoVotar }: Props) {
  const [estado, setEstado] = useState(enquete);
  const [escolhidas, setEscolhidas] = useState<string[]>(enquete.minha_resposta ?? []);
  const [enviando, setEnviando] = useState(false);
  const [jaVotou, setJaVotou] = useState((enquete.minha_resposta ?? []).length > 0);
  const [erro, setErro] = useState<string | null>(null);

  const encerrada = Boolean(estado.closes_at && new Date(estado.closes_at) < new Date());

  const mostrarResultado =
    estado.show_results === 'always' ||
    (estado.show_results === 'after_vote' && jaVotou) ||
    (estado.show_results === 'after_close' && encerrada);

  const alternar = (id: string) => {
    if (encerrada) return;
    setErro(null);
    setEscolhidas((atual) =>
      estado.allow_multiple
        ? atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]
        : [id]
    );
  };

  const enviar = async () => {
    if (escolhidas.length === 0 || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      const atualizada = await aoVotar(escolhidas);
      if (atualizada) setEstado({ ...estado, ...atualizada });
      setJaVotou(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Nao foi possivel registrar seu voto');
    } finally {
      setEnviando(false);
    }
  };

  // O total de PESSOAS e o denominador, nao o total de votos: em enquete de
  // multipla escolha somar percentuais sobre votos passa de 100%.
  const base = Math.max(1, estado.unique_voters);

  return (
    <View style={styles.caixa}>
      <View style={styles.cabecalho}>
        <Ionicons name="bar-chart-outline" size={15} color={colors.primary} />
        <Text style={styles.pergunta}>{estado.question}</Text>
      </View>

      {estado.allow_multiple && !jaVotou && !encerrada && (
        <Text style={styles.dica}>Pode marcar mais de uma.</Text>
      )}

      {estado.options
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((o) => {
          const marcada = escolhidas.includes(o.id);
          const pct = mostrarResultado ? Math.round((o.vote_count / base) * 100) : 0;

          return (
            <TouchableOpacity
              key={o.id}
              onPress={() => alternar(o.id)}
              activeOpacity={encerrada ? 1 : 0.7}
              disabled={encerrada}
              style={[styles.opcao, marcada && styles.opcaoMarcada]}
              accessibilityRole={estado.allow_multiple ? 'checkbox' : 'radio'}
              accessibilityState={{ checked: marcada, disabled: encerrada }}
            >
              {mostrarResultado && (
                <View style={[styles.barra, { width: `${Math.min(100, pct)}%` }]} />
              )}
              <View style={styles.linhaOpcao}>
                <Ionicons
                  name={
                    estado.allow_multiple
                      ? marcada ? 'checkbox' : 'square-outline'
                      : marcada ? 'radio-button-on' : 'radio-button-off'
                  }
                  size={16}
                  color={marcada ? colors.primary : colors.textMuted}
                />
                <Text style={[styles.rotulo, marcada && styles.rotuloMarcado]} numberOfLines={2}>
                  {o.label}
                </Text>
                {mostrarResultado && (
                  <Text style={styles.percentual}>{pct}%</Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}

      {erro && <Text style={styles.erro}>{erro}</Text>}

      <View style={styles.rodape}>
        {!encerrada && (
          <TouchableOpacity
            onPress={enviar}
            disabled={escolhidas.length === 0 || enviando}
            style={[
              styles.botao,
              (escolhidas.length === 0 || enviando) && styles.botaoInativo,
            ]}
            accessibilityRole="button"
          >
            {enviando ? (
              <ActivityIndicator size="small" color={colors.background} />
            ) : (
              <Text style={styles.botaoTexto}>{jaVotou ? 'Trocar voto' : 'Votar'}</Text>
            )}
          </TouchableOpacity>
        )}

        <Text style={styles.contagem}>
          {estado.unique_voters === 0
            ? 'Seja o primeiro a responder'
            : `${estado.unique_voters} ${estado.unique_voters === 1 ? 'pessoa respondeu' : 'pessoas responderam'}`}
          {encerrada ? ' · encerrada' : ''}
        </Text>
      </View>

      {estado.is_anonymous && (
        <Text style={styles.anonima}>Sua resposta nao e identificada.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  caixa: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.cardAlt,
    gap: 6,
  },
  cabecalho: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 2 },
  pergunta: { ...typography.bodySmBold, color: colors.text, flex: 1 },
  dica: { ...typography.caption, color: colors.textMuted, marginBottom: 2 },
  opcao: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginTop: 4,
  },
  opcaoMarcada: { borderColor: colors.primary },
  // A barra fica ATRAS do texto, nao ao lado: assim a opcao mantem a mesma
  // altura antes e depois do voto e a lista nao "pula" quando o resultado
  // aparece.
  barra: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    backgroundColor: colors.primary,
    opacity: 0.18,
  },
  linhaOpcao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  rotulo: { ...typography.bodySm, color: colors.text, flex: 1 },
  rotuloMarcado: { color: colors.text, fontWeight: '600' },
  percentual: { ...typography.bodySmBold, color: colors.text, minWidth: 38, textAlign: 'right' },
  rodape: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' },
  botao: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 90,
    alignItems: 'center',
  },
  botaoInativo: { opacity: 0.45 },
  botaoTexto: { ...typography.bodySmBold, color: colors.background },
  contagem: { ...typography.caption, color: colors.textMuted, flex: 1 },
  anonima: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  erro: { ...typography.caption, color: colors.danger, marginTop: 4 },
});
