/**
 * Formulario de pedido — o que transforma clique em algo cobravel.
 *
 * "Solicitar Contato" e "Solicitar Amostra" eram, ate aqui, cliques
 * contados. Clique ninguem cobra; pedido com nome, telefone e origem, sim.
 * E o unico caminho pelo qual "Conversoes" no painel deixa de ser zero.
 *
 * Os campos vem preenchidos do perfil. O profissional esta na obra, com a
 * mao suja, e nao vai digitar telefone de novo — se tiver que digitar, nao
 * pede. Editar continua possivel porque o telefone do cadastro nem sempre e
 * o que ele quer que o fabricante ligue.
 */

import React, { useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  ScrollView, KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

export type TipoPedido =
  | 'contato' | 'amostra' | 'orcamento' | 'revendedor'
  | 'cupom' | 'treinamento' | 'outro';

/** O tipo de botao decide o texto da tela — "amostra" e "contato" pedem coisas diferentes. */
const TEXTOS: Record<TipoPedido, { titulo: string; explicacao: string; botao: string }> = {
  contato:     { titulo: 'Solicitar contato',   explicacao: 'O fabricante entra em contato com você.', botao: 'Enviar pedido' },
  amostra:     { titulo: 'Solicitar amostra',   explicacao: 'Confirme onde você quer receber a amostra.', botao: 'Pedir amostra' },
  orcamento:   { titulo: 'Solicitar orçamento', explicacao: 'Conte o que você precisa orçar.', botao: 'Pedir orçamento' },
  revendedor:  { titulo: 'Encontrar revendedor', explicacao: 'Informamos o revendedor mais próximo de você.', botao: 'Procurar' },
  cupom:       { titulo: 'Resgatar cupom',      explicacao: 'Confirme seus dados para receber o cupom.', botao: 'Resgatar' },
  treinamento: { titulo: 'Participar do treinamento', explicacao: 'Confirme sua inscrição.', botao: 'Inscrever-me' },
  outro:       { titulo: 'Enviar pedido',       explicacao: 'Confirme seus dados.', botao: 'Enviar' },
};

interface Props {
  visivel: boolean;
  tipo: TipoPedido;
  tituloDaPublicacao: string;
  perfil: { nome?: string | null; email?: string | null; telefone?: string | null };
  aoFechar: () => void;
  aoEnviar: (dados: { name: string; email: string; phone: string; message: string }) => Promise<void>;
}

export function FeedPedido({
  visivel, tipo, tituloDaPublicacao, perfil, aoFechar, aoEnviar,
}: Props) {
  const t = TEXTOS[tipo] ?? TEXTOS.outro;
  const [nome, setNome] = useState(perfil.nome ?? '');
  const [email, setEmail] = useState(perfil.email ?? '');
  const [telefone, setTelefone] = useState(perfil.telefone ?? '');
  const [mensagem, setMensagem] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  const enviar = async () => {
    if (!nome.trim()) {
      setErro('Informe seu nome');
      return;
    }
    // Sem forma de contato o pedido nao serve pra ninguem: o fabricante
    // recebe um nome e nao tem como responder.
    if (!telefone.trim() && !email.trim()) {
      setErro('Informe ao menos um telefone ou e-mail para contato');
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      await aoEnviar({ name: nome.trim(), email: email.trim(), phone: telefone.trim(), message: mensagem.trim() });
      setPronto(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível enviar seu pedido');
    } finally {
      setEnviando(false);
    }
  };

  const fechar = () => {
    setPronto(false);
    setMensagem('');
    setErro(null);
    aoFechar();
  };

  return (
    <Modal visible={visivel} animationType="slide" transparent onRequestClose={fechar}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={estilos.fundo}
      >
        <View style={estilos.folha}>
          <View style={estilos.puxador} />

          {pronto ? (
            <View style={estilos.sucesso}>
              <Ionicons name="checkmark-circle" size={48} color={colors.primary} />
              <Text style={estilos.sucessoTitulo}>Pedido enviado</Text>
              <Text style={estilos.sucessoTexto}>
                {tipo === 'amostra'
                  ? 'O fabricante vai entrar em contato para combinar a entrega da amostra.'
                  : 'Em breve entram em contato com você.'}
              </Text>
              <TouchableOpacity onPress={fechar} style={estilos.botao}>
                <Text style={estilos.botaoTexto}>Fechar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={estilos.cabecalho}>
                <Text style={estilos.titulo}>{t.titulo}</Text>
                <TouchableOpacity onPress={fechar} accessibilityLabel="Fechar">
                  <Ionicons name="close" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              <Text style={estilos.publicacao} numberOfLines={2}>{tituloDaPublicacao}</Text>
              <Text style={estilos.explicacao}>{t.explicacao}</Text>

              <Campo rotulo="Nome" valor={nome} aoMudar={setNome} />
              <Campo rotulo="Telefone" valor={telefone} aoMudar={setTelefone} teclado="phone-pad" />
              <Campo rotulo="E-mail" valor={email} aoMudar={setEmail} teclado="email-address" />
              <Campo
                rotulo={tipo === 'orcamento' ? 'O que você precisa orçar' : 'Observação (opcional)'}
                valor={mensagem}
                aoMudar={setMensagem}
                multilinha
              />

              {erro && <Text style={estilos.erro}>{erro}</Text>}

              <TouchableOpacity
                onPress={enviar}
                disabled={enviando}
                style={[estilos.botao, enviando && { opacity: 0.6 }]}
                accessibilityRole="button"
              >
                {enviando
                  ? <ActivityIndicator size="small" color={colors.background} />
                  : <Text style={estilos.botaoTexto}>{t.botao}</Text>}
              </TouchableOpacity>

              <Text style={estilos.aviso}>
                Seus dados de contato são enviados ao patrocinador desta publicação.
              </Text>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Campo({
  rotulo, valor, aoMudar, teclado, multilinha,
}: {
  rotulo: string; valor: string; aoMudar: (v: string) => void;
  teclado?: 'default' | 'phone-pad' | 'email-address'; multilinha?: boolean;
}) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={estilos.rotulo}>{rotulo}</Text>
      <TextInput
        value={valor}
        onChangeText={aoMudar}
        keyboardType={teclado ?? 'default'}
        autoCapitalize={teclado === 'email-address' ? 'none' : 'sentences'}
        multiline={multilinha}
        placeholderTextColor={colors.textMuted}
        style={[estilos.entrada, multilinha && { height: 80, textAlignVertical: 'top' }]}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  folha: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 20,
    paddingBottom: 28,
    paddingTop: 10,
    maxHeight: '88%',
  },
  puxador: {
    alignSelf: 'center', width: 38, height: 4, borderRadius: 2,
    backgroundColor: colors.borderLight, marginBottom: 12,
  },
  cabecalho: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titulo: { ...typography.h3, color: colors.text },
  publicacao: { ...typography.bodySmBold, color: colors.primary, marginTop: 6 },
  explicacao: { ...typography.bodySm, color: colors.textMuted, marginTop: 4 },
  rotulo: { ...typography.caption, color: colors.textMuted, marginBottom: 4 },
  entrada: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    color: colors.text, backgroundColor: colors.cardAlt,
    ...typography.bodySm,
  },
  botao: {
    backgroundColor: colors.primary, borderRadius: 10,
    paddingVertical: 14, alignItems: 'center', marginTop: 18,
  },
  botaoTexto: { ...typography.bodyBold, color: colors.background },
  erro: { ...typography.caption, color: colors.danger, marginTop: 10 },
  aviso: { ...typography.caption, color: colors.textMuted, marginTop: 12, textAlign: 'center' },
  sucesso: { alignItems: 'center', paddingVertical: 30, gap: 8 },
  sucessoTitulo: { ...typography.h3, color: colors.text },
  sucessoTexto: { ...typography.bodySm, color: colors.textMuted, textAlign: 'center', paddingHorizontal: 20 },
});
