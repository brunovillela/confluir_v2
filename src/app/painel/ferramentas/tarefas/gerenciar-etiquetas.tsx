"use client"

import { useState, useTransition } from "react"
import { Loader2, Plus, Save, Tags, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { confirmar } from "@/components/ui/confirmacao"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { Etiqueta } from "@/lib/db/tarefa-extras"
import {
  CLASSES_COR_ETIQUETA,
  CORES_ETIQUETA,
  MAX_NOME_ETIQUETA,
  ROTULOS_COR_ETIQUETA,
  type CorEtiqueta,
} from "@/lib/nucleo-constantes"
import { cn } from "@/lib/utils"

import { criarEtiquetaAction, editarEtiquetaAction, excluirEtiquetaAction } from "./extras-actions"

const SELECT =
  "border-input bg-background text-foreground h-9 rounded-md border px-2 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

function SeletorCor({ valor, aoMudar, rotulo }: { valor: CorEtiqueta; aoMudar: (c: CorEtiqueta) => void; rotulo: string }) {
  return (
    <select value={valor} onChange={(e) => aoMudar(e.target.value as CorEtiqueta)} className={SELECT} aria-label={rotulo}>
      {CORES_ETIQUETA.map((c) => (
        <option key={c} value={c}>
          {ROTULOS_COR_ETIQUETA[c]}
        </option>
      ))}
    </select>
  )
}

function LinhaEtiqueta({ etiqueta, aoErro }: { etiqueta: Etiqueta; aoErro: (e: string | null) => void }) {
  const router = useRouter()
  const [nome, setNome] = useState(etiqueta.nome)
  const [cor, setCor] = useState<CorEtiqueta>(etiqueta.cor)
  const [pendente, iniciar] = useTransition()
  const mudou = nome.trim() !== etiqueta.nome || cor !== etiqueta.cor
  return (
    <li className="flex flex-wrap items-center gap-2">
      <span className={cn("w-24 truncate rounded px-1.5 py-1 text-center text-xs font-medium", CLASSES_COR_ETIQUETA[cor])}>
        {nome.trim() || "…"}
      </span>
      <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={MAX_NOME_ETIQUETA} className="h-9 min-w-0 flex-1" aria-label={`Nome da etiqueta ${etiqueta.nome}`} />
      <SeletorCor valor={cor} aoMudar={setCor} rotulo={`Cor da etiqueta ${etiqueta.nome}`} />
      <Button
        type="button"
        size="icon"
        variant="ghost"
        disabled={!mudou || pendente}
        aria-label={`Salvar a etiqueta ${etiqueta.nome}`}
        onClick={() =>
          iniciar(async () => {
            const r = await editarEtiquetaAction(etiqueta.id, nome, cor)
            aoErro(r.erro ?? null)
            if (!r.erro) router.refresh()
          })
        }
      >
        {pendente ? <Loader2 className="animate-spin" /> : <Save />}
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="text-destructive hover:text-destructive"
        disabled={pendente}
        aria-label={`Excluir a etiqueta ${etiqueta.nome}`}
        onClick={async () => {
          const sim = await confirmar({
            titulo: "Excluir a etiqueta?",
            descricao: `"${etiqueta.nome}" sai de todas as tarefas que a têm. As tarefas continuam.`,
            confirmar: "Excluir",
            destrutivo: true,
          })
          if (!sim) return
          iniciar(async () => {
            const r = await excluirEtiquetaAction(etiqueta.id)
            aoErro(r.erro ?? null)
            if (!r.erro) router.refresh()
          })
        }}
      >
        <Trash2 />
      </Button>
    </li>
  )
}

/** Criar, renomear, recolorir e excluir as etiquetas da entidade (quem cuida de Tarefas/Demandas). */
export function GerenciarEtiquetas({ etiquetas }: { etiquetas: Etiqueta[] }) {
  const router = useRouter()
  const [nome, setNome] = useState("")
  const [cor, setCor] = useState<CorEtiqueta>("azul")
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Tags />
          Etiquetas
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Etiquetas das tarefas</DialogTitle>
          <DialogDescription>
            Rótulos coloridos para agrupar e filtrar as tarefas. Escolha as etiquetas de cada tarefa no lápis dela.
          </DialogDescription>
        </DialogHeader>
        {etiquetas.length > 0 ? (
          <ul className="grid max-h-[45vh] gap-2 overflow-y-auto">
            {etiquetas.map((e) => (
              <LinhaEtiqueta key={`${e.id}-${e.nome}-${e.cor}`} etiqueta={e} aoErro={setErro} />
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">Nenhuma etiqueta ainda.</p>
        )}
        <form
          className="flex flex-wrap items-center gap-2 border-t pt-3"
          onSubmit={(e) => {
            e.preventDefault()
            iniciar(async () => {
              const r = await criarEtiquetaAction(nome, cor)
              setErro(r.erro ?? null)
              if (!r.erro) {
                setNome("")
                router.refresh()
              }
            })
          }}
        >
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={MAX_NOME_ETIQUETA}
            placeholder="Nova etiqueta (ex.: Jurídico)"
            aria-label="Nome da nova etiqueta"
            className="h-9 min-w-0 flex-1"
          />
          <SeletorCor valor={cor} aoMudar={setCor} rotulo="Cor da nova etiqueta" />
          <Button type="submit" size="sm" disabled={pendente || !nome.trim()}>
            {pendente ? <Loader2 className="animate-spin" /> : <Plus />}
            Criar
          </Button>
        </form>
        {erro && <p className="text-destructive text-sm">{erro}</p>}
      </DialogContent>
    </Dialog>
  )
}
