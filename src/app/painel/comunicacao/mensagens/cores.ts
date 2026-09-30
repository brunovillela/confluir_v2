import type { SituacaoEmail, SituacaoMensagem } from "@/lib/comunicacao-mensagens-constantes"

export const COR_SITUACAO_MENSAGEM: Record<SituacaoMensagem, string> = {
  rascunho: "text-muted-foreground",
  agendada: "border-info/40 text-info-fg",
  enviando: "border-warning/40 text-warning-fg",
  enviada: "border-success/40 text-success-fg",
  cancelada: "border-destructive/40 text-destructive",
}

export const COR_SITUACAO_EMAIL: Record<SituacaoEmail, string> = {
  pendente: "border-warning/40 text-warning-fg",
  enviado: "border-success/40 text-success-fg",
  sem_email: "text-muted-foreground",
  descadastrado: "text-muted-foreground",
  duplicado: "text-muted-foreground",
  falha: "border-destructive/40 text-destructive",
}
