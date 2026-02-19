import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../lib/api';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

// ============================================================
// Types
// ============================================================

interface TermsScreenProps {
  onAccepted: () => void;
}

// ============================================================
// Component
// ============================================================

export function TermsScreen({ onAccepted }: TermsScreenProps) {
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [locationConsent, setLocationConsent] = useState(false);
  const [imageConsent, setImageConsent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const allChecked = termsAccepted && locationConsent && imageConsent;

  const handleAccept = async () => {
    if (!allChecked) return;

    try {
      setIsSubmitting(true);

      await apiClient.post('/auth/accept-terms', {
        terms_version: '1.0',
        location_consent: locationConsent,
        image_consent: imageConsent,
      });

      onAccepted();
    } catch (error) {
      console.error('Error accepting terms:', error);
      Alert.alert(
        'Erro',
        'Nao foi possivel aceitar os termos. Tente novamente.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Ionicons name="document-text-outline" size={40} color={colors.primary} />
          <Text style={styles.headerTitle}>Termos de Uso</Text>
          <Text style={styles.headerSubtitle}>
            Para continuar utilizando o aplicativo, leia e aceite os termos abaixo.
          </Text>
        </View>

        {/* Terms Text */}
        <ScrollView
          style={styles.termsScroll}
          contentContainerStyle={styles.termsContent}
          showsVerticalScrollIndicator={true}
        >
          <Text style={styles.termsTitle}>
            Termos de Uso e Politica de Privacidade
          </Text>

          <Text style={styles.termsText}>
            Ao utilizar o aplicativo Reallliza Revestimentos, voce concorda com os
            seguintes termos e condicoes:
          </Text>

          <Text style={styles.termsSectionTitle}>1. Uso do Aplicativo</Text>
          <Text style={styles.termsText}>
            Este aplicativo e destinado exclusivamente para uso profissional por
            tecnicos e parceiros da Reallliza Revestimentos. O usuario se compromete
            a utilizar o aplicativo de forma responsavel e de acordo com as
            diretrizes da empresa.
          </Text>

          <Text style={styles.termsSectionTitle}>2. Coleta de Dados</Text>
          <Text style={styles.termsText}>
            O aplicativo coleta dados necessarios para a execucao dos servicos,
            incluindo informacoes de ordens de servico, checklists, fotos e
            localizacao. Esses dados sao utilizados para melhorar a qualidade dos
            servicos e garantir a rastreabilidade das operacoes.
          </Text>

          <Text style={styles.termsSectionTitle}>3. Localizacao</Text>
          <Text style={styles.termsText}>
            O aplicativo pode coletar dados de localizacao em segundo plano durante
            o deslocamento ate o local de servico. Essa informacao e utilizada
            para rastreamento de rotas e otimizacao de atendimentos. Voce pode
            autorizar ou negar essa permissao.
          </Text>

          <Text style={styles.termsSectionTitle}>4. Imagens</Text>
          <Text style={styles.termsText}>
            Fotos tiradas durante a execucao dos servicos poderao ser armazenadas
            e utilizadas para fins de documentacao, controle de qualidade e
            comprovacao de servicos realizados.
          </Text>

          <Text style={styles.termsSectionTitle}>5. Seguranca</Text>
          <Text style={styles.termsText}>
            Nos empregamos medidas de seguranca adequadas para proteger seus dados
            pessoais. O acesso ao aplicativo e protegido por autenticacao e os dados
            sao transmitidos de forma criptografada.
          </Text>

          <Text style={styles.termsSectionTitle}>6. Responsabilidades</Text>
          <Text style={styles.termsText}>
            O usuario e responsavel por manter suas credenciais de acesso em sigilo
            e por todas as atividades realizadas com sua conta. Em caso de uso nao
            autorizado, comunique imediatamente a administracao.
          </Text>
        </ScrollView>

        {/* Consent Checkboxes */}
        <View style={styles.checkboxSection}>
          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setTermsAccepted(!termsAccepted)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={termsAccepted ? 'checkbox' : 'square-outline'}
              size={24}
              color={termsAccepted ? colors.primary : colors.textMuted}
            />
            <Text style={styles.checkboxLabel}>
              Li e aceito os Termos de Uso e Politica de Privacidade
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setLocationConsent(!locationConsent)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={locationConsent ? 'checkbox' : 'square-outline'}
              size={24}
              color={locationConsent ? colors.primary : colors.textMuted}
            />
            <Text style={styles.checkboxLabel}>
              Autorizo a coleta de dados de localizacao durante o uso do app
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setImageConsent(!imageConsent)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={imageConsent ? 'checkbox' : 'square-outline'}
              size={24}
              color={imageConsent ? colors.primary : colors.textMuted}
            />
            <Text style={styles.checkboxLabel}>
              Autorizo o uso das imagens capturadas durante os servicos
            </Text>
          </TouchableOpacity>
        </View>

        {/* Accept Button */}
        <TouchableOpacity
          style={[
            styles.acceptButton,
            !allChecked && styles.acceptButtonDisabled,
          ]}
          onPress={handleAccept}
          disabled={!allChecked || isSubmitting}
          activeOpacity={0.7}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color={colors.black} />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color={colors.black} />
              <Text style={styles.acceptButtonText}>Aceitar e Continuar</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ============================================================
// Styles
// ============================================================

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 16,
  },
  header: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 16,
  },
  headerTitle: {
    ...typography.h2,
    color: colors.text,
    marginTop: 12,
  },
  headerSubtitle: {
    ...typography.bodySm,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 16,
  },
  termsScroll: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  termsContent: {
    padding: 16,
  },
  termsTitle: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: 12,
  },
  termsSectionTitle: {
    ...typography.bodySmBold,
    color: colors.text,
    marginTop: 16,
    marginBottom: 6,
  },
  termsText: {
    ...typography.bodySm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  checkboxSection: {
    gap: 12,
    marginBottom: 16,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  checkboxLabel: {
    ...typography.bodySm,
    color: colors.text,
    flex: 1,
  },
  acceptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  acceptButtonDisabled: {
    backgroundColor: colors.borderLight,
  },
  acceptButtonText: {
    ...typography.button,
    color: colors.black,
  },
});
