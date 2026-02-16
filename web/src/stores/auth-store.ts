"use client";

import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
import type { Session } from "@supabase/supabase-js";
import type { Profile, UserRole } from "@/lib/types";

interface AuthState {
  user: Profile | null;
  session: Session | null;
  isLoading: boolean;
  isInitialized: boolean;
  signIn: (
    email: string,
    password: string
  ) => Promise<{ error: string | null; role?: UserRole }>;
  signOut: () => Promise<void>;
  setUser: (user: Profile | null) => void;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  isLoading: true,
  isInitialized: false,

  signIn: async (email: string, password: string) => {
    const supabase = createClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { error: error.message };
    }

    if (data.session && data.user) {
      // Fetch profile data
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", data.user.id)
        .single();

      if (profileError) {
        return { error: "Erro ao carregar perfil do usuário." };
      }

      set({
        session: data.session,
        user: profile as Profile,
      });

      return { error: null, role: (profile as Profile).role };
    }

    return { error: "Erro inesperado ao fazer login." };
  },

  signOut: async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    set({ user: null, session: null });
  },

  setUser: (user: Profile | null) => {
    set({ user });
  },

  initialize: async () => {
    if (get().isInitialized) return;

    const supabase = createClient();

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();

        set({
          session,
          user: profile as Profile | null,
          isLoading: false,
          isInitialized: true,
        });
      } else {
        set({ isLoading: false, isInitialized: true });
      }
    } catch {
      set({ isLoading: false, isInitialized: true });
    }

    // Listen for auth state changes
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();

        set({ session, user: profile as Profile | null });
      } else if (event === "SIGNED_OUT") {
        set({ session: null, user: null });
      } else if (event === "TOKEN_REFRESHED" && session) {
        set({ session });
      }
    });
  },
}));
