"use client"

import { useActionState, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { Loader2, Plus, Sparkles, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

import { consultarCnpjEmpregador } from "../actions"
import {
  adicionarEmpregadorAction,
  adicionarEmpresaExternaAction,
  excluirGrupoAction,
  removerMembroAction,
  salvarGrupoAction,
} from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type Opcao = { id: string; nome: string }

export type GrupoFormDados = {
  id: string
  nome: string
  descricao: string | null
  contribuicaoCentralizada: boolean
  empresaPagadoraId: string | null
}

function Mensagem({ estado }: { estado: { erro?: string; ok?: string } }) {
  if (estado.erro) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{estado.erro}</AlertDescription>
      </Alert>
    )
  }
  if (estado.ok) return <p className="text-success-fg text-xs">{estado.ok}</p>
  return null
}

/**
 * Cadastro do grupo. Na criação, marca de uma vez os empregadores (fontes)
 * que ainda não estão em outro grupo; na edição, escolhe a empresa pagadora
 * entre as representadas.
 */
export function GrupoForm({
  grupo,
  livres,
  representadas,
  aoCancelarHref,
}: {
  grupo?: GrupoFormDados
  /** Empregadores fora de qualquer grupo (só na criação). */
  livres?: Opcao[]
  /** Empresas representadas do grupo (só na edição). */
  representadas?: Opcao[]
  aoCancelarHref: string
}) {
  const [estado, acao, pendente] = useActionState(salvarGrupoAction, {})
  const [centralizada, setCentralizada] = useState(grupo?.contribuicaoCentralizada ?? false)
  const [busca, setBusca] = useState("")
  const visiveis = (livres ?? []).filter((f) =>
    f.nome.toLowerCase().includes(busca.trim().toLowerCase())
  )

  return (
    <form action={acao} className="grid gap-4">
      {grupo && <input type="hidden" name="grupo_id" value={grupo.id} />}
      <Mensagem estado={estado} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="nome">Nome do grupo *</Label>
          <Input
            id="nome"
            name="nome"
            required
            defaultValue={grupo?.nome ?? ""}
            placeholder="Ex.: Grupo Baker Hughes"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="descricao">Descrição</Label>
          <Textarea
            id="descricao"
            name="descricao"
            rows={1}
            defaultValue={grupo?.descricao ?? ""}
            placeholder="Controladora, atividade, observações"
          />
        </div>
      </div>

      <div className="grid gap-2 rounded-md border p-3">
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={centralizada}
            onCheckedChange={setCentralizada}
            aria-label="Contribuição centralizada"
          />
          <span className={centralizada ? "font-medium" : "text-muted-foreground"}>
            O grupo paga as contribuições de forma centralizada
          </span>
        </label>
        <input type="hidden" name="contribuicao_centralizada" value={centralizada ? "on" : ""} />
        <p className="text-muted-foreground text-xs">
          Uma relação só para todas as empresas, em Receitas. Cada pagamento vai para a empresa do
          trabalhador; quem não for encontrado fica na empresa pagadora.
        </p>
        {centralizada && representadas && (
          <div className="grid max-w-md gap-1.5">
            <Label htmlFor="empresa_pagadora_id">Empresa pagadora (faz o repasse)</Label>
            <select
              id="empresa_pagadora_id"
              name="empresa_pagadora_id"
              defaultValue={grupo?.empresaPagadoraId ?? ""}
              className={SELECT}
            >
              <option value="">A primeira empresa representada</option>
              {representadas.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {livres && (
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">Empregadores do grupo</legend>
          <p className="text-muted-foreground text-xs">
            Empresas do grupo com trabalhadores representados. As demais (sem representação) entram
            depois, na página do grupo, só com nome e CNPJ.
          </p>
          {livres.length > 8 && (
            <Input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Filtrar empregadores"
              className="max-w-xs"
            />
          )}
          <div className="grid max-h-64 gap-1.5 overflow-y-auto rounded-md border p-3 sm:grid-cols-2">
            {livres.length === 0 && (
              <p className="text-muted-foreground text-sm">
                Todos os empregadores já estão em algum grupo.
              </p>
            )}
            {livres.map((f) => (
              <label
                key={f.id}
                className={`flex items-center gap-2 text-sm ${visiveis.includes(f) ? "" : "hidden"}`}
              >
                <input type="checkbox" name="empregador" value={f.id} className="size-4" />
                {f.nome}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          {grupo ? "Salvar grupo" : "Criar grupo"}
        </Button>
        <Button type="button" variant="ghost" asChild>
          <Link href={aoCancelarHref}>Cancelar</Link>
        </Button>
      </div>
    </form>
  )
}

export function AdicionarEmpregador({ grupoId, opcoes }: { grupoId: string; opcoes: Opcao[] }) {
  const [estado, acao, pendente] = useActionState(adicionarEmpregadorAction, {})
  return (
    <form action={acao} className="grid gap-2">
      <input type="hidden" name="grupo_id" value={grupoId} />
      <Label htmlFor="empresa_id">Empregador representado</Label>
      <div className="flex gap-2">
        <select id="empresa_id" name="empresa_id" required defaultValue="" className={SELECT}>
          <option value="" disabled>
            {opcoes.length ? "Escolha um empregador" : "Nenhum empregador fora de grupo"}
          </option>
          {opcoes.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline" disabled={pendente || opcoes.length === 0}>
          {pendente ? <Loader2 className="animate-spin" /> : <Plus />}
          Incluir
        </Button>
      </div>
      <Mensagem estado={estado} />
    </form>
  )
}

/** Empresa do grupo sem trabalhadores representados — nome e CNPJ (Receita). */
export function AdicionarEmpresaExterna({ grupoId }: { grupoId: string }) {
  const [estado, acao, pendente] = useActionState(adicionarEmpresaExternaAction, {})
  const formRef = useRef<HTMLFormElement>(null)
  const [consultando, consultar] = useTransition()
  const [aviso, setAviso] = useState<string | null>(null)

  function preencher() {
    const form = formRef.current
    const cnpj = (form?.elements.namedItem("cnpj") as HTMLInputElement | null)?.value ?? ""
    setAviso(null)
    consultar(async () => {
      const r = await consultarCnpjEmpregador(cnpj)
      if (r.erro || !r.ficha) {
        setAviso(r.erro ?? "Não foi possível consultar o CNPJ.")
        return
      }
      const nome = form?.elements.namedItem("nome") as HTMLInputElement | null
      if (nome) nome.value = r.ficha.nome_fantasia ?? r.ficha.nome_razao ?? nome.value
      const partes = [
        r.ficha.situacao && r.ficha.situacao.toUpperCase() !== "ATIVA"
          ? `Situação na Receita: ${r.ficha.situacao}.`
          : null,
        r.ficha.existente
          ? `Já é o empregador ${r.ficha.existente.nome}: ao incluir, entra como empresa representada.`
          : null,
      ].filter(Boolean)
      setAviso(partes.length ? partes.join(" ") : null)
    })
  }

  return (
    <form ref={formRef} action={acao} className="grid gap-2">
      <input type="hidden" name="grupo_id" value={grupoId} />
      <Label htmlFor="cnpj">Empresa sem trabalhadores representados</Label>
      <div className="flex flex-wrap gap-2">
        <Input id="cnpj" name="cnpj" inputMode="numeric" placeholder="CNPJ" className="w-44" />
        <Button type="button" variant="outline" onClick={preencher} disabled={consultando}>
          {consultando ? <Loader2 className="animate-spin" /> : <Sparkles />}
          Preencher pelo CNPJ
        </Button>
      </div>
      <div className="flex gap-2">
        <Input name="nome" required placeholder="Nome da empresa" aria-label="Nome da empresa" />
        <Button type="submit" variant="outline" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Plus />}
          Incluir
        </Button>
      </div>
      {aviso && <p className="text-warning-fg text-xs">{aviso}</p>}
      <Mensagem estado={estado} />
    </form>
  )
}

export function RemoverMembro({ grupoId, membroId, nome }: { grupoId: string; membroId: string; nome: string }) {
  const [estado, acao, pendente] = useActionState(removerMembroAction, {})
  return (
    <form
      action={acao}
      onSubmit={(e) => confirmarEnvio(e, `Retirar ${nome} do grupo?`)}
      title={estado.erro}
    >
      <input type="hidden" name="grupo_id" value={grupoId} />
      <input type="hidden" name="membro_id" value={membroId} />
      <Button type="submit" variant="ghost" size="icon" className="size-7" disabled={pendente} aria-label={`Retirar ${nome} do grupo`}>
        {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
      </Button>
    </form>
  )
}

export function ExcluirGrupo({ grupoId }: { grupoId: string }) {
  const [estado, acao, pendente] = useActionState(excluirGrupoAction, {})
  return (
    <form
      action={acao}
      onSubmit={(e) =>
        confirmarEnvio(
          e,
          "Excluir este grupo? As empresas continuam cadastradas em Empregadores; só o agrupamento some."
        )
      }
      className="grid gap-2"
    >
      <input type="hidden" name="grupo_id" value={grupoId} />
      <Mensagem estado={estado} />
      <Button type="submit" variant="ghost" disabled={pendente} className="text-destructive hover:text-destructive w-fit">
        {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
        Excluir grupo
      </Button>
    </form>
  )
}
