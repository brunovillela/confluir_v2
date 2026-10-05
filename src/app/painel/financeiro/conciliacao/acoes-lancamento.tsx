"use client"

import { useActionState, useState } from "react"
import { Ban, Check, Link2, Loader2, PlusCircle, Trash2, Undo2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { Input } from "@/components/ui/input"
import { type EstadoForm } from "@/lib/contas"
import type { Cobranca } from "@/lib/db/cobrancas"
import type { CandidataComprovacao, CandidataOrdem } from "@/lib/db/conciliacao"
import { formatarData, formatarMoeda } from "@/lib/formato"

import {
  conciliarCobrancaAction,
  conciliarComprovacaoAction,
  conciliarOrdemAction,
  criarComprovacaoAction,
  desfazerAction,
  excluirExtratoAction,
  ignorarLancamentoAction,
} from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 max-w-full rounded-md border px-2 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

function Recado({ estado }: { estado: EstadoForm }) {
  if (estado.erro) return <span className="text-destructive text-xs">{estado.erro}</span>
  if (estado.ok) return <span className="text-success-fg text-xs">{estado.ok}</span>
  return null
}

/** As candidatas de um lançamento pendente: casar com uma, criar depósito ou ignorar. */
export function AcoesLancamento({
  lancamentoId,
  valor,
  ordens,
  comprovacoes,
  cobrancas,
  remessas,
  fontes,
  podeEscrever,
}: {
  lancamentoId: string
  valor: number
  ordens: CandidataOrdem[]
  comprovacoes: CandidataComprovacao[]
  cobrancas: { porTxid: boolean; lista: Cobranca[] }
  remessas: { id: string; rotulo: string }[]
  fontes: { id: string; nome: string }[]
  podeEscrever: boolean
}) {
  const [eOrdem, aOrdem, pOrdem] = useActionState(conciliarOrdemAction, {})
  const [eComp, aComp, pComp] = useActionState(conciliarComprovacaoAction, {})
  const [eCob, aCob, pCob] = useActionState(conciliarCobrancaAction, {})
  const [eCriar, aCriar, pCriar] = useActionState(criarComprovacaoAction, {})
  const [eIgn, aIgn, pIgn] = useActionState(ignorarLancamentoAction, {})
  const [criando, setCriando] = useState(false)
  const [ignorando, setIgnorando] = useState(false)
  if (!podeEscrever) return <span className="text-muted-foreground text-xs">Só leitura</span>

  return (
    <div className="grid gap-2">
      {ordens.map((o) => (
        <form key={o.id} action={aOrdem} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="lancamento_id" value={lancamentoId} />
          <input type="hidden" name="ordem_id" value={o.id} />
          <Button type="submit" size="sm" variant="outline" disabled={pOrdem}>
            {pOrdem ? <Loader2 className="animate-spin" /> : <Link2 />}
            Ordem {o.codigo ?? ""}
          </Button>
          <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
            {formatarMoeda(o.valorPago)} · {o.dataPagamento ? formatarData(o.dataPagamento) : "sem data"} · {o.favorecido ?? "—"}
            {o.descricao ? ` · ${o.descricao.slice(0, 60)}` : ""}
          </span>
        </form>
      ))}
      <Recado estado={eOrdem} />
      {comprovacoes.map((c) => (
        <form key={c.id} action={aComp} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="lancamento_id" value={lancamentoId} />
          <input type="hidden" name="comprovacao_id" value={c.id} />
          <Button type="submit" size="sm" variant="outline" disabled={pComp}>
            {pComp ? <Loader2 className="animate-spin" /> : <Link2 />}
            Depósito {c.fonte}
          </Button>
          <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
            {c.remessaRotulo} · {formatarMoeda(c.valor)} · {c.data ? formatarData(c.data) : "sem data"}
          </span>
        </form>
      ))}
      <Recado estado={eComp} />
      {cobrancas.lista.map((c) => (
        <form key={c.id} action={aCob} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="lancamento_id" value={lancamentoId} />
          <input type="hidden" name="cobranca_id" value={c.id} />
          <Button type="submit" size="sm" variant={cobrancas.porTxid ? "default" : "outline"} disabled={pCob}>
            {pCob ? <Loader2 className="animate-spin" /> : <Link2 />}
            Contribuição {c.competencia.slice(5, 7)}/{c.competencia.slice(0, 4)}
          </Button>
          <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
            {c.nome ?? c.cpf ?? "filiado"} · {formatarMoeda(c.valor)} · vence {formatarData(c.vencimento)}{cobrancas.porTxid ? " · txid no extrato" : ""}
          </span>
        </form>
      ))}
      <Recado estado={eCob} />

      <div className="flex flex-wrap items-center gap-2">
        {valor > 0 && !criando && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setCriando(true)}>
            <PlusCircle />
            Registrar como depósito de fonte
          </Button>
        )}
        {!ignorando && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setIgnorando(true)}>
            <Ban />
            Ignorar
          </Button>
        )}
      </div>
      {criando && (
        <form action={aCriar} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="lancamento_id" value={lancamentoId} />
          <select name="remessa_id" defaultValue="" className={SELECT} required>
            <option value="" disabled>
              Remessa…
            </option>
            {remessas.map((r) => (
              <option key={r.id} value={r.id}>
                {r.rotulo}
              </option>
            ))}
          </select>
          <select name="fonte_id" defaultValue="" className={SELECT} required>
            <option value="" disabled>
              Fonte pagadora…
            </option>
            {fontes.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" disabled={pCriar}>
            {pCriar ? <Loader2 className="animate-spin" /> : <Check />}
            Registrar {formatarMoeda(valor)}
          </Button>
          <Recado estado={eCriar} />
        </form>
      )}
      {ignorando && (
        <form action={aIgn} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="lancamento_id" value={lancamentoId} />
          <Input name="motivo" placeholder="Por quê? (tarifa, transferência interna…)" className="h-9 w-64" />
          <Button type="submit" size="sm" variant="outline" disabled={pIgn}>
            {pIgn ? <Loader2 className="animate-spin" /> : <Ban />}
            Confirmar
          </Button>
          <Recado estado={eIgn} />
        </form>
      )}
    </div>
  )
}

export function DesfazerBotao({ lancamentoId }: { lancamentoId: string }) {
  const [estado, action, pendente] = useActionState(desfazerAction, {})
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="lancamento_id" value={lancamentoId} />
      <Button type="submit" size="sm" variant="ghost" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Undo2 />}
        Desfazer
      </Button>
      <Recado estado={estado} />
    </form>
  )
}

export function ExcluirExtratoBotao({ extratoId, nome }: { extratoId: string; nome: string }) {
  const [estado, action, pendente] = useActionState(excluirExtratoAction, {})
  return (
    <form action={action} className="flex items-center gap-2" onSubmit={(e) => confirmarEnvio(e, `Excluir o extrato "${nome}" e todos os lançamentos dele? As conciliações automáticas desse arquivo se desfazem.`)}>
      <input type="hidden" name="extrato_id" value={extratoId} />
      <Button type="submit" size="sm" variant="ghost" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
        Excluir
      </Button>
      <Recado estado={estado} />
    </form>
  )
}
