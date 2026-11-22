"use client"

import { useEffect, useState, useTransition } from "react"
import { ListChecks, Loader2, Plus, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { ItemChecklist } from "@/lib/db/tarefa-extras"
import { MAX_ITEM_CHECKLIST } from "@/lib/nucleo-constantes"
import { cn } from "@/lib/utils"

import { adicionarItemAction, carregarChecklistAction, excluirItemAction, marcarItemAction } from "./extras-actions"

/**
 * Checklist da tarefa: o botão mostra o progresso (2/5) e abre a janela com os
 * itens — marcar, adicionar e excluir. Quem só vê a tarefa vê a lista sem
 * poder mexer.
 */
export function ChecklistTarefa({
  tarefaId,
  titulo,
  total = 0,
  feitos = 0,
}: {
  tarefaId: string
  titulo: string | null
  total?: number
  feitos?: number
}) {
  const router = useRouter()
  const [aberta, setAberta] = useState(false)
  const [itens, setItens] = useState<ItemChecklist[] | null>(null)
  const [mexe, setMexe] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [novo, setNovo] = useState("")
  const [pendente, iniciar] = useTransition()
  const [mudou, setMudou] = useState(false)

  async function recarregar() {
    const r = await carregarChecklistAction(tarefaId)
    if (r.erro) setErro(r.erro)
    else {
      setErro(null)
      setItens(r.itens ?? [])
      setMexe(Boolean(r.mexe))
    }
  }

  useEffect(() => {
    if (!aberta) return
    let vivo = true
    carregarChecklistAction(tarefaId).then((r) => {
      if (!vivo) return
      if (r.erro) setErro(r.erro)
      else {
        setErro(null)
        setItens(r.itens ?? [])
        setMexe(Boolean(r.mexe))
      }
    })
    return () => {
      vivo = false
    }
  }, [aberta, tarefaId])

  function executar(acao: () => Promise<{ erro?: string }>) {
    iniciar(async () => {
      const r = await acao()
      if (r.erro) setErro(r.erro)
      else setMudou(true)
      await recarregar()
    })
  }

  const t = itens ? itens.length : total
  const f = itens ? itens.filter((i) => i.feito).length : feitos

  return (
    <Dialog
      open={aberta}
      onOpenChange={(v) => {
        setAberta(v)
        // Ao fechar, a lista atualiza o progresso dos cartões.
        if (!v && mudou) {
          setMudou(false)
          router.refresh()
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          title={t ? `Checklist: ${f} de ${t} feitos` : "Checklist da tarefa"}
          aria-label={t ? `Checklist da tarefa, ${f} de ${t} feitos` : "Checklist da tarefa"}
        >
          <ListChecks />
          {t > 0 && <span className={cn("text-xs tabular-nums", f === t && "text-success-fg")}>{f}/{t}</span>}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Checklist</DialogTitle>
          <DialogDescription className="line-clamp-2">{titulo ?? "(sem título)"}</DialogDescription>
        </DialogHeader>

        {itens === null && !erro ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" /> Carregando…
          </p>
        ) : (
          <div className="grid gap-3">
            {itens && itens.length > 0 && (
              <>
                <div className="bg-muted h-1.5 overflow-hidden rounded-full" aria-hidden>
                  <div className="bg-primary h-full transition-all" style={{ width: `${(f / t) * 100}%` }} />
                </div>
                <ul className="grid max-h-[45vh] gap-1 overflow-y-auto" aria-label="Itens do checklist">
                  {itens.map((i) => (
                    <li key={i.id} className="hover:bg-muted/50 flex items-center gap-2 rounded px-1 py-1 text-sm">
                      <input
                        type="checkbox"
                        checked={i.feito}
                        disabled={!mexe || pendente}
                        onChange={(e) => {
                          const feito = e.currentTarget.checked
                          setItens((l) => l?.map((x) => (x.id === i.id ? { ...x, feito } : x)) ?? null)
                          executar(() => marcarItemAction(i.id, feito))
                        }}
                        aria-label={i.texto}
                        className="size-4 shrink-0"
                      />
                      <span className={cn("min-w-0 flex-1", i.feito && "text-muted-foreground line-through")}>{i.texto}</span>
                      {mexe && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive size-7"
                          aria-label={`Excluir o item ${i.texto}`}
                          disabled={pendente}
                          onClick={() => executar(() => excluirItemAction(i.id))}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {itens && itens.length === 0 && (
              <p className="text-muted-foreground text-sm">
                Nenhum item ainda. Quebre a tarefa em passos marcáveis, como &quot;pedir 3 orçamentos&quot;.
              </p>
            )}
            {mexe && (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  const textoItem = novo.trim()
                  if (!textoItem) return
                  setNovo("")
                  executar(() => adicionarItemAction(tarefaId, textoItem))
                }}
              >
                <Input
                  value={novo}
                  onChange={(e) => setNovo(e.target.value)}
                  maxLength={MAX_ITEM_CHECKLIST}
                  placeholder="Novo item"
                  aria-label="Novo item do checklist"
                />
                <Button type="submit" size="sm" disabled={pendente || !novo.trim()}>
                  {pendente ? <Loader2 className="animate-spin" /> : <Plus />}
                  Adicionar
                </Button>
              </form>
            )}
            {erro && <p className="text-destructive text-sm">{erro}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
