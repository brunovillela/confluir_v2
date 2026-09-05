import Link from "next/link"
import { ClipboardCheck } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { SituacaoChecklist } from "@/lib/db/veiculos-checklist"
import { formatarData } from "@/lib/formato"

/**
 * Alerta de checklist na página do veículo.
 *
 * Três estados, com textos diferentes DE PROPÓSITO: "nunca realizado" não é a
 * mesma coisa que "venceu" — o primeiro costuma ser veículo recém-cadastrado, e
 * tratar os dois com a mesma frase confunde quem opera. Quando está em dia, o
 * componente não desenha nada: alerta que aparece sempre vira paisagem.
 */
export function AlertaChecklist({
  veiculoId,
  situacao,
  podeRealizar,
}: {
  veiculoId: string
  situacao: SituacaoChecklist
  /** Quem não realiza a verificação vê o aviso, mas sem o botão de ação. */
  podeRealizar: boolean
}) {
  const href = `/painel/veiculos/checklists/novo?veiculo=${veiculoId}`

  if (situacao.nunca) {
    return (
      <Alert variant="warning">
        <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
          <span>
            Este veículo <strong>nunca passou por checklist</strong>. A
            verificação é exigida a cada {situacao.recorrenciaDias} dias.
          </span>
          {podeRealizar && (
            <Button asChild size="sm" variant="outline">
              <Link href={href}>
                <ClipboardCheck />
                Realizar agora
              </Link>
            </Button>
          )}
        </AlertDescription>
      </Alert>
    )
  }

  if (situacao.vencido) {
    const dias = Math.abs(situacao.diasRestantes ?? 0)
    return (
      <Alert variant="destructive">
        <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
          <span>
            <strong>
              Checklist vencido há {dias} {dias === 1 ? "dia" : "dias"}
            </strong>{" "}
            — o último foi em {formatarData(situacao.ultimoEm)} e a verificação
            é exigida a cada {situacao.recorrenciaDias} dias.
          </span>
          {podeRealizar && (
            <Button asChild size="sm" variant="outline">
              <Link href={href}>
                <ClipboardCheck />
                Realizar agora
              </Link>
            </Button>
          )}
        </AlertDescription>
      </Alert>
    )
  }

  if (situacao.proximoDoVencimento) {
    const dias = situacao.diasRestantes ?? 0
    return (
      <Alert variant="warning">
        <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
          <span>
            Checklist vence{" "}
            {dias === 0 ? "hoje" : `em ${dias} ${dias === 1 ? "dia" : "dias"}`}
            {situacao.venceEm ? ` (${formatarData(situacao.venceEm)})` : ""}.
          </span>
          {podeRealizar && (
            <Button asChild size="sm" variant="outline">
              <Link href={href}>
                <ClipboardCheck />
                Realizar
              </Link>
            </Button>
          )}
        </AlertDescription>
      </Alert>
    )
  }

  // Pendências do último checklist continuam valendo mesmo com o prazo em dia:
  // o veículo foi verificado, e algo estava errado.
  if (situacao.pendencias > 0) {
    return (
      <Alert variant="warning">
        <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
          <span>
            O último checklist apontou{" "}
            <strong>
              {situacao.pendencias}{" "}
              {situacao.pendencias === 1 ? "item" : "itens"} fora de
              conformidade
            </strong>
            .
          </span>
          {situacao.ultimoId && (
            <Button asChild size="sm" variant="outline">
              <Link href={`/painel/veiculos/checklists/${situacao.ultimoId}`}>
                Ver o que foi apontado
              </Link>
            </Button>
          )}
        </AlertDescription>
      </Alert>
    )
  }

  return null
}
