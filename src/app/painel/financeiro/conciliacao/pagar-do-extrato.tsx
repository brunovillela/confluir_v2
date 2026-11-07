"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { Banknote, Loader2, XCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { atribuirOrdens, PONTOS_CONFIANCA } from "@/lib/comprovantes-casamento"
import type { OrdemResumo } from "@/lib/db/comprovantes-distribuicao"
import type { DebitoParaPagar } from "@/lib/db/conciliacao-pagar"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { cn } from "@/lib/utils"

import { pagarPeloExtratoAction } from "./actions"

const SELECT =
  "border-input bg-background h-9 w-full truncate rounded-md border px-2 text-sm [color-scheme:light] dark:[color-scheme:dark]"

function confianca(pontos: number): { rotulo: string; classe: string } {
  if (pontos >= 100) return { rotulo: "alta", classe: "text-success-fg" }
  if (pontos >= PONTOS_CONFIANCA) return { rotulo: "média", classe: "text-info-fg" }
  return { rotulo: "baixa", classe: "text-warning-fg" }
}

/**
 * Débitos do extrato sem ordem paga: sugere a ordem a pagar de cada um e paga
 * as marcadas de uma vez (data e valor do extrato), conciliando.
 */
export function PagarDoExtrato({
  itens,
  ordens,
  debitos,
  centroSugerido,
}: {
  itens: DebitoParaPagar[]
  ordens: Record<string, OrdemResumo>
  debitos: { id: string; nome: string }[]
  centroSugerido: string | null
}) {
  const inicial = useMemo(
    () => atribuirOrdens(itens.map((i) => ({ chave: i.lancamento.id, sugestoes: i.sugestoes }))),
    [itens]
  )
  const [escolha, setEscolha] = useState<Record<string, string | null>>({})
  const [desmarcados, setDesmarcados] = useState<Set<string>>(new Set())
  const [erros, setErros] = useState<Record<string, string>>({})
  const [aviso, setAviso] = useState<string | null>(null)
  const [conta, setConta] = useState(centroSugerido && debitos.some((d) => d.id === centroSugerido) ? centroSugerido : "")
  const [enviando, iniciar] = useTransition()

  const ordemDe = (id: string) => (id in escolha ? escolha[id] : (inicial.get(id) ?? null))
  const escolhidas = itens.map((i) => ordemDe(i.lancamento.id)).filter((v): v is string => !!v)
  const repetidas = new Set(escolhidas.filter((v, i, a) => a.indexOf(v) !== i))
  const marcados = itens.filter((i) => {
    const o = ordemDe(i.lancamento.id)
    return o && !repetidas.has(o) && !desmarcados.has(i.lancamento.id)
  })
  const total = marcados.reduce((s, i) => s + Math.abs(i.lancamento.valor), 0)

  function pagar(lista: DebitoParaPagar[]) {
    iniciar(async () => {
      const rs = await pagarPeloExtratoAction(
        lista.map((i) => ({ lancamentoId: i.lancamento.id, ordemId: ordemDe(i.lancamento.id)! })),
        conta
      )
      const ok = rs.filter((r) => r.ok).length
      setErros((e) => ({ ...e, ...Object.fromEntries(rs.filter((r) => !r.ok).map((r) => [r.lancamentoId, r.erro ?? "erro"])) }))
      setAviso(ok ? `${ok} ${ok > 1 ? "ordens" : "ordem"} paga${ok > 1 ? "s" : ""} e conciliada${ok > 1 ? "s" : ""}.` : null)
    })
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid min-w-64 flex-1 gap-1 text-xs">
          Conta de onde o dinheiro saiu
          <select value={conta} onChange={(e) => setConta(e.target.value)} className={SELECT}>
            <option value="">Escolha a conta de débito…</option>
            {debitos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
              </option>
            ))}
          </select>
        </label>
        <Button onClick={() => pagar(marcados)} disabled={enviando || !conta || marcados.length === 0}>
          {enviando ? <Loader2 className="animate-spin" /> : <Banknote />}
          Pagar e conciliar {marcados.length} · {formatarMoeda(total)}
        </Button>
      </div>
      {aviso && <p className="text-success-fg text-sm">{aviso}</p>}
      <ul className="divide-y">
        {itens.map((i) => {
          const id = i.lancamento.id
          const ordemId = ordemDe(id)
          const s = i.sugestoes.find((x) => x.ordemId === ordemId)
          const repetida = ordemId && repetidas.has(ordemId)
          const ordem = ordemId ? ordens[ordemId] : null
          return (
            <li key={id} className="grid gap-2 py-3 lg:grid-cols-[2rem_9rem_minmax(0,1fr)_minmax(0,1.4fr)] lg:items-start">
              <input
                type="checkbox"
                className="mt-1 size-4"
                aria-label="Marcar para pagar"
                disabled={!ordemId}
                checked={!!ordemId && !desmarcados.has(id) && !repetida}
                onChange={() =>
                  setDesmarcados((d) => {
                    const n = new Set(d)
                    if (n.has(id)) n.delete(id)
                    else n.add(id)
                    return n
                  })
                }
              />
              <div>
                <p className="text-base font-semibold tabular-nums">{formatarMoeda(i.lancamento.valor)}</p>
                <p className="text-muted-foreground text-xs">{formatarData(i.lancamento.data)}</p>
              </div>
              <p className="min-w-0 text-sm">
                {i.lancamento.descricao ?? "(sem descrição)"}
                {i.lancamento.tipo && <span className="text-muted-foreground block text-xs">{i.lancamento.tipo}</span>}
              </p>
              <div className="grid min-w-0 gap-1">
                <select
                  value={ordemId ?? ""}
                  onChange={(e) => {
                    setEscolha((x) => ({ ...x, [id]: e.target.value || null }))
                    setDesmarcados((d) => {
                      const n = new Set(d)
                      n.delete(id)
                      return n
                    })
                  }}
                  className={SELECT}
                  aria-label="Ordem a pagar"
                >
                  <option value="">— não pagar por aqui —</option>
                  {i.sugestoes.map((x) => {
                    const o = ordens[x.ordemId]
                    if (!o) return null
                    return (
                      <option key={x.ordemId} value={x.ordemId}>
                        {[o.codigo, o.favorecido ?? o.descricao, formatarMoeda(o.valor), o.situacao].filter(Boolean).join(" · ")} ({confianca(x.pontos).rotulo})
                      </option>
                    )
                  })}
                </select>
                {s && (
                  <p className="text-xs">
                    <span className={cn("font-medium", confianca(s.pontos).classe)}>Confiança {confianca(s.pontos).rotulo}</span>
                    <span className="text-muted-foreground"> · {s.motivos.join(", ") || "poucos sinais"}</span>
                    {ordem?.vencimento ? <span className="text-muted-foreground"> · vence {formatarData(ordem.vencimento)}</span> : null}
                    {ordem && (
                      <>
                        {" · "}
                        <Link href={`/painel/financeiro/ordens/${ordem.id}`} className="underline" target="_blank">
                          abrir
                        </Link>
                      </>
                    )}
                  </p>
                )}
                {repetida && <p className="text-destructive text-xs">Esta ordem foi escolhida para outro lançamento também.</p>}
                {erros[id] && (
                  <p className="text-destructive flex items-center gap-1 text-xs">
                    <XCircle className="size-3.5 shrink-0" />
                    {erros[id]}
                  </p>
                )}
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={enviando || !conta || !ordemId || !!repetida}
                    title={!conta ? "Escolha a conta de débito acima" : undefined}
                    onClick={() => pagar([i])}
                  >
                    Pagar este
                  </Button>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
