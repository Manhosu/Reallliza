"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/stores/auth-store";
import { UserRole } from "@/lib/types";

// ============================================================
// Inner Login Form (uses useSearchParams, needs Suspense)
// ============================================================

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo");
  const signIn = useAuthStore((s) => s.signIn);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>(
    {}
  );

  const validate = () => {
    const newErrors: { email?: string; password?: string } = {};
    if (!email) {
      newErrors.email = "E-mail e obrigatorio";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = "E-mail invalido";
    }
    if (!password) {
      newErrors.password = "Senha e obrigatoria";
    } else if (password.length < 6) {
      newErrors.password = "Senha deve ter pelo menos 6 caracteres";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);
    try {
      const { error, role } = await signIn(email, password);

      if (error) {
        if (error.includes("Invalid login")) {
          toast.error("E-mail ou senha incorretos.");
        } else {
          toast.error(error);
        }
        return;
      }

      toast.success("Login realizado com sucesso!");

      // Redirect based on role
      if (redirectTo) {
        router.push(redirectTo);
      } else {
        switch (role) {
          case UserRole.ADMIN:
            router.push("/dashboard");
            break;
          case UserRole.TECHNICIAN:
            router.push("/os");
            break;
          case UserRole.PARTNER:
            router.push("/os");
            break;
          default:
            router.push("/dashboard");
        }
      }
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
          Bem-vindo de volta
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="text-muted-foreground"
        >
          Insira suas credenciais para acessar o sistema.
        </motion.p>
      </div>

      <motion.form
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.5 }}
        onSubmit={handleSubmit}
        className="space-y-5"
      >
        <Input
          label="E-mail"
          type="email"
          placeholder="seu@email.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (errors.email) setErrors((p) => ({ ...p, email: undefined }));
          }}
          error={errors.email}
          autoComplete="email"
          autoFocus
        />

        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-foreground/80">
            Senha
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
              autoComplete="current-password"
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

        <div className="flex items-center justify-end">
          <Link
            href="/forgot-password"
            className="text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            Esqueci minha senha
          </Link>
        </div>

        <Button
          type="submit"
          size="lg"
          isLoading={isLoading}
          className="w-full text-base font-semibold"
        >
          Entrar
        </Button>
      </motion.form>

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
// Login Page (outer wrapper with Suspense)
// ============================================================

export default function LoginPage() {
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
          {/* Grid pattern */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
              backgroundSize: "64px 64px",
            }}
          />
          {/* Glow effect */}
          <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-yellow-500/10 blur-[128px]" />
          <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-yellow-500/5 blur-[128px]" />
        </div>

        {/* Content */}
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
            Gestao inteligente
            <br />
            para{" "}
            <span className="text-gradient">revestimentos</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.6 }}
            className="max-w-md text-lg leading-relaxed text-zinc-400"
          >
            Controle ordens de servico, equipes e ferramentas com uma plataforma
            projetada para eficiencia e produtividade.
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

      {/* Right Side - Login Form */}
      <div className="flex w-full items-center justify-center bg-background px-6 lg:w-1/2">
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
