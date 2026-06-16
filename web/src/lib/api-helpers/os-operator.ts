/**
 * Helpers de "operador da OS" — quem está autorizado a executar o fluxo
 * de campo (Iniciar Deslocamento, Cheguei, Etapas, Finalizar).
 *
 * Existem 3 casos:
 *  - Técnico (role='technician') atribuído via OS direta → technician_id = user.id
 *  - Parceiro (role='partner') que aceitou um broadcast → technician_id = user.id
 *    (a OS pode ter partner_id null, porque broadcast)
 *  - Parceiro vinculado por proposta direta → partner_id casa com seu partner record
 *
 * Antes dessa unificação, várias rotas checavam só `role === 'technician'
 * && technician_id == user.id`, e parceiro que aceitava broadcast ficava
 * sem botão "Iniciar Deslocamento" no app (Jessica 16/06).
 */

import type { AuthUser } from "./auth";

export interface OsOperatorContext {
  technician_id: string | null;
  partner_id: string | null;
}

/**
 * True quando o `user` pode executar a OS (papel de campo, não admin).
 * Aceita tanto OS atribuída diretamente quanto aceite via broadcast.
 */
export function isOsOperator(
  user: AuthUser,
  order: OsOperatorContext,
  partnerOwnId?: string | null
): boolean {
  if (user.role === "technician") {
    return order.technician_id === user.id;
  }
  if (user.role === "partner") {
    // Parceiro pode ser o "técnico" da OS (aceite por broadcast) OU dono
    // do partner_id (aceite por proposta direta).
    if (order.technician_id === user.id) return true;
    if (partnerOwnId && order.partner_id === partnerOwnId) return true;
  }
  return false;
}
