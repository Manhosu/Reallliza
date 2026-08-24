"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { CheckCircle2, AlertCircle, Building2, Store, Factory } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { companySignupApi, type CompanyType } from "@/lib/api";

export default function CadastroEmpresaPage() {
  const [companyType, setCompanyType] = useState<CompanyType | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [city, setCity] = useState("");
  const [uf, setUf] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!companyType) {
      setError("Escolha se é Loja ou Fabricante.");
      return;
    }
    if (!companyName.trim()) {
      setError("Informe a razão social ou nome da empresa.");
      return;
    }
    if (!cnpj.trim()) {
      setError("Informe o CNPJ.");
      return;
    }
    if (!contactName.trim()) {
      setError("Informe o nome do responsável.");
      return;
    }
    if (!contactPhone.trim()) {
      setError("Informe o telefone/WhatsApp.");
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
      await companySignupApi.register({
        company_type: companyType,
        company_name: companyName.trim(),
        cnpj: cnpj.trim(),
        contact_name: contactName.trim(),
        contact_phone: contactPhone.trim(),
        email: email.trim(),
        password,
        city: city.trim() || undefined,
        uf: uf.trim() || undefined,
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
                    Nossa equipe vai analisar as informações e você será avisado
                    assim que o cadastro for aprovado.
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
                    <Building2 className="h-6 w-6 text-primary" />
                  </div>
                  <h1 className="text-xl font-bold tracking-tight">Cadastro de Empresa</h1>
                  <p className="text-sm text-muted-foreground">
                    Cadastre sua loja ou fabricante para acessar a plataforma Reallliza.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground/80">Perfil *</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setCompanyType("loja")}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-sm transition",
                        companyType === "loja"
                          ? "border-primary bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                      )}
                    >
                      <Store className="h-5 w-5" /> Loja
                    </button>
                    <button
                      type="button"
                      onClick={() => setCompanyType("fabricante")}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-sm transition",
                        companyType === "fabricante"
                          ? "border-primary bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                      )}
                    >
                      <Factory className="h-5 w-5" /> Fabricante
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground/80">
                    Razão social / nome da empresa
                  </label>
                  <Input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Nome da empresa"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground/80">CNPJ</label>
                    <Input
                      value={cnpj}
                      onChange={(e) => setCnpj(e.target.value)}
                      placeholder="00.000.000/0000-00"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground/80">
                      Nome do responsável
                    </label>
                    <Input
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder="Quem vai gerenciar a conta"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground/80">
                      Telefone/WhatsApp
                    </label>
                    <Input
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground/80">E-mail</label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="empresa@email.com"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2 space-y-2">
                    <label className="text-sm font-medium text-foreground/80">Cidade</label>
                    <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Cidade" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground/80">UF</label>
                    <Input
                      value={uf}
                      onChange={(e) => setUf(e.target.value.toUpperCase().slice(0, 2))}
                      placeholder="UF"
                      maxLength={2}
                    />
                  </div>
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

                {error && (
                  <div className="flex items-center gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {error}
                  </div>
                )}

                <Button type="submit" isLoading={isSaving} className="w-full">
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
