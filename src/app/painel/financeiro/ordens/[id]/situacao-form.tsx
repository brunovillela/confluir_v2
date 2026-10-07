"use client"

import { useActionState, useState } from "react"
import { ArrowRightLeft, Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { Label } from "@/components/ui/label"
import { DESTINOS_SITUACAO, destinoDaSituacao, motivoOpcional } from "@/lib/ordens-situacoes"

import { alterarSituacaoAction, removerPagamento } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
const TEXTAREA =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none"

/**
 * Troca manual da situação de uma ordem não paga. Antes de gravar, a
 * confirmação diz para onde a ordem vai (fila de alçada, fila de pagamento,
 * devolvida, de volta ao contrato). Paga e Cancelada ficam de fora: têm os
 * botões próprios (Registrar pagamento / Cancelar ordem).
 */
export function SituacaoForm({
  ordemId,
  situacao,
  temContrato,
  autorizada = false,
}: {
  ordemId: string
  situacao: string
  temContrato: boolean
  /** Ordem paga: a volta é pela remoção do pagamento — para onde vai depende disto. */
  autorizada?: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const [estado, acao, pendente] = useActionState(alterarSituacaoAction, {})
  const [estRemover, acaoRemover, pendRemover] = useActionState(removerPagamento, {})
  const opcoes = DESTINOS_SITUACAO.filter(
    (d) =>
      d.valor !== situacao &&
      (!d.exigeContrato || temContrato) &&
      (!d.exigeAutorizada || autorizada)
  )
  const [nova, setNova] = useState(opcoes[0]?.valor ?? "")
  const destino = destinoDaSituacao(nova, situacao)
  const semMotivo = motivoOpcional(situacao, nova)

  // Paga: o único caminho é desfazer o registro de pagamento.
  if (situacao === "Paga") {
    const volta = autorizada ? "A pagar" : "Em autorização"
    const texto = `O registro de pagamento (valor, data, comprovante e pagador) é limpo e a ordem volta para "${volta}"${
      autorizada ? ", na fila de pagamento do Financeiro" : ", na fila de avaliação por alçada"
    }. Débito de caixa feito no pagamento é devolvido. Para pagamento devolvido pelo banco, use o estorno.`
    return (
      <div className="mt-4 grid gap-3 border-t pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">
            <span className="text-muted-foreground text-xs">Situação atual</span>
            <br />
            <span className="font-medium">Paga</span>
          </p>
          <form
            action={acaoRemover}
            onSubmit={(e) =>
              confirmarEnvio(e, {
                titulo: `Trocar a situação para "${volta}"?`,
                descricao: texto,
                confirmar: "Trocar",
                destrutivo: true,
              })
            }
          >
            <input type="hidden" name="id" value={ordemId} />
            <Button type="submit" variant="outline" size="sm" disabled={pendRemover}>
              {pendRemover ? <Loader2 className="animate-spin" /> : <ArrowRightLeft />}
              Voltar para &quot;{volta}&quot;
            </Button>
          </form>
        </div>
        {estRemover.erro && (
          <Alert variant="destructive">
            <AlertDescription>{estRemover.erro}</AlertDescription>
          </Alert>
        )}
      </div>
    )
  }

  if (opcoes.length === 0) return null

  return (
    <div className="mt-4 grid gap-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          <span className="text-muted-foreground text-xs">Situação atual</span>
          <br />
          <span className="font-medium">{situacao}</span>
        </p>
        <Button variant="outline" size="sm" onClick={() => setAberto(!aberto)}>
          <ArrowRightLeft />
          Trocar situação
        </Button>
      </div>

      {aberto && (
        <form
          action={acao}
          onSubmit={(e) =>
            confirmarEnvio(e, {
              titulo: `Trocar a situação para "${nova}"?`,
              descricao: destino ?? "",
              confirmar: "Trocar",
            })
          }
          className="grid gap-3 rounded-md border p-3"
        >
          <input type="hidden" name="id" value={ordemId} />
          {estado.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estado.erro}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="sit_nova">Nova situação</Label>
            <select
              id="sit_nova"
              name="situacao"
              value={nova}
              onChange={(e) => setNova(e.target.value)}
              className={SELECT}
            >
              {opcoes.map((d) => (
                <option key={d.valor} value={d.valor}>
                  {d.valor}
                </option>
              ))}
            </select>
            {destino && <p className="text-muted-foreground text-xs">{destino}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sit_motivo">{semMotivo ? "Observação (opcional)" : "Motivo *"}</Label>
            <textarea id="sit_motivo" name="motivo" rows={2} required={!semMotivo} className={TEXTAREA} />
          </div>
          <Button type="submit" size="sm" disabled={pendente} className="justify-self-start">
            {pendente ? <Loader2 className="animate-spin" /> : <ArrowRightLeft />}
            Trocar situação
          </Button>
        </form>
      )}
    </div>
  )
}
