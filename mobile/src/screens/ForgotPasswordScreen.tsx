import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors } from '../theme/colors';

export default function ForgotPasswordScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleReset = async () => {
    if (!email.trim()) {
      Alert.alert('Erro', 'Insira seu e-mail');
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (error) throw error;
      setSent(true);
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Erro ao enviar e-mail de recuperacao');
    } finally {
      setIsLoading(false);
    }
  };

  if (sent) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Ionicons name="mail-outline" size={64} color={colors.primary} />
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: 'bold', marginTop: 16, textAlign: 'center' }}>
            E-mail enviado!
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 8, textAlign: 'center' }}>
            Verifique sua caixa de entrada para redefinir sua senha.
          </Text>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{
              marginTop: 24,
              backgroundColor: colors.primary,
              paddingHorizontal: 24,
              paddingVertical: 12,
              borderRadius: 12,
            }}
          >
            <Text style={{ color: colors.background, fontWeight: '600' }}>Voltar ao Login</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, padding: 24 }}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: 24 }}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>

          <Text style={{ color: colors.text, fontSize: 24, fontWeight: 'bold' }}>
            Esqueceu sua senha?
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 8, marginBottom: 32 }}>
            Insira seu e-mail e enviaremos um link para redefinir sua senha.
          </Text>

          <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase' }}>
            E-mail
          </Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="seu@email.com"
            placeholderTextColor={colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            style={{
              backgroundColor: colors.card,
              borderRadius: 12,
              padding: 16,
              color: colors.text,
              fontSize: 16,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          />

          <TouchableOpacity
            onPress={handleReset}
            disabled={isLoading}
            style={{
              marginTop: 24,
              backgroundColor: colors.primary,
              paddingVertical: 16,
              borderRadius: 12,
              alignItems: 'center',
              opacity: isLoading ? 0.7 : 1,
            }}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <Text style={{ color: colors.background, fontSize: 16, fontWeight: '600' }}>
                Enviar link de recuperacao
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
