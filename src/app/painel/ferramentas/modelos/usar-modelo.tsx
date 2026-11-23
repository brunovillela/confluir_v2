"use client"

import { useActionState, useState } from "react"
import { LayoutTemplate, Loader2, Save } from "lucide-react"

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
import { Label } from "@/components/ui/label"
import { type EstadoForm } from "@/lib/contas"

import {
  aplicarModeloNaDemandaAction,
  aplicarModeloNoProjetoAction,
  novaDemandaDoModeloAction,
  salvarComoModeloAction,
} from "./actions"
import { SELECT } from "./modelos-forms"

type Opcao = { id: string; nome: string }
const DATA = "[color-scheme:light] dark:[color-scheme:dark]"

/**
 * Usar um modelo: nova demanda, aplicar numa demanda ou num projeto. A data
 * de referência é o dia a partir do qual os prazos do modelo são contados.
 */
export function UsarModelo({
  modo,
  modelos,
  pessoas = [],
  alvoId,
}: {
  modo: "nova_demanda" | "demanda" | "projeto"
  modelos: Opcao[]
  pessoas?: Opcao[]
  alvoId?: string
}) {
  const [aberto, setAberto] = useState(false)
  const acao = modo === "nova_demanda" ? novaDemandaDoModeloAction : modo === "demanda" ? aplicarModeloNaDemandaAction : aplicarModeloNoProjetoAction
  const [estado, enviar, enviando] = useActionState<EstadoForm, FormData>(acao, {})
  const titulo = modo === "nova_demanda" ? "Nova demanda a partir de modelo" : "Aplicar modelo"
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <LayoutTemplate />
          {modo === "nova_demanda" ? "Nova a partir de modelo" : "Aplicar modelo"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>
            {modo === "projeto"
              ? "Cria os marcos e as tarefas do modelo neste projeto, com os prazos contados a partir da data de referência."
              : "Cria as tarefas do modelo com os prazos contados a partir da data de referência (o dia do evento ou da entrega)."}
          </DialogDescription>
        </DialogHeader>
        {modelos.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nenhum modelo {modo === "projeto" ? "de projeto" : "de demanda"} ainda. Crie em Ferramentas → Modelos e pedidos.
          </p>
        ) : (
          <form action={enviar} className="grid gap-3">
            {modo === "demanda" && <input type="hidden" name="demanda_id" value={alvoId} />}
            {modo === "projeto" && <input type="hidden" name="projeto_id" value={alvoId} />}
            <div className="grid gap-1.5">
              <Label htmlFor={`modelo-${modo}`}>Modelo</Label>
              <select id={`modelo-${modo}`} name="modelo_id" required defaultValue="" className={SELECT}>
                <option value="">Escolha…</option>
                {modelos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </div>
            {modo === "nova_demanda" && (
              <div className="grid gap-1.5">
                <Label htmlFor="nome-modelo-demanda">Nome da demanda</Label>
                <Input id="nome-modelo-demanda" name="nome" required maxLength={200} />
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor={`referencia-${modo}`}>Data de referência</Label>
                <Input id={`referencia-${modo}`} name="referencia" type="date" required className={DATA} />
              </div>
              {modo !== "projeto" && (
                <div className="grid gap-1.5">
                  <Label htmlFor={`responsavel-${modo}`}>Responsável pelas tarefas</Label>
                  <select id={`responsavel-${modo}`} name="responsavel_id" defaultValue="" className={SELECT}>
                    <option value="">Ninguém por enquanto</option>
                    {pessoas.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={enviando}>
                {enviando ? <Loader2 className="animate-spin" /> : <LayoutTemplate />}
                {modo === "nova_demanda" ? "Criar demanda" : "Aplicar"}
              </Button>
              {estado.erro && <span className="text-destructive text-sm">{estado.erro}</span>}
              {estado.ok && <span className="text-success-fg text-sm">{estado.ok}</span>}
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** "Salvar como modelo": as tarefas da demanda viram um modelo novo. */
export function SalvarComoModelo({ demandaId, nomeSugerido }: { demandaId: string; nomeSugerido: string }) {
  const [estado, enviar, enviando] = useActionState<EstadoForm, FormData>(salvarComoModeloAction, {})
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Save />
          Salvar como modelo
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Salvar como modelo</DialogTitle>
          <DialogDescription>
            As tarefas desta demanda viram um modelo, com o prazo de cada uma contado a partir do prazo da demanda (ou do último prazo
            das tarefas), o checklist e o procedimento.
          </DialogDescription>
        </DialogHeader>
        <form action={enviar} className="grid gap-3">
          <input type="hidden" name="demanda_id" value={demandaId} />
          <div className="grid gap-1.5">
            <Label htmlFor="nome-novo-modelo">Nome do modelo</Label>
            <Input id="nome-novo-modelo" name="nome" required maxLength={120} defaultValue={nomeSugerido} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={enviando}>
              {enviando ? <Loader2 className="animate-spin" /> : <Save />}
              Salvar modelo
            </Button>
            {estado.erro && <span className="text-destructive text-sm">{estado.erro}</span>}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
