import { Paperclip } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { TextoComLinks } from "@/components/texto-com-links"
import {
  ROTULO_SITUACAO_ATENDIMENTO,
  type SituacaoAtendimento,
} from "@/lib/atendimento-constantes"
import type { MensagemAtendimento } from "@/lib/db/portal-atendimentos"
import { formatarDataHora } from "@/lib/formato"
import { cn } from "@/lib/utils"

/**
 * A conversa de uma solicitação, igual no portal e no painel: a diferença é
 * de que lado se lê. `ladoDeCa` é quem está olhando — as mensagens dele
 * ficam à direita. `anexoBase` é a rota que serve o anexo nesse lado.
 *
 * Itens do tipo "marco" (A51) são a linha do tempo — aberta, em andamento,
 * primeira resposta, concluída, reaberta — e aparecem como uma linha
 * centralizada com a data, entre os balões. `conversaComMarcos`
 * (lib/db/portal-atendimentos) monta a lista completa.
 */
export function ConversaAtendimento({
  mensagens,
  ladoDeCa,
  anexoBase,
}: {
  mensagens: MensagemAtendimento[]
  ladoDeCa: "filiado" | "entidade"
  anexoBase: string
}) {
  if (!mensagens.some((m) => m.tipo === "mensagem")) {
    return <p className="text-muted-foreground text-sm">Ainda não há mensagens.</p>
  }
  return (
    <ol className="grid gap-3">
      {mensagens.map((m) => {
        if (m.tipo === "marco") {
          return (
            <li key={m.id} className="flex items-center gap-3 py-1">
              <span aria-hidden className="bg-border h-px flex-1" />
              <span className="text-muted-foreground max-w-[80%] text-center text-xs">
                {m.texto}
                {" · "}
                <time dateTime={m.criadoEm} className="whitespace-nowrap">
                  {formatarDataHora(m.criadoEm)}
                </time>
              </span>
              <span aria-hidden className="bg-border h-px flex-1" />
            </li>
          )
        }
        const minha = m.autor === ladoDeCa
        return (
          <li key={m.id} className={cn("flex", minha ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-3 text-sm sm:max-w-[75%]",
                minha ? "bg-primary/10 rounded-br-md" : "bg-muted rounded-bl-md"
              )}
            >
              <p className="text-muted-foreground mb-1 text-xs">
                {m.autor === "entidade" ? (m.autorNome ? `${m.autorNome} · entidade` : "Entidade") : (m.autorNome ?? "Filiado")}
                {" · "}
                {formatarDataHora(m.criadoEm)}
              </p>
              <p className="whitespace-pre-wrap">
                <TextoComLinks texto={m.texto} />
              </p>
              {m.anexoCaminho && (
                <a
                  href={`${anexoBase}/${m.anexoCaminho}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex min-h-9 items-center gap-1.5 text-xs underline underline-offset-4"
                >
                  <Paperclip className="size-3.5" />
                  {m.anexoNome ?? "Anexo"}
                </a>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export function SituacaoAtendimentoBadge({ situacao, atrasada }: { situacao: SituacaoAtendimento; atrasada?: boolean }) {
  const variant =
    situacao === "concluida" ? "outline" : situacao === "respondida" ? "success" : atrasada ? "destructive" : situacao === "em_andamento" ? "warning" : "secondary"
  return (
    <Badge variant={variant}>
      {ROTULO_SITUACAO_ATENDIMENTO[situacao]}
      {atrasada && situacao !== "concluida" ? " · prazo vencido" : ""}
    </Badge>
  )
}
