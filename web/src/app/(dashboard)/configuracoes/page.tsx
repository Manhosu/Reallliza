"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  User,
  Mail,
  Phone,
  Camera,
  Moon,
  Globe,
  Bell,
  BellRing,
  Smartphone,
  Lock,
  Eye,
  EyeOff,
  Shield,
  Save,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/stores/auth-store";

// ============================================================
// Settings Section Skeleton
// ============================================================

function SectionSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-3/4" />
      </CardContent>
    </Card>
  );
}

// ============================================================
// Toggle Switch Component
// ============================================================

function ToggleSwitch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl p-3 transition-colors hover:bg-accent/50">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200",
          checked ? "bg-primary" : "bg-muted"
        )}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200",
            checked ? "translate-x-6" : "translate-x-1"
          )}
        />
      </button>
    </div>
  );
}

// ============================================================
// Configuracoes Page
// ============================================================

export default function ConfiguracoesPage() {
  const user = useAuthStore((s) => s.user);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Profile state
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Preferences state
  const [darkMode, setDarkMode] = useState(false);
  const [language, setLanguage] = useState("pt-BR");
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifyPush, setNotifyPush] = useState(true);
  const [notifyInApp, setNotifyInApp] = useState(true);

  // Security state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
      // Populate from user profile
      if (user) {
        setFullName(user.full_name || "");
        setEmail(user.email || "");
        setPhone(user.phone || "");
      } else {
        // Mock data fallback
        setFullName("Carlos Silva");
        setEmail("carlos.silva@reallliza.com.br");
        setPhone("(11) 98765-4321");
      }

      // Check current dark mode
      setDarkMode(document.documentElement.classList.contains("dark"));
    }, 800);
    return () => clearTimeout(timer);
  }, [user]);

  const handleSave = async () => {
    // Validate passwords if trying to change
    if (newPassword || confirmPassword || currentPassword) {
      if (!currentPassword) {
        setPasswordError("Informe a senha atual");
        return;
      }
      if (newPassword !== confirmPassword) {
        setPasswordError("As senhas nao coincidem");
        return;
      }
      if (newPassword.length < 6) {
        setPasswordError("A nova senha deve ter no minimo 6 caracteres");
        return;
      }
    }
    setPasswordError("");

    setIsSaving(true);
    // Simulate save
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setIsSaving(false);
  };

  const initials = fullName
    ? fullName
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "U";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-1"
      >
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
          Configuracoes
        </h1>
        <p className="text-muted-foreground">
          Gerencie seu perfil, preferencias e seguranca.
        </p>
      </motion.div>

      {isLoading ? (
        <div className="space-y-6">
          <SectionSkeleton />
          <SectionSkeleton />
          <SectionSkeleton />
        </div>
      ) : (
        <div className="space-y-6">
          {/* ============================== PERFIL ============================== */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <User className="h-5 w-5 text-primary" />
                  Perfil
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Avatar */}
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-2xl font-bold text-primary">
                      {initials}
                    </div>
                    <button className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-sm transition-transform hover:scale-110">
                      <Camera className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{fullName}</p>
                    <p className="text-xs text-muted-foreground">{email}</p>
                    <p className="mt-1 text-xs text-primary">
                      Alterar foto de perfil
                    </p>
                  </div>
                </div>

                {/* Fields */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input
                    label="Nome Completo"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Seu nome completo"
                  />
                  <Input
                    label="E-mail"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                  />
                  <Input
                    label="Telefone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(00) 00000-0000"
                  />
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* ============================== PREFERENCIAS ============================== */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Settings className="h-5 w-5 text-primary" />
                  Preferencias
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {/* Dark Mode */}
                <ToggleSwitch
                  checked={darkMode}
                  onChange={(val) => {
                    setDarkMode(val);
                    // Visual only - actual toggle is in the header
                  }}
                  label="Modo Escuro"
                  description="Alterne pelo botao no cabecalho para aplicar"
                />

                {/* Language */}
                <div className="flex items-center justify-between rounded-xl p-3">
                  <div className="flex items-center gap-3">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">Idioma</p>
                      <p className="text-xs text-muted-foreground">
                        Idioma da interface
                      </p>
                    </div>
                  </div>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all duration-200"
                  >
                    <option value="pt-BR">Portugues (BR)</option>
                  </select>
                </div>

                {/* Notification Divider */}
                <div className="border-t border-border pt-2">
                  <p className="mb-2 flex items-center gap-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Bell className="h-3.5 w-3.5" />
                    Notificacoes
                  </p>
                </div>

                <ToggleSwitch
                  checked={notifyEmail}
                  onChange={setNotifyEmail}
                  label="Notificacoes por E-mail"
                  description="Receba atualizacoes importantes por e-mail"
                />

                <ToggleSwitch
                  checked={notifyPush}
                  onChange={setNotifyPush}
                  label="Notificacoes Push"
                  description="Receba notificacoes push no navegador"
                />

                <ToggleSwitch
                  checked={notifyInApp}
                  onChange={setNotifyInApp}
                  label="Notificacoes no Aplicativo"
                  description="Exibir notificacoes dentro do sistema"
                />
              </CardContent>
            </Card>
          </motion.div>

          {/* ============================== SEGURANCA ============================== */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Lock className="h-5 w-5 text-primary" />
                  Seguranca
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Altere sua senha de acesso ao sistema. Preencha todos os
                  campos abaixo.
                </p>

                <div className="grid grid-cols-1 gap-4">
                  {/* Current Password */}
                  <div className="relative">
                    <Input
                      label="Senha Atual"
                      type={showCurrentPassword ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Digite sua senha atual"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowCurrentPassword(!showCurrentPassword)
                      }
                      className="absolute right-3 top-[38px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {showCurrentPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {/* New Password */}
                    <div className="relative">
                      <Input
                        label="Nova Senha"
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Minimo 6 caracteres"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-[38px] text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {showNewPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>

                    {/* Confirm Password */}
                    <div className="relative">
                      <Input
                        label="Confirmar Nova Senha"
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repita a nova senha"
                        error={passwordError || undefined}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowConfirmPassword(!showConfirmPassword)
                        }
                        className="absolute right-3 top-[38px] text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* ============================== SISTEMA (Admin) ============================== */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.4 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Shield className="h-5 w-5 text-primary" />
                  Sistema
                  <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    Admin
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-8">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                    <Settings className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Configuracoes do sistema em breve
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground/60">
                    Esta secao esta sendo desenvolvida e estara disponivel em
                    uma futura atualizacao.
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* ============================== SAVE BUTTON ============================== */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            className="flex justify-end pb-6"
          >
            <Button
              size="lg"
              onClick={handleSave}
              isLoading={isSaving}
            >
              <Save className="h-4 w-4" />
              Salvar Alteracoes
            </Button>
          </motion.div>
        </div>
      )}
    </div>
  );
}
