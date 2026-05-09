"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare,
  Send,
  RefreshCw,
  Loader2,
  ChevronRight,
  User,
  Clock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { messagesApi } from "@/lib/api/messages";
import type { OsMessage, OsWithLastMessage } from "@/lib/api/messages";
import { OS_STATUS_LABELS, OsStatus } from "@/lib/types";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import Link from "next/link";

// ================================================================
// Helpers
// ================================================================

const STATUS_VARIANT: Record<string, string> = {
  open: "bg-blue-500/15 text-blue-500",
  in_progress: "bg-cyan-500/15 text-cyan-500",
  assigned: "bg-violet-500/15 text-violet-500",
  completed: "bg-green-500/15 text-green-500",
  cancelled: "bg-red-500/15 text-red-500",
};

function formatTime(dateStr: string) {
  try {
    return format(new Date(dateStr), "HH:mm", { locale: ptBR });
  } catch {
    return "";
  }
}

function formatDateLabel(dateStr: string) {
  try {
    return format(new Date(dateStr), "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return "";
  }
}

function senderLabel(role: string, name: string) {
  if (role === "technician") return name;
  if (role === "operator" || role === "admin") return `${name} (operador)`;
  return name;
}

// ================================================================
// Chat Detail Panel
// ================================================================

function ChatPanel({ os, onClose }: { os: OsWithLastMessage; onClose?: () => void }) {
  const [messages, setMessages] = useState<OsMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    try {
      const data = await messagesApi.listByOrder(os.id);
      setMessages(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [os.id]);

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setText("");
    try {
      const msg = await messagesApi.send(os.id, content);
      setMessages((prev) => [...prev, msg]);
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-card">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm truncate">
              OS #{os.order_number} — {os.title}
            </span>
            <span
              className={cn(
                "text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0",
                STATUS_VARIANT[os.status] ?? "bg-muted text-muted-foreground",
              )}
            >
              {OS_STATUS_LABELS[os.status as OsStatus] ?? os.status}
            </span>
          </div>
          {os.technician_name && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <User className="h-3 w-3" />
              {os.technician_name}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={loadMessages}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Link href={`/os/${os.id}`}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className={cn("h-12 rounded-xl", i % 2 === 0 ? "w-3/4" : "w-2/3 ml-auto")} />
          ))
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <MessageSquare className="h-8 w-8 opacity-40" />
            <p className="text-sm">Nenhuma mensagem ainda</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOperator = msg.sender_role !== "technician";
            return (
              <div
                key={msg.id}
                className={cn("flex gap-2", isOperator ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm",
                    isOperator
                      ? "bg-primary text-primary-foreground rounded-tr-sm"
                      : "bg-muted rounded-tl-sm",
                  )}
                >
                  {!isOperator && (
                    <p className="text-[10px] font-semibold opacity-60 mb-0.5">
                      {senderLabel(msg.sender_role, msg.sender_name)}
                    </p>
                  )}
                  <p className="leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
                  <p className={cn("text-[10px] mt-1 text-right opacity-60")}>
                    {formatTime(msg.created_at)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t bg-card flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Digite uma mensagem..."
          className="flex-1"
          disabled={sending}
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={!text.trim() || sending}
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

// ================================================================
// Chat List Item
// ================================================================

function ChatListItem({
  os,
  selected,
  onClick,
}: {
  os: OsWithLastMessage;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-3 border-b transition-colors hover:bg-muted/50",
        selected && "bg-muted",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-xs font-semibold text-primary">
              OS #{os.order_number}
            </span>
            <span
              className={cn(
                "text-[9px] font-medium px-1 py-px rounded",
                STATUS_VARIANT[os.status] ?? "bg-muted text-muted-foreground",
              )}
            >
              {OS_STATUS_LABELS[os.status as OsStatus] ?? os.status}
            </span>
          </div>
          <p className="text-xs text-foreground font-medium truncate">{os.title}</p>
          {os.last_message && (
            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
              {os.last_message.sender_role !== "technician" ? "Você: " : ""}
              {os.last_message.content}
            </p>
          )}
        </div>
        {os.last_message && (
          <span className="text-[10px] text-muted-foreground shrink-0 flex items-center gap-0.5 mt-0.5">
            <Clock className="h-2.5 w-2.5" />
            {formatTime(os.last_message.created_at)}
          </span>
        )}
      </div>
      {os.technician_name && (
        <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1">
          <User className="h-2.5 w-2.5" />
          {os.technician_name}
        </p>
      )}
    </button>
  );
}

// ================================================================
// Page
// ================================================================

export default function ChatsPage() {
  const [chats, setChats] = useState<OsWithLastMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<OsWithLastMessage | null>(null);

  const loadChats = useCallback(async () => {
    try {
      const res = await messagesApi.listActiveChats({ limit: 50 });
      const raw = res.data as unknown[];
      // Normalise from backend shape { service_order_id, service_order: {...} }
      const normalized: OsWithLastMessage[] = raw.map((item: unknown) => {
        const r = item as {
          service_order_id: string;
          service_order: { id: string; order_number: number; title: string; status: string; technician?: { id: string; full_name: string } };
        };
        return {
          id: r.service_order?.id ?? r.service_order_id,
          order_number: r.service_order?.order_number ?? 0,
          title: r.service_order?.title ?? "—",
          status: r.service_order?.status ?? "open",
          technician_id: r.service_order?.technician?.id ?? null,
          technician_name: r.service_order?.technician?.full_name,
        };
      });
      // Deduplicate
      const seen = new Set<string>();
      const deduped = normalized.filter((c) => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
      });
      setChats(deduped);
      if (!selected && deduped.length > 0) setSelected(deduped[0]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [selected]);

  useEffect(() => {
    loadChats();
    const interval = setInterval(loadChats, 30_000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)]">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-4 shrink-0"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-primary" />
            Central de Chats
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Mensagens operacionais entre operadores e técnicos
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadChats} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Atualizar
        </Button>
      </motion.div>

      {/* Layout */}
      <Card className="flex flex-1 overflow-hidden min-h-0">
        {/* Sidebar */}
        <div className="w-72 shrink-0 border-r flex flex-col overflow-hidden">
          <div className="px-4 py-2.5 border-b bg-muted/30 flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Conversas
            </span>
            {!loading && (
              <Badge variant="secondary" className="text-[10px] h-4">
                {chats.length}
              </Badge>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="px-4 py-3 border-b space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-3 w-32" />
                </div>
              ))
            ) : chats.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground p-4">
                <MessageSquare className="h-8 w-8 opacity-30" />
                <p className="text-xs text-center">Nenhuma conversa ainda</p>
              </div>
            ) : (
              chats.map((os) => (
                <ChatListItem
                  key={os.id}
                  os={os}
                  selected={selected?.id === os.id}
                  onClick={() => setSelected(os)}
                />
              ))
            )}
          </div>
        </div>

        {/* Chat Panel */}
        <div className="flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            {selected ? (
              <motion.div
                key={selected.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full"
              >
                <ChatPanel os={selected} />
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground"
              >
                <MessageSquare className="h-12 w-12 opacity-20" />
                <p className="text-sm">Selecione uma conversa</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Card>
    </div>
  );
}
