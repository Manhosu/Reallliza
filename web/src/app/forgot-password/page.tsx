"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowLeft, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const validate = () => {
    if (!email) {
      setError("E-mail e obrigatorio");
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("E-mail invalido");
      return false;
    }
    setError("");
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);
    try {
      await apiClient.post("/auth/forgot-password", { email });
      setSubmitted(true);
      toast.success("Email enviado! Verifique sua caixa de entrada.");
    } catch {
      toast.error("Erro ao enviar email. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

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
            Recupere seu
            <br />
            <span className="text-gradient">acesso</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.6 }}
            className="max-w-md text-lg leading-relaxed text-zinc-400"
          >
            Enviaremos um link de recuperacao para o e-mail cadastrado na sua
            conta.
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
              Esqueceu sua senha?
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="text-muted-foreground"
            >
              Insira seu e-mail para receber o link de recuperacao.
            </motion.p>
          </div>

          {submitted ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="space-y-6"
            >
              <div className="flex flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
                  <Mail className="h-7 w-7 text-primary" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-semibold">Email enviado!</h3>
                  <p className="text-sm text-muted-foreground">
                    Verifique sua caixa de entrada e siga as instrucoes para
                    redefinir sua senha.
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
              <Input
                label="E-mail"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError("");
                }}
                error={error}
                autoComplete="email"
                autoFocus
              />

              <Button
                type="submit"
                size="lg"
                isLoading={isLoading}
                className="w-full text-base font-semibold"
              >
                Enviar link de recuperacao
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
      </div>
    </div>
  );
}
