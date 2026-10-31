"use client"

import { createContext, useActionState, useContext, useMemo, useState } from "react"
import Link from "next/link"
import { Banknote, FileOutput, Loader2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"
import type { EstadoForm } from "@/lib/contas"
import { formatarMoeda } from "@/lib/formato"

import { pagarOrdensEmLoteAction } from "./[id]/actions"

type Selecao = {
  marcadas: Map<string, number>
  alternar: (id: string, valor: number) => void
  definir: (itens: { id: string; valor: number }[], marcar: boolean) => void
  limpar: () => void
}

const Contexto = createContext<Selecao | null>(null)

/** Seleção de ordens do extrato (ordens "A pagar"/"Processando"). */
export function SelecaoExtrato({ children }: { children: React.ReactNode }) {
  const [marcadas, setMarcadas] = useState<Map<string, number>>(new Map())
  const valor = useMemo<Selecao>(
    () => ({
      marcadas,
      alternar: (id, v) =>
        setMarcadas((m) => {
          const n = new Map(m)
          if (n.has(id)) n.delete(id)
          else n.set(id, v)
          return n
        }),
      definir: (itens, marcar) =>
        setMarcadas((m) => {
          const n = new Map(m)
          for (const i of itens) {
            if (marcar) n.set(i.id, i.valor)
            else n.delete(i.id)
          }
          return n
        }),
      limpar: () => setMarcadas(new Map()),
    }),
    [marcadas]
  )
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

function useSelecao(): Selecao | null {
  return useContext(Contexto)
}

export function MarcarOrdem({ id, valor, rotulo }: { id: string; valor: number; rotulo: string }) {
  const s = useSelecao()
  if (!s) return null
  return (
    <input
      type="checkbox"
      className="size-4 cursor-pointer"
      aria-label={`Marcar ${rotulo}`}
      checked={s.marcadas.has(id)}
      onChange={() => s.alternar(id, valor)}
    />
  )
}

/** Marca/desmarca todas as ordens pagáveis de um dia. */
export function MarcarDia({ itens, rotulo }: { itens: { id: string; valor: number }[]; rotulo: string }) {
  const s = useSelecao()
  if (!s || itens.length === 0) return null
  const todas = itens.every((i) => s.marcadas.has(i.id))
  return (
    <input
      type="checkbox"
      className="size-4 cursor-pointer"
      aria-label={`Marcar todas de ${rotulo}`}
      checked={todas}
      onChange={() => s.definir(itens, !todas)}
    />
  )
}

/**
 * Barra fixa com as marcadas: gerar a remessa (abre a nova remessa só com
 * elas) ou registrar o pagamento de todas numa data e conta de débito.
 */
export function BarraSelecao({ debitos, hoje }: { debitos: { id: string; nome: string }[]; hoje: string }) {
  const s = useSelecao()
  const [pagando, setPagando] = useState(false)
  // Pagou: a seleção e o formulário fecham ali mesmo (a lista vem atualizada).
  const [estado, acao, enviando] = useActionState<EstadoForm, FormData>(async (prev, fd) => {
    const r = await pagarOrdensEmLoteAction(prev, fd)
    if (r.ok) {
      s?.limpar()
      setPagando(false)
    }
    return r
  }, {})
  const envio = useEnvioFormulario(acao, estado)

  if (!s) return null
  const ids = [...s.marcadas.keys()]
  const total = Math.round([...s.marcadas.values()].reduce((a, v) => a + v, 0) * 100) / 100
  if (ids.length === 0) {
    return estado.ok || estado.erro ? (
      <div className="bg-card sticky bottom-3 z-20 flex items-center gap-2 rounded-xl border p-3 text-sm shadow-lg">
        <span className={estado.erro ? "text-destructive" : "text-success-fg"}>{estado.erro ?? estado.ok}</span>
      </div>
    ) : null
  }
  return (
    <div className="bg-card sticky bottom-3 z-20 grid gap-3 rounded-xl border p-3 shadow-lg">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">
          {ids.length} marcada{ids.length > 1 ? "s" : ""} · {formatarMoeda(total)}
        </span>
        <span className="flex-1" />
        <Button variant="outline" size="sm" asChild>
          <Link href={`/painel/financeiro/remessas/nova?ordens=${ids.join(",")}`}>
            <FileOutput />
            Gerar remessa
          </Link>
        </Button>
        <Button size="sm" onClick={() => setPagando((p) => !p)} variant={pagando ? "secondary" : "default"}>
          <Banknote />
          Registrar pagamento
        </Button>
        <Button size="sm" variant="ghost" onClick={s.limpar} aria-label="Desmarcar todas">
          <X />
        </Button>
      </div>
      {pagando && (
        <form action={acao} {...envio} className="flex flex-wrap items-end gap-2 border-t pt-3">
          <input type="hidden" name="ordens" value={ids.join(",")} />
          <label className="grid gap-1 text-xs">
            Data do pagamento
            <Input type="date" name="data_pagamento" defaultValue={hoje} className="h-9 w-40" />
          </label>
          <label className="grid min-w-56 flex-1 gap-1 text-xs">
            Conta de onde o dinheiro saiu
            <select
              name="centro_custo_receita_id"
              defaultValue=""
              className="border-input bg-background h-9 rounded-md border px-2 text-sm [color-scheme:light] dark:[color-scheme:dark]"
            >
              <option value="" disabled>
                Escolha a conta de débito…
              </option>
              {debitos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" size="sm" disabled={enviando}>
            {enviando ? <Loader2 className="animate-spin" /> : <Banknote />}
            Pagar {ids.length} · {formatarMoeda(total)}
          </Button>
          <p className="text-muted-foreground w-full text-xs">
            Cada ordem é paga pelo valor cobrado, com as mesmas travas do pagamento individual (mês fechado, caixa, conta de
            débito). O comprovante, se houver, entra depois em cada ordem.
          </p>
        </form>
      )}
      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
    </div>
  )
}
