"use client"

import { useActionState, useState } from "react"
import { Check, Loader2, Send, Undo2, X } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type EstadoForm } from "@/lib/contas"

import {
  avaliarRemessaAction,
  reenviarRemessaAction,
  retirarDiariaRemessaAction,
} from "@/app/painel/pessoal/diarias/remessas/actions"

/**
 * Avaliação da REMESSA de diárias (08/10/2026): aprovar a remessa inteira
 * (nasce a ordem rateada) ou devolver com a observação geral e a não
 * conformidade de cada diária apontada.
 */

const AREA =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none"

function Retorno({ estado }: { estado: EstadoForm }) {
  if (estado.erro) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{estado.erro}</AlertDescription>
      </Alert>
    )
  }
  if (estado.ok) {
    return (
      <Alert className="border-success/40 text-success-fg">
        <AlertDescription>{estado.ok}</AlertDescription>
      </Alert>
    )
  }
  return null
}

export function AvaliacaoRemessaForm({
  remessaId,
  total,
  diarias,
  infracoes,
  destinoOrdem,
}: {
  remessaId: string
  /** Como a ordem nasce para quem vê (regra das diárias × alçada dele). */
  destinoOrdem: string
  /** Total formatado da remessa (entra na pergunta). */
  total: string
  /** Diárias aguardando, para apontar a não conformidade. */
  diarias: { id: string; rotulo: string }[]
  /** Infrações pendentes do beneficiário (texto já formatado), se houver. */
  infracoes: { quantidade: number; total: string } | null
}) {
  const [estado, formAction, pendente] = useActionState(avaliarRemessaAction, {})
  const [devolvendo, setDevolvendo] = useState(false)
  const [apontadas, setApontadas] = useState<Set<string>>(new Set())

  if (estado.ok) return <Retorno estado={estado} />

  return (
    <form
      action={formAction}
      className="grid gap-4"
      onSubmit={(e) => {
        const decisao = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement)?.value
        if (decisao === "aprovar") {
          confirmarEnvio(e, {
            titulo: `Aprovar a remessa (${total})?`,
            descricao: `${diarias.length ? `As ${diarias.length} diária(s) aguardando ficam aprovadas e nasce` : "Nasce"} UMA ordem de pagamento com o valor da remessa, rateada pelos centros de custo configurados — ${destinoOrdem}.`,
            confirmar: "Aprovar",
          })
        } else {
          confirmarEnvio(e, {
            titulo: "Devolver a remessa para correção?",
            descricao: "Quem lançou recebe a observação e as não conformidades apontadas; corrige e reenvia.",
            confirmar: "Devolver",
          })
        }
      }}
    >
      <input type="hidden" name="remessa_id" value={remessaId} />
      <Retorno estado={estado} />

      {infracoes && !devolvendo && (
        <div className="border-warning/40 bg-warning/5 grid gap-1.5 rounded-md border p-3">
          <Label htmlFor="aplicar_descontos">
            {infracoes.quantidade} infração(ões) de trânsito pendente(s) do beneficiário ({infracoes.total})
          </Label>
          <select
            id="aplicar_descontos"
            name="aplicar_descontos"
            defaultValue="sim"
            className="border-input bg-background text-foreground h-9 rounded-md border px-3 text-sm shadow-xs outline-none"
          >
            <option value="sim">Descontar as infrações das diárias (até o limite de cada uma)</option>
            <option value="nao">Pagar as diárias cheias (não descontar)</option>
          </select>
        </div>
      )}

      {devolvendo && (
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="observacao">O que não está de acordo (obrigatório)</Label>
            <textarea
              id="observacao"
              name="observacao"
              rows={3}
              required
              autoFocus
              placeholder="Ex.: faltam os comprovantes de hospedagem; a diária de 12/10 não tem relatório da atividade"
              className={AREA}
            />
          </div>
          {diarias.length > 0 && (
            <div className="grid gap-2">
              <p className="text-sm font-medium">Diárias com não conformidade</p>
              <p className="text-muted-foreground -mt-1 text-xs">
                Marque as diárias com problema e diga o que corrigir em cada uma.
              </p>
              {diarias.map((d) => {
                const marcada = apontadas.has(d.id)
                return (
                  <div key={d.id} className="grid gap-1.5 rounded-md border p-2">
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={marcada}
                        onChange={(e) => {
                          const novo = new Set(apontadas)
                          if (e.target.checked) novo.add(d.id)
                          else novo.delete(d.id)
                          setApontadas(novo)
                        }}
                      />
                      <span>{d.rotulo}</span>
                    </label>
                    {marcada && (
                      <Input name={`pendencia_${d.id}`} placeholder="Não conformidade desta diária" required />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {devolvendo ? (
          <>
            <Button type="button" variant="ghost" onClick={() => setDevolvendo(false)} disabled={pendente}>
              Cancelar
            </Button>
            <Button type="submit" name="decisao" value="devolver" variant="outline" disabled={pendente}>
              {pendente ? <Loader2 className="animate-spin" /> : <Undo2 />}
              Devolver a remessa
            </Button>
          </>
        ) : (
          <>
            {/* Só há o que devolver com diária aguardando (as já aprovadas no
                fluxo antigo só esperam a ordem). */}
            {diarias.length > 0 && (
              <Button type="button" variant="outline" onClick={() => setDevolvendo(true)} disabled={pendente}>
                <Undo2 />
                Devolver com observação
              </Button>
            )}
            <Button type="submit" name="decisao" value="aprovar" disabled={pendente}>
              {pendente ? <Loader2 className="animate-spin" /> : <Check />}
              Aprovar a remessa
            </Button>
          </>
        )}
      </div>
    </form>
  )
}

/** Compacto (Aprovar pelo celular e área do coordenador): aprovar ou devolver com observação. */
export function DecisaoRemessaCompacta({ remessaId, resumo }: { remessaId: string; resumo: string }) {
  const [estado, formAction, pendente] = useActionState(avaliarRemessaAction, {})
  const [devolvendo, setDevolvendo] = useState(false)
  if (estado.ok) return <p className="text-success-fg text-xs font-medium">{estado.ok}</p>
  return (
    <form
      action={formAction}
      className="grid gap-2"
      onSubmit={(e) => {
        const decisao = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement)?.value
        if (decisao === "aprovar") confirmarEnvio(e, `Aprovar ${resumo}? Nasce a ordem de pagamento rateada — autorizada direto se a regra das diárias permitir; senão, vai para a fila de autorização.`)
      }}
    >
      <input type="hidden" name="remessa_id" value={remessaId} />
      {devolvendo && (
        <Input name="observacao" placeholder="O que não está de acordo (obrigatório)" className="min-h-10" autoFocus required />
      )}
      {estado.erro && <p className="text-destructive text-xs">{estado.erro}</p>}
      <div className="grid grid-cols-2 gap-2">
        {devolvendo ? (
          <Button type="submit" name="decisao" value="devolver" variant="outline" className="min-h-10" disabled={pendente}>
            {pendente ? <Loader2 className="animate-spin" /> : <Undo2 />}
            Confirmar devolução
          </Button>
        ) : (
          <Button type="button" variant="outline" className="min-h-10" onClick={() => setDevolvendo(true)} disabled={pendente}>
            <Undo2 />
            Devolver
          </Button>
        )}
        <Button type="submit" name="decisao" value="aprovar" className="min-h-10" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Check />}
          Aprovar remessa
        </Button>
      </div>
    </form>
  )
}

/** Reenvio da remessa devolvida, depois de corrigida. */
export function ReenviarRemessaForm({ remessaId }: { remessaId: string }) {
  const [estado, formAction, pendente] = useActionState(reenviarRemessaAction, {})
  if (estado.ok) return <Retorno estado={estado} />
  return (
    <form
      action={formAction}
      className="grid gap-2"
      onSubmit={(e) => confirmarEnvio(e, "Reenviar a remessa corrigida para avaliação?")}
    >
      <input type="hidden" name="remessa_id" value={remessaId} />
      <Retorno estado={estado} />
      <Input name="resposta" placeholder="O que foi corrigido (opcional)" />
      <Button type="submit" disabled={pendente} className="justify-self-start">
        {pendente ? <Loader2 className="animate-spin" /> : <Send />}
        Reenviar para avaliação
      </Button>
    </form>
  )
}

/** Retirar uma diária aguardando da remessa (quem gere as diárias). */
export function RetirarDiariaBotao({ remessaId, diariaId }: { remessaId: string; diariaId: string }) {
  const [estado, formAction, pendente] = useActionState(retirarDiariaRemessaAction, {})
  if (estado.ok) return <span className="text-success-fg text-xs">{estado.ok}</span>
  return (
    <form
      action={formAction}
      className="inline-flex items-center gap-1"
      onSubmit={(e) => confirmarEnvio(e, "Retirar esta diária da remessa? Ela fica cancelada.")}
    >
      <input type="hidden" name="remessa_id" value={remessaId} />
      <input type="hidden" name="diaria_id" value={diariaId} />
      <Button type="submit" variant="ghost" size="sm" className="text-destructive h-7 px-2 text-xs" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <X />}
        Retirar
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}

/** Envio da remessa em preparação para avaliação (quem lançou as diárias). */
export function EnviarRemessaBotao({
  remessaId,
  resumo,
  acao,
}: {
  remessaId: string
  /** Entra na confirmação (ex.: "3 diárias, R$ 640,00"). */
  resumo: string
  acao: (prev: EstadoForm, fd: FormData) => Promise<EstadoForm>
}) {
  const [estado, formAction, pendente] = useActionState(acao, {})
  if (estado.ok) return <Retorno estado={estado} />
  return (
    <form
      action={formAction}
      className="grid gap-2"
      onSubmit={(e) =>
        confirmarEnvio(e, {
          titulo: `Enviar a remessa para avaliação (${resumo})?`,
          descricao: "Depois de enviada ela entra na fila de quem avalia e não recebe mais diárias — uma diária nova abre outra remessa.",
          confirmar: "Enviar",
        })
      }
    >
      <input type="hidden" name="remessa_id" value={remessaId} />
      <Retorno estado={estado} />
      <Button type="submit" disabled={pendente} className="justify-self-start">
        {pendente ? <Loader2 className="animate-spin" /> : <Send />}
        Enviar para avaliação
      </Button>
    </form>
  )
}
