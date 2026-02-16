export const colors = {
  // Brand
  primary: '#EAB308',
  primaryDark: '#CA8A04',
  primaryLight: '#FACC15',

  // Background
  background: '#09090B', // zinc-950
  card: '#18181B', // zinc-900
  cardAlt: '#1F1F23',
  border: '#27272A', // zinc-800
  borderLight: '#3F3F46', // zinc-700

  // Text
  text: '#FAFAFA', // zinc-50
  textSecondary: '#D4D4D8', // zinc-300
  textMuted: '#A1A1AA', // zinc-400
  textDark: '#71717A', // zinc-500

  // Status colors
  success: '#22C55E',
  successDark: '#16A34A',
  danger: '#EF4444',
  dangerDark: '#DC2626',
  warning: '#F59E0B',
  warningDark: '#D97706',
  info: '#3B82F6',
  infoDark: '#2563EB',

  // Semantic
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',

  // OS Status colors
  statusDraft: '#71717A',
  statusPending: '#F59E0B',
  statusAssigned: '#3B82F6',
  statusInProgress: '#8B5CF6',
  statusPaused: '#F97316',
  statusCompleted: '#22C55E',
  statusCancelled: '#EF4444',
  statusRejected: '#DC2626',

  // Priority colors
  priorityLow: '#22C55E',
  priorityMedium: '#F59E0B',
  priorityHigh: '#F97316',
  priorityUrgent: '#EF4444',
} as const;

export type ColorName = keyof typeof colors;
