"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  Plus,
  Trash2,
  Calendar,
  Edit,
  X,
  Star,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { teamsApi, usersApi } from "@/lib/api";
import type { Team } from "@/lib/api/teams";
import type { Profile } from "@/lib/types";
import { UserRole } from "@/lib/types";
import { useAuthStore } from "@/stores/auth-store";

const TEAM_COLORS = [
  "#EAB308",
  "#3B82F6",
  "#10B981",
  "#F97316",
  "#EC4899",
  "#8B5CF6",
  "#EF4444",
  "#14B8A6",
];

export default function EquipesPage() {
  const router = useRouter();
  const { user } = useAuthStore();

  useEffect(() => {
    if (user && user.role !== UserRole.ADMIN) {
      router.push("/dashboard");
    }
  }, [user, router]);

  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Team | null>(null);
  const [managingMembers, setManagingMembers] = useState<Team | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await teamsApi.list(true);
      setTeams(data);
    } catch (err) {
      console.error(err);
      toast.error("Falha ao carregar equipes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Equipes Operacionais
          </h1>
          <p className="text-sm text-muted-foreground">
            Central de calendário por equipe Alfa / Beta / Gama / Delta.
            Especialidades são herdadas dos membros.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-6 space-y-3">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : teams.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="Nenhuma equipe cadastrada"
          description="A migração deveria criar 4 equipes padrão. Verifique."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {teams.map((t) => (
            <TeamCard
              key={t.id}
              team={t}
              onEdit={() => setEditing(t)}
              onManageMembers={() => setManagingMembers(t)}
              onOpenCalendar={() => router.push(`/equipes/${t.id}/calendario`)}
            />
          ))}
        </div>
      )}

      {editing && (
        <EditTeamDialog
          team={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}

      {managingMembers && (
        <ManageMembersDialog
          team={managingMembers}
          onClose={() => setManagingMembers(null)}
          onChanged={async () => {
            await load();
          }}
        />
      )}
    </div>
  );
}

function TeamCard({
  team,
  onEdit,
  onManageMembers,
  onOpenCalendar,
}: {
  team: Team;
  onEdit: () => void;
  onManageMembers: () => void;
  onOpenCalendar: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
    >
      <Card
        className="overflow-hidden"
        style={{ borderTop: `4px solid ${team.color}` }}
      >
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-lg flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ background: team.color }}
                />
                Equipe {team.name}
                {!team.is_active && (
                  <Badge variant="secondary" className="ml-2">
                    inativa
                  </Badge>
                )}
              </CardTitle>
              {team.description && (
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                  {team.description}
                </p>
              )}
            </div>
            <Button size="sm" variant="ghost" onClick={onEdit}>
              <Edit className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-secondary/50 p-3">
              <div className="text-xs text-muted-foreground">Membros</div>
              <div className="text-lg font-semibold">
                {team.member_count ?? 0}
              </div>
            </div>
            <div className="rounded-lg bg-secondary/50 p-3">
              <div className="text-xs text-muted-foreground">Especialidades</div>
              <div className="text-lg font-semibold">
                {team.specialties?.length ?? 0}
              </div>
            </div>
          </div>

          {team.specialties && team.specialties.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {team.specialties.slice(0, 4).map((s) => (
                <Badge key={s.id} variant="outline" className="text-xs">
                  {s.name}
                </Badge>
              ))}
              {team.specialties.length > 4 && (
                <Badge variant="outline" className="text-xs">
                  +{team.specialties.length - 4}
                </Badge>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={onManageMembers}
            >
              <Users className="h-4 w-4 mr-1" /> Membros
            </Button>
            <Button size="sm" className="flex-1" onClick={onOpenCalendar}>
              <Calendar className="h-4 w-4 mr-1" /> Calendário
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function EditTeamDialog({
  team,
  onClose,
  onSaved,
}: {
  team: Team;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(team.name);
  const [color, setColor] = useState(team.color);
  const [description, setDescription] = useState(team.description ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await teamsApi.update(team.id, {
        name: name.trim(),
        color,
        description: description.trim() || null,
      });
      toast.success("Equipe atualizada");
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="w-full max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Editar equipe {team.name}</CardTitle>
              <Button size="sm" variant="ghost" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Nome</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Cor</label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {TEAM_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={cn(
                        "h-8 w-8 rounded-full border-2 transition",
                        color === c
                          ? "border-foreground scale-110"
                          : "border-transparent"
                      )}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Descrição</label>
                <textarea
                  value={description}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setDescription(e.target.value)
                  }
                  className="mt-1 flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={onClose}>
                  Cancelar
                </Button>
                <Button onClick={save} disabled={saving}>
                  {saving ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function ManageMembersDialog({
  team,
  onClose,
  onChanged,
}: {
  team: Team;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [detail, setDetail] = useState<Team | null>(null);
  const [technicians, setTechnicians] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [d, u] = await Promise.all([
        teamsApi.get(team.id),
        usersApi.list({ role: UserRole.TECHNICIAN, limit: 100 }),
      ]);
      setDetail(d);
      setTechnicians(u.data);
    } catch (err) {
      console.error(err);
      toast.error("Falha ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, [team.id]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const memberIds = new Set(
    (detail?.members ?? []).map((m) => m.technician_id)
  );
  const available = technicians.filter((t) => !memberIds.has(t.id));

  const add = async (techId: string) => {
    try {
      await teamsApi.addMember(team.id, { technician_id: techId });
      toast.success("Membro adicionado");
      await loadAll();
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao adicionar");
    }
  };

  const remove = async (techId: string) => {
    try {
      await teamsApi.removeMember(team.id, techId);
      toast.success("Membro removido");
      await loadAll();
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao remover");
    }
  };

  const toggleLeader = async (techId: string, isLeader: boolean) => {
    try {
      await teamsApi.addMember(team.id, {
        technician_id: techId,
        is_leader: !isLeader,
      });
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao atualizar");
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="w-full max-w-2xl max-h-[85vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <Card className="max-h-[85vh] overflow-hidden flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between border-b">
              <CardTitle>Membros — {team.name}</CardTitle>
              <Button size="sm" variant="ghost" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-6 space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : (
                <div className="divide-y">
                  <div className="p-4">
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Membros atuais ({detail?.members?.length ?? 0})
                    </h4>
                    {(detail?.members ?? []).length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">
                        Nenhum membro. Adicione técnicos abaixo.
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {(detail?.members ?? []).map((m) => (
                          <div
                            key={m.technician_id}
                            className="flex items-center justify-between p-2 rounded-lg hover:bg-secondary/50"
                          >
                            <div>
                              <div className="text-sm font-medium">
                                {m.profile?.full_name ?? "—"}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {m.profile?.email}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  toggleLeader(m.technician_id, m.is_leader)
                                }
                                title={
                                  m.is_leader
                                    ? "Remover como líder"
                                    : "Marcar como líder"
                                }
                              >
                                <Star
                                  className={cn(
                                    "h-4 w-4",
                                    m.is_leader &&
                                      "fill-yellow-500 text-yellow-500"
                                  )}
                                />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => remove(m.technician_id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Adicionar técnico ({available.length} disponíveis)
                    </h4>
                    {available.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">
                        Todos os técnicos já estão em alguma equipe.
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {available.slice(0, 30).map((t) => (
                          <div
                            key={t.id}
                            className="flex items-center justify-between p-2 rounded-lg hover:bg-secondary/50"
                          >
                            <div>
                              <div className="text-sm font-medium">
                                {t.full_name}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {t.email}
                              </div>
                            </div>
                            <Button size="sm" onClick={() => add(t.id)}>
                              <Plus className="h-4 w-4 mr-1" /> Adicionar
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
