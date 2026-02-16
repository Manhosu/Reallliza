import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../stores/auth-store';
import { apiClient } from '../lib/api';
import { USER_ROLE_LABELS } from '../lib/types';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

export function ProfileScreen() {
  const { profile, signOut, isLoading, fetchProfile } = useAuthStore();
  const [isEditing, setIsEditing] = useState(false);
  const [phone, setPhone] = useState(profile?.phone || '');
  const [isSaving, setIsSaving] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const handleSavePhone = async () => {
    try {
      setIsSaving(true);
      await apiClient.patch('/profile/me', { phone });
      await fetchProfile();
      setIsEditing(false);
      Alert.alert('Sucesso', 'Telefone atualizado com sucesso.');
    } catch (error) {
      console.error('Error updating phone:', error);
      Alert.alert('Erro', 'Nao foi possivel atualizar o telefone.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('Erro', 'Preencha todos os campos.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Erro', 'As senhas nao conferem.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Erro', 'A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }

    try {
      setIsChangingPassword(true);
      await apiClient.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setShowChangePassword(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Sucesso', 'Senha alterada com sucesso.');
    } catch (error) {
      console.error('Error changing password:', error);
      Alert.alert('Erro', 'Nao foi possivel alterar a senha. Verifique a senha atual.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sair', 'Deseja realmente sair do aplicativo?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: () => signOut(),
      },
    ]);
  };

  const initials = profile?.full_name
    ? profile.full_name
        .split(' ')
        .map(n => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : '??';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
    <ScrollView style={styles.container}>
      {/* Avatar Section */}
      <View style={styles.avatarSection}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.userName}>
          {profile?.full_name || 'Carregando...'}
        </Text>
        <Text style={styles.userEmail}>{profile?.email || ''}</Text>
        {profile?.role && (
          <View style={styles.roleBadge}>
            <Ionicons name="shield-outline" size={14} color={colors.primary} />
            <Text style={styles.roleText}>
              {USER_ROLE_LABELS[profile.role]}
            </Text>
          </View>
        )}
      </View>

      {/* Info Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Informacoes Pessoais</Text>

        <View style={styles.infoCard}>
          {/* Phone */}
          <View style={styles.infoRow}>
            <View style={styles.infoLeft}>
              <Ionicons name="call-outline" size={20} color={colors.textMuted} />
              <View>
                <Text style={styles.infoLabel}>Telefone</Text>
                {isEditing ? (
                  <TextInput
                    style={styles.phoneInput}
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="(00) 00000-0000"
                    placeholderTextColor={colors.textDark}
                    keyboardType="phone-pad"
                  />
                ) : (
                  <Text style={styles.infoValue}>
                    {profile?.phone || 'Nao informado'}
                  </Text>
                )}
              </View>
            </View>

            {isEditing ? (
              <View style={styles.editActions}>
                <TouchableOpacity
                  onPress={() => {
                    setIsEditing(false);
                    setPhone(profile?.phone || '');
                  }}
                  style={styles.cancelButton}
                >
                  <Ionicons name="close" size={20} color={colors.danger} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSavePhone}
                  style={styles.saveIconButton}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color={colors.success} />
                  ) : (
                    <Ionicons
                      name="checkmark"
                      size={20}
                      color={colors.success}
                    />
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => setIsEditing(true)}>
                <Ionicons
                  name="create-outline"
                  size={20}
                  color={colors.primary}
                />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.infoDivider} />

          {/* CPF */}
          <View style={styles.infoRow}>
            <View style={styles.infoLeft}>
              <Ionicons
                name="card-outline"
                size={20}
                color={colors.textMuted}
              />
              <View>
                <Text style={styles.infoLabel}>CPF</Text>
                <Text style={styles.infoValue}>
                  {profile?.cpf || 'Nao informado'}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.infoDivider} />

          {/* Address */}
          <View style={styles.infoRow}>
            <View style={styles.infoLeft}>
              <Ionicons
                name="location-outline"
                size={20}
                color={colors.textMuted}
              />
              <View>
                <Text style={styles.infoLabel}>Endereco</Text>
                <Text style={styles.infoValue}>
                  {profile?.address || 'Nao informado'}
                </Text>
              </View>
            </View>
          </View>

          {profile?.specialties && profile.specialties.length > 0 && (
            <>
              <View style={styles.infoDivider} />
              <View style={styles.infoRow}>
                <View style={styles.infoLeft}>
                  <Ionicons
                    name="construct-outline"
                    size={20}
                    color={colors.textMuted}
                  />
                  <View>
                    <Text style={styles.infoLabel}>Especialidades</Text>
                    <Text style={styles.infoValue}>
                      {profile.specialties.join(', ')}
                    </Text>
                  </View>
                </View>
              </View>
            </>
          )}
        </View>
      </View>

      {/* Change Password Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Seguranca</Text>
        <View style={styles.infoCard}>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => setShowChangePassword(!showChangePassword)}
          >
            <View style={styles.menuItemLeft}>
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color={colors.textMuted}
              />
              <Text style={styles.menuItemText}>Alterar Senha</Text>
            </View>
            <Ionicons
              name={showChangePassword ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={colors.textDark}
            />
          </TouchableOpacity>

          {showChangePassword && (
            <View style={styles.passwordForm}>
              <TextInput
                style={styles.passwordInput}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                placeholder="Senha atual"
                placeholderTextColor={colors.textDark}
                secureTextEntry
              />
              <TextInput
                style={styles.passwordInput}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Nova senha"
                placeholderTextColor={colors.textDark}
                secureTextEntry
              />
              <TextInput
                style={styles.passwordInput}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirmar nova senha"
                placeholderTextColor={colors.textDark}
                secureTextEntry
              />
              <TouchableOpacity
                style={styles.changePasswordButton}
                onPress={handleChangePassword}
                disabled={isChangingPassword}
              >
                {isChangingPassword ? (
                  <ActivityIndicator size="small" color={colors.black} />
                ) : (
                  <Text style={styles.changePasswordButtonText}>
                    Alterar Senha
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* Sign Out */}
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.signOutButton}
          onPress={handleSignOut}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={colors.danger} />
          ) : (
            <>
              <Ionicons name="log-out-outline" size={20} color={colors.danger} />
              <Text style={styles.signOutText}>Sair do Aplicativo</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.versionInfo}>
        <Text style={styles.versionText}>
          Reallliza Revestimentos v1.0.0
        </Text>
      </View>

      <View style={styles.bottomSpacer} />
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
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 32,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary + '20',
    borderWidth: 3,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    ...typography.h2,
    color: colors.primary,
  },
  userName: {
    ...typography.h3,
    color: colors.text,
  },
  userEmail: {
    ...typography.bodySm,
    color: colors.textMuted,
    marginTop: 2,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: colors.primary + '15',
  },
  roleText: {
    ...typography.captionBold,
    color: colors.primary,
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  sectionTitle: {
    ...typography.bodyBold,
    color: colors.textSecondary,
    marginBottom: 10,
    marginLeft: 4,
  },
  infoCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  infoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  infoLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  infoValue: {
    ...typography.bodySm,
    color: colors.text,
    marginTop: 2,
  },
  infoDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 46,
  },
  phoneInput: {
    ...typography.bodySm,
    color: colors.text,
    backgroundColor: colors.background,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 4,
    minWidth: 150,
  },
  editActions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    padding: 4,
  },
  saveIconButton: {
    padding: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuItemText: {
    ...typography.bodySm,
    color: colors.text,
  },
  passwordForm: {
    padding: 14,
    paddingTop: 0,
    gap: 10,
  },
  passwordInput: {
    backgroundColor: colors.background,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...typography.bodySm,
    color: colors.text,
  },
  changePasswordButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  changePasswordButtonText: {
    ...typography.buttonSm,
    color: colors.black,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.danger + '30',
    paddingVertical: 14,
  },
  signOutText: {
    ...typography.button,
    color: colors.danger,
  },
  versionInfo: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  versionText: {
    ...typography.caption,
    color: colors.textDark,
  },
  bottomSpacer: {
    height: 32,
  },
});
