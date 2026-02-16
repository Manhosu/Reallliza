import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { apiClient } from '../lib/api';
import { Profile } from '../lib/types';

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  fetchProfile: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  profile: null,
  isLoading: false,
  isInitialized: false,
  error: null,

  initialize: async () => {
    try {
      set({ isLoading: true });

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        set({ user: session.user, session });
        // Fetch profile in background
        get().fetchProfile();
      }

      // Listen for auth state changes
      supabase.auth.onAuthStateChange((_event, session) => {
        set({
          user: session?.user ?? null,
          session: session ?? null,
        });

        if (session) {
          get().fetchProfile();
        } else {
          set({ profile: null });
        }
      });
    } catch (error) {
      console.error('Auth initialization error:', error);
    } finally {
      set({ isLoading: false, isInitialized: true });
    }
  },

  signIn: async (email: string, password: string) => {
    try {
      set({ isLoading: true, error: null });

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      set({
        user: data.user,
        session: data.session,
      });

      // Fetch profile after sign in
      await get().fetchProfile();
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'Erro ao fazer login. Tente novamente.';
      set({ error: message });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  signOut: async () => {
    try {
      set({ isLoading: true });
      await supabase.auth.signOut();
      set({
        user: null,
        session: null,
        profile: null,
      });
    } catch (error) {
      console.error('Sign out error:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  fetchProfile: async () => {
    try {
      const profile = await apiClient.get<Profile>('/profile/me');
      set({ profile });
    } catch (error) {
      console.error('Fetch profile error:', error);
    }
  },

  clearError: () => set({ error: null }),
}));
