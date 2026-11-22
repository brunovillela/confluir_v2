"use client"

import { startTransition, useOptimistic, useState, type DragEvent, type ReactNode } from "react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

export type ColunaQuadro = { id: string; titulo: string; rodape?: ReactNode }

type Resultado = { ok?: string; erro?: string }

/**
 * Quadro em colunas (estilo Trello): cartões que se arrastam entre colunas
 * com o mouse e, para teclado e celular, o menu "Mover para" de cada cartão.
 * A mudança aparece na hora (otimista) e volta se o servidor recusar.
 * `confirmar` pode pedir confirmação antes (ex.: Feito com tarefas abertas).
 */
export function Quadro<T extends { id: string }>({
  colunas,
  itens,
  colunaDe,
  cartao,
  mover,
  podeMover = () => true,
  confirmar,
  vazio = "Nada aqui.",
  rotulo,
}: {
  colunas: ColunaQuadro[]
  itens: T[]
  colunaDe: (item: T) => string
  cartao: (item: T) => ReactNode
  mover: (id: string, coluna: string) => Promise<Resultado>
  podeMover?: (item: T) => boolean
  confirmar?: (item: T, destino: string) => Promise<boolean>
  vazio?: string
  /** Nome do que está no quadro, para leitores de tela ("tarefa", "demanda"). */
  rotulo: string
}) {
  const [posicoes, mudarPosicao] = useOptimistic(
    new Map(itens.map((i) => [i.id, colunaDe(i)])),
    (atual: Map<string, string>, { id, coluna }: { id: string; coluna: string }) => new Map(atual).set(id, coluna)
  )
  const [sobre, setSobre] = useState<string | null>(null)
  const porId = new Map(itens.map((i) => [i.id, i]))

  async function moverPara(item: T, destino: string) {
    if (posicoes.get(item.id) === destino) return
    if (confirmar && !(await confirmar(item, destino))) return
    startTransition(async () => {
      mudarPosicao({ id: item.id, coluna: destino })
      const r = await mover(item.id, destino)
      if (r.erro) toast.error(r.erro)
      else if (r.ok && r.ok.includes("próxima")) toast.success(r.ok)
    })
  }

  function soltar(e: DragEvent, destino: string) {
    e.preventDefault()
    setSobre(null)
    const item = porId.get(e.dataTransfer.getData("text/plain"))
    if (item && podeMover(item)) void moverPara(item, destino)
  }

  return (
    <div className="grid gap-4 md:grid-cols-[repeat(var(--colunas),minmax(0,1fr))]" style={{ ["--colunas" as string]: colunas.length }}>
      {colunas.map((c) => {
        const daColuna = itens.filter((i) => posicoes.get(i.id) === c.id)
        return (
          <section
            key={c.id}
            aria-label={`${c.titulo}: ${daColuna.length}`}
            onDragOver={(e) => {
              e.preventDefault()
              if (sobre !== c.id) setSobre(c.id)
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSobre(null)
            }}
            onDrop={(e) => soltar(e, c.id)}
            className={cn(
              "bg-muted/40 flex min-h-40 flex-col gap-2 rounded-lg border p-2 transition-colors",
              sobre === c.id && "border-primary/60 bg-primary/5"
            )}
          >
            <h2 className="flex items-center justify-between px-1 pt-1 text-sm font-medium">
              {c.titulo}
              <span className="text-muted-foreground text-xs font-normal tabular-nums">{daColuna.length}</span>
            </h2>
            {daColuna.length === 0 ? (
              <p className="text-muted-foreground px-1 py-4 text-center text-xs">{vazio}</p>
            ) : (
              <ul className="grid gap-2">
                {daColuna.map((item) => {
                  const movivel = podeMover(item)
                  return (
                    <li
                      key={item.id}
                      draggable={movivel}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", item.id)
                        e.dataTransfer.effectAllowed = "move"
                      }}
                      className={cn(
                        "bg-card grid gap-2 rounded-md border p-2.5 text-sm shadow-xs",
                        movivel && "cursor-grab active:cursor-grabbing"
                      )}
                    >
                      {cartao(item)}
                      {movivel && (
                        <select
                          aria-label={`Mover ${rotulo} para`}
                          value=""
                          onChange={(e) => {
                            const destino = e.currentTarget.value
                            e.currentTarget.value = ""
                            if (destino) void moverPara(item, destino)
                          }}
                          className="text-muted-foreground border-input bg-background h-7 w-full rounded border px-1.5 text-xs [color-scheme:light] dark:[color-scheme:dark]"
                        >
                          <option value="">Mover para…</option>
                          {colunas
                            .filter((o) => o.id !== c.id)
                            .map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.titulo}
                              </option>
                            ))}
                        </select>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
            {c.rodape}
          </section>
        )
      })}
    </div>
  )
}
