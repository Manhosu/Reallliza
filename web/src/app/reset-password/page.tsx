"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowLeft, Eye, EyeOff, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

// ============================================================
// Inner form (uses useSearchParams, needs Suspense)
// ============================================================

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [errors, setErrors] = useState<{
    password?: string;
    confirmPassword?: string;
  }>({});

  // Check if user has a valid session (arrived from email link)
  useEffect(() => {
    const supabase = createClient();

    // Supabase will automatically pick up the hash fragments from the reset link
    supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsReady(true);
      }
    });

    // Also check existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setIsReady(true);
      }
    });
  }, [searchParams]);

  const validate = () => {
    const newErrors: { password?: string; confirmPassword?: string } = {};
    if (!password) {
      newErrors.password = "Nova senha e obrigatoria";
    } else if (password.length < 6) {
      newErrors.password = "Senha deve ter pelo menos 6 caracteres";
    }
    if (!confirmPassword) {
      newErrors.confirmPassword = "Confirmacao e obrigatoria";
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = "As senhas nao coincidem";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        toast.error(error.message || "Erro ao redefinir senha.");
        return;
      }

      toast.success("Senha redefinida com sucesso!");
      router.push("/login");
    } catch {
      toast.error("Erro inesperado. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className="w-full max-w-[420px] space-y-8"
    >
      {/* Mobile logo */}
      <div className="flex items-center gap-3 lg:hidden">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-500">
          <span className="text-lg font-bold text-black">R</span>
        </div>
        <span className="text-xl font-semibold">Reallliza</span>
      </div>

      <div className="space-y-2">
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="text-2xl font-bold tracking-tight text-foreground"
        >
          Redefinir senha
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="text-muted-foreground"
        >
          Insira sua nova senha abaixo.
        </motion.p>
      </div>

      {!isReady ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-6"
        >
          <div className="flex flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center">
            <div className="space-y-1">
              <h3 className="text-base font-semibold">Verificando sessao...</h3>
              <p className="text-sm text-muted-foreground">
                Aguarde enquanto validamos seu link de recuperacao.
              </p>
            </div>
          </div>
          <Link
            href="/login"
            className="flex items-center justify-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao login
          </Link>
        </motion.div>
      ) : (
        <motion.form
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          onSubmit={handleSubmit}
          className="space-y-5"
        >
          {/* New password */}
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none text-foreground/80">
              Nova senha
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errors.password)
                    setErrors((p) => ({ ...p, password: undefined }));
                }}
                autoComplete="new-password"
                className={`flex h-11 w-full rounded-xl border border-input bg-background px-4 py-2 pr-11 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200 ${
                  errors.password
                    ? "border-destructive focus-visible:ring-destructive"
                    : ""
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {errors.password && (
              <p className="text-[13px] font-medium text-destructive">
                {errors.password}
              </p>
            )}
          </div>

          {/* Confirm password */}
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none text-foreground/80">
              Confirmar nova senha
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? "text" : "password"}
                placeholder="&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (errors.confirmPassword)
                    setErrors((p) => ({ ...p, confirmPassword: undefined }));
                }}
                autoComplete="new-password"
                className={`flex h-11 w-full rounded-xl border border-input bg-background px-4 py-2 pr-11 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200 ${
                  errors.confirmPassword
                    ? "border-destructive focus-visible:ring-destructive"
                    : ""
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="text-[13px] font-medium text-destructive">
                {errors.confirmPassword}
              </p>
            )}
            {password &&
              confirmPassword &&
              password === confirmPassword &&
              !errors.confirmPassword && (
                <p className="flex items-center gap-1 text-[13px] font-medium text-green-500">
                  <CheckCircle className="h-3.5 w-3.5" />
                  Senhas coincidem
                </p>
              )}
          </div>

          <Button
            type="submit"
            size="lg"
            isLoading={isLoading}
            className="w-full text-base font-semibold"
          >
            Redefinir senha
          </Button>

          <Link
            href="/login"
            className="flex items-center justify-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao login
          </Link>
        </motion.form>
      )}

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9, duration: 0.5 }}
        className="text-center text-sm text-muted-foreground lg:hidden"
      >
        Reallliza Revestimentos &copy; {new Date().getFullYear()}
      </motion.p>
    </motion.div>
  );
}

// ============================================================
// Reset Password Page
// ============================================================

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen">
      {/* Left Side - Branding */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
        className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-zinc-950 p-12 lg:flex"
      >
        {/* Background pattern */}
        <div className="absolute inset-0 noise-bg">
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950" />
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
              backgroundSize: "64px 64px",
            }}
          />
          <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-yellow-500/10 blur-[128px]" />
          <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-yellow-500/5 blur-[128px]" />
        </div>

        <div className="relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="flex items-center gap-3"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-500">
              <span className="text-lg font-bold text-black">R</span>
            </div>
            <span className="text-xl font-semibold text-white">Reallliza</span>
          </motion.div>
        </div>

        <div className="relative z-10 space-y-6">
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.7 }}
            className="text-4xl font-bold leading-tight tracking-tight text-white xl:text-5xl"
          >
            Crie uma nova
            <br />
            <span className="text-gradient">senha segura</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.6 }}
            className="max-w-md text-lg leading-relaxed text-zinc-400"
          >
            Escolha uma senha forte para proteger sua conta no sistema.
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.6 }}
          className="relative z-10"
        >
          <p className="text-sm text-zinc-600">
            Reallliza Revestimentos &copy; {new Date().getFullYear()}
          </p>
        </motion.div>
      </motion.div>

      {/* Right Side - Form */}
      <div className="flex w-full items-center justify-center bg-background px-6 lg:w-1/2">
        <Suspense fallback={null}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
