"use client"

import { useActionState, useState, useTransition } from "react"
import { Loader2, Plus, Save, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { confirmar } from "@/components/ui/confirmacao"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { type EstadoForm } from "@/lib/contas"
import { PRIORIDADES_TAREFA, ROTULOS_PRIORIDADE_TAREFA } from "@/lib/nucleo-constantes"

import {
  adicionarItemModeloAction,
  criarModeloAction,
  editarModeloAction,
  excluirFormularioAction,
  excluirItemModeloAction,
  excluirModeloAction,
  salvarFormularioAction,
} from "./actions"

export const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
type Opcao = { id: string; nome: string }

function Mensagem({ estado }: { estado: EstadoForm }) {
  if (estado.erro) return <span className="text-destructive text-sm">{estado.erro}</span>
  if (estado.ok) return <span className="text-success-fg text-sm">{estado.ok}</span>
  return null
}

export function NovoModelo() {
  const [estado, enviar, enviando] = useActionState<EstadoForm, FormData>(criarModeloAction, {})
  return (
    <form action={enviar} className="grid gap-2 md:grid-cols-[1fr_10rem_auto]">
      <Input name="nome" required maxLength={120} placeholder="Nome do modelo (ex.: Congresso regional)" aria-label="Nome do modelo" />
      <select name="tipo" defaultValue="demanda" className={SELECT} aria-label="Tipo do modelo">
        <option value="demanda">De demanda</option>
        <option value="projeto">De projeto</option>
      </select>
      <Button type="submit" size="sm" disabled={enviando}>
        {enviando ? <Loader2 className="animate-spin" /> : <Plus />}
        Criar modelo
      </Button>
      <div className="md:col-span-3">
        <Mensagem estado={estado} />
      </div>
    </form>
  )
}

export function EditarModelo({ id, nome, descricao }: { id: string; nome: string; descricao: string | null }) {
  const [estado, enviar, enviando] = useActionState<EstadoForm, FormData>(editarModeloAction, {})
  const [pendente, iniciar] = useTransition()
  return (
    <form action={enviar} className="grid gap-2">
      <input type="hidden" name="modelo_id" value={id} />
      <Input name="nome" required maxLength={120} defaultValue={nome} aria-label="Nome do modelo" />
      <Textarea name="descricao" rows={2} defaultValue={descricao ?? ""} placeholder="Para que serve o modelo (opcional)" aria-label="Descrição" />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" variant="outline" disabled={enviando}>
          {enviando ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          disabled={pendente}
          onClick={async () => {
            const sim = await confirmar({
              titulo: "Excluir o modelo?",
              descricao: "As demandas e projetos criados com ele continuam; o modelo some, e os formulários que o usavam ficam sem modelo.",
              confirmar: "Excluir",
              destrutivo: true,
            })
            if (sim) iniciar(async () => void (await excluirModeloAction(id)))
          }}
        >
          <Trash2 />
          Excluir modelo
        </Button>
        <Mensagem estado={estado} />
      </div>
    </form>
  )
}

export function NovoItemModelo({ modeloId, projeto, procedimentos }: { modeloId: string; projeto: boolean; procedimentos: Opcao[] }) {
  const [estado, enviar, enviando] = useActionState<EstadoForm, FormData>(adicionarItemModeloAction, {})
  const [sentido, setSentido] = useState("antes")
  return (
    <form action={enviar} className="grid gap-2">
      <input type="hidden" name="modelo_id" value={modeloId} />
      <div className="grid gap-2 md:grid-cols-[8rem_1fr]">
        {projeto ? (
          <select name="tipo" defaultValue="tarefa" className={SELECT} aria-label="Tarefa ou marco">
            <option value="tarefa">Tarefa</option>
            <option value="marco">Marco</option>
          </select>
        ) : (
          <input type="hidden" name="tipo" value="tarefa" />
        )}
        <Input name="titulo" required maxLength={200} placeholder="O que fazer (ex.: Contratar o espaço)" aria-label="Título" className={projeto ? "" : "md:col-span-2"} />
      </div>
      <div className="grid gap-2 md:grid-cols-[6rem_9rem_1fr_1fr]">
        <Input name="dias_n" type="number" min={0} max={730} defaultValue={10} disabled={sentido === "no_dia"} aria-label="Quantos dias" />
        <select name="sentido" value={sentido} onChange={(e) => setSentido(e.target.value)} className={SELECT} aria-label="Antes ou depois">
          <option value="antes">dias antes</option>
          <option value="depois">dias depois</option>
          <option value="no_dia">no dia</option>
        </select>
        <select name="prioridade" defaultValue="media" className={SELECT} aria-label="Prioridade">
          {PRIORIDADES_TAREFA.map((p) => (
            <option key={p} value={p}>
              Prioridade {ROTULOS_PRIORIDADE_TAREFA[p].toLowerCase()}
            </option>
          ))}
        </select>
        <select name="procedimento_id" defaultValue="" className={SELECT} aria-label="Procedimento">
          <option value="">Sem procedimento</option>
          {procedimentos.map((p) => (
            <option key={p.id} value={p.id}>
              Procedimento: {p.nome}
            </option>
          ))}
        </select>
      </div>
      <Textarea name="checklist" rows={2} placeholder="Checklist da tarefa, um item por linha (opcional)" aria-label="Checklist" />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={enviando}>
          {enviando ? <Loader2 className="animate-spin" /> : <Plus />}
          Adicionar ao modelo
        </Button>
        <Mensagem estado={estado} />
      </div>
    </form>
  )
}

export function ExcluirItemModelo({ id }: { id: string }) {
  const [pendente, iniciar] = useTransition()
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="text-destructive hover:text-destructive size-8"
      aria-label="Excluir do modelo"
      disabled={pendente}
      onClick={() => iniciar(async () => void (await excluirItemModeloAction(id)))}
    >
      {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
    </Button>
  )
}

/** Criar ou editar um formulário de pedido. */
export function FormularioPedidoForm({
  formulario,
  pessoas,
  modelos,
}: {
  formulario?: { id: string; nome: string; descricao: string | null; responsavelId: string | null; modeloId: string | null; ativo: boolean }
  pessoas: Opcao[]
  modelos: Opcao[]
}) {
  const [estado, enviar, enviando] = useActionState<EstadoForm, FormData>(salvarFormularioAction, {})
  const [pendente, iniciar] = useTransition()
  const sufixo = formulario?.id ?? "novo"
  return (
    <form action={enviar} className="grid gap-2">
      {formulario && <input type="hidden" name="formulario_id" value={formulario.id} />}
      <div className="grid gap-2 md:grid-cols-3">
        <Input name="nome" required maxLength={80} defaultValue={formulario?.nome ?? ""} placeholder="Nome (ex.: Pedido à Comunicação)" aria-label={`Nome do formulário ${sufixo}`} />
        <select name="responsavel_id" defaultValue={formulario?.responsavelId ?? ""} className={SELECT} aria-label={`Quem recebe os pedidos ${sufixo}`} required>
          <option value="">Quem recebe os pedidos…</option>
          {pessoas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
        <select name="modelo_id" defaultValue={formulario?.modeloId ?? ""} className={SELECT} aria-label={`Modelo de demanda ${sufixo}`}>
          <option value="">Sem modelo (só a demanda)</option>
          {modelos.map((m) => (
            <option key={m.id} value={m.id}>
              Modelo: {m.nome}
            </option>
          ))}
        </select>
      </div>
      <Textarea
        name="descricao"
        rows={2}
        defaultValue={formulario?.descricao ?? ""}
        placeholder="Orientação para quem pede (o que informar, prazo mínimo…)"
        aria-label={`Orientação ${sufixo}`}
      />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="ativo" value="1" defaultChecked={formulario?.ativo ?? true} className="size-4" />
          Recebendo pedidos
        </label>
        <Button type="submit" size="sm" variant={formulario ? "outline" : "default"} disabled={enviando}>
          {enviando ? <Loader2 className="animate-spin" /> : formulario ? <Save /> : <Plus />}
          {formulario ? "Salvar" : "Criar formulário"}
        </Button>
        {formulario && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={pendente}
            onClick={async () => {
              const sim = await confirmar({
                titulo: "Excluir o formulário?",
                descricao: `"${formulario.nome}" deixa de receber pedidos. As demandas já criadas continuam.`,
                confirmar: "Excluir",
                destrutivo: true,
              })
              if (sim) iniciar(async () => void (await excluirFormularioAction(formulario.id)))
            }}
          >
            <Trash2 />
            Excluir
          </Button>
        )}
        <Mensagem estado={estado} />
      </div>
    </form>
  )
}
