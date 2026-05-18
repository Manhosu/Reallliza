"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { CheckCircle2, AlertCircle, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { homologationApi } from "@/lib/api";

export default function CadastroProfissionalPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [specialties, setSpecialties] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!fullName.trim()) {
      setError("Informe seu nome completo.");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setError("Informe um e-mail válido.");
      return;
    }
    if (password.length < 6) {
      setError("A senha deve ter ao menos 6 caracteres.");
      return;
    }

    setIsSaving(true);
    try {
      await homologationApi.register({
        full_name: fullName.trim(),
        email: email.trim(),
        password,
        phone: phone.trim() || undefined,
        cpf: cpf.trim() || undefined,
        specialties: specialties
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      setDone(true);
      toast.success("Cadastro enviado para análise");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao enviar cadastro");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <Card>
          <CardContent className="p-6">
            {done ? (
              <div className="flex flex-col items-center gap-4 py-8 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-green-500/15">
                  <CheckCircle2 className="h-7 w-7 text-green-600" />
                </div>
                <div className="space-y-1">
                  <h1 className="text-lg font-semibold">Cadastro enviado!</h1>
                  <p className="text-sm text-muted-foreground">
                    Recebemos seu cadastro. A equipe Reallliza vai analisar e
                    você será avisado quando for homologado para receber
                    Ordens de Serviço.
                  </p>
                </div>
                <Link href="/login">
                  <Button variant="outline">Ir para o login</Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex flex-col items-center gap-2 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                    <UserPlus className="h-6 w-6 text-primary" />
                  </div>
                  <h1 className="text-xl font-bold tracking-tight">
                    Cadastro de Profissional
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Cadastre-se para ser homologado e receber Ordens de
                    Serviço da Reallliza.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground/80">
                    Nome completo
                  </label>
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Seu nome completo"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground/80">
                    E-mail
                  </label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@email.com"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground/80">
                    Senha (mínimo 6 caracteres)
                  </label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground/80">
                      Telefone
                    </label>
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground/80">
                      CPF
                    </label>
                    <Input
                      value={cpf}
                      onChange={(e) => setCpf(e.target.value)}
                      placeholder="000.000.000-00"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground/80">
                    Especialidades (opcional)
                  </label>
                  <Input
                    value={specialties}
                    onChange={(e) => setSpecialties(e.target.value)}
                    placeholder="Ex: Piso SPC, Rodapé, Painel..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Separe por vírgula.
                  </p>
                </div>

                {error && (
                  <div className="flex items-center gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  isLoading={isSaving}
                  className="w-full"
                >
                  Enviar cadastro
                </Button>

                <p className="text-center text-sm text-muted-foreground">
                  Já tem conta?{" "}
                  <Link href="/login" className="font-medium text-primary">
                    Entrar
                  </Link>
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
