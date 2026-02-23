import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore } from '../stores/auth-store';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import type { AuthStackParamList } from '../navigation/auth-stack';

type NavigationProp = NativeStackNavigationProp<AuthStackParamList>;

export function LoginScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { signIn, isLoading, error, clearError } = useAuthStore();

  const handleLogin = async () => {
    if (!email.trim()) {
      Alert.alert('Erro', 'Informe seu e-mail.');
      return;
    }
    if (!password) {
      Alert.alert('Erro', 'Informe sua senha.');
      return;
    }

    try {
      clearError();
      await signIn(email.trim().toLowerCase(), password);
    } catch {
      // Error is handled in the store
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
        {/* Logo / Brand */}
        <View style={styles.brandSection}>
          <View style={styles.logoContainer}>
            <Text style={styles.logoLetter}>R</Text>
          </View>
          <Text style={styles.brandName}>Reallliza</Text>
          <Text style={styles.brandSubtitle}>Revestimentos</Text>
          <Text style={styles.brandDescription}>
            Area do Tecnico
          </Text>
        </View>

        {/* Login Form */}
        <View style={styles.formSection}>
          {error && (
            <View style={styles.errorContainer}>
              <Ionicons
                name="alert-circle"
                size={20}
                color={colors.danger}
              />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>E-mail</Text>
            <View style={styles.inputContainer}>
              <Ionicons
                name="mail-outline"
                size={20}
                color={colors.textDark}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="seu@email.com"
                placeholderTextColor={colors.textDark}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isLoading}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Senha</Text>
            <View style={styles.inputContainer}>
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color={colors.textDark}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Sua senha"
                placeholderTextColor={colors.textDark}
                secureTextEntry={!showPassword}
                editable={!isLoading}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeButton}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={colors.textDark}
                />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.loginButton, isLoading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.black} size="small" />
            ) : (
              <Text style={styles.loginButtonText}>Entrar</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation.navigate('ForgotPassword')}
            style={styles.forgotPasswordButton}
          >
            <Text style={styles.forgotPasswordText}>Esqueci minha senha</Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Reallliza Revestimentos v1.0.0
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  brandSection: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoContainer: {
    width: 88,
    height: 88,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  logoLetter: {
    fontSize: 48,
    fontWeight: '900',
    color: colors.black,
    letterSpacing: -1,
  },
  brandName: {
    ...typography.h1,
    color: colors.primary,
    letterSpacing: 1,
  },
  brandSubtitle: {
    ...typography.h4,
    color: colors.textSecondary,
    marginTop: 2,
  },
  brandDescription: {
    ...typography.bodySm,
    color: colors.textMuted,
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  formSection: {
    gap: 16,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.danger + '15',
    borderColor: colors.danger + '30',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  errorText: {
    ...typography.bodySm,
    color: colors.danger,
    flex: 1,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    ...typography.bodySmBold,
    color: colors.textSecondary,
    marginLeft: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    height: 52,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    height: '100%',
  },
  eyeButton: {
    padding: 4,
    marginLeft: 8,
  },
  loginButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    ...typography.button,
    color: colors.black,
  },
  forgotPasswordButton: {
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 8,
  },
  forgotPasswordText: {
    ...typography.bodySm,
    color: colors.primary,
  },
  footer: {
    alignItems: 'center',
    marginTop: 48,
  },
  footerText: {
    ...typography.caption,
    color: colors.textDark,
  },
});
