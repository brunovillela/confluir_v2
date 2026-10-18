import Link from "next/link"
import { PauseCircle } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

/**
 * No lugar dos formulários quando o envio está parado (Atendimento suspenso
 * ou o portal em modo de consulta — a recusa de bloqueioDaParte): o motivo e,
 * com "O sindicato" no ar, onde achar os canais oficiais. A conversa e os
 * anexos seguem para consulta.
 */
export function AvisoEnvioParado({
  titulo,
  mensagem,
  detalhe,
  canais,
}: {
  titulo: string
  /** O texto da gestão (ou o padrão), como o associado lê na faixa do topo. */
  mensagem: string
  /** O que continua valendo, em linha própria (a mensagem da gestão pode vir sem ponto final). */
  detalhe?: string
  /** "O sindicato" não está desabilitado: o link para os canais oficiais aparece. */
  canais: boolean
}) {
  return (
    <Alert>
      <PauseCircle />
      <AlertTitle>{titulo}</AlertTitle>
      <AlertDescription className="[&_p:not(:last-child)]:mb-1.5">
        <p>{mensagem}</p>
        {detalhe && <p>{detalhe}</p>}
        {canais && (
          <p>
            Precisa falar com a entidade agora? Os canais oficiais estão em{" "}
            <Link href="/portal/sindicato" className="font-medium">
              O sindicato
            </Link>
            .
          </p>
        )}
      </AlertDescription>
    </Alert>
  )
}
