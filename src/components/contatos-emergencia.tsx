"use client"

import { useActionState, useState } from "react"
import { Loader2, Pencil, Phone, Plus, Trash2, X } from "lucide-react"

import { AcaoVisualizacao } from "@/components/acao-visualizacao"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type EstadoForm } from "@/lib/contas"
import { MAX_CONTATOS_EMERGENCIA, VINCULOS_EMERGENCIA } from "@/lib/filiacao"
import { formatarTelefone } from "@/lib/formato"
import { mascaraTelefone } from "@/lib/mascaras"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type ContatoEmergenciaTela = {
  id: string
  nome: string
  telefone: string
  vinculo: string | null
  origem: "painel" | "portal"
}

type Acao = (prev: EstadoForm, formData: FormData) => Promise<EstadoForm>

/**
 * Lista de contatos de emergência com lápis e lixeira por linha — o
 * formulário abre no lugar da linha. Serve à ficha do filiado (gestão) e ao
 * Meu cadastro do portal (o próprio filiado). `campos` vão ocultos em todo
 * envio (ex.: o id do filiado, no painel).
 */
export function ContatosEmergencia({
  contatos,
  salvar,
  excluir,
  podeEditar,
  preview = false,
  campos = {},
  mostrarOrigem = false,
}: {
  contatos: ContatoEmergenciaTela[]
  salvar: Acao
  excluir: Acao
  podeEditar: boolean
  /** "Ver como filiado": controles na tela, desligados. */
  preview?: boolean
  campos?: Record<string, string>
  /** Marca os cadastrados pelo próprio filiado (visão da gestão). */
  mostrarOrigem?: boolean
}) {
  const [editando, setEditando] = useState<string | null>(null)
  const [novo, setNovo] = useState(false)
  const [estadoExclusao, acaoExcluir, excluindo] = useActionState(excluir, {})
  const ocultos = Object.entries(campos).map(([k, v]) => (
    <input key={k} type="hidden" name={k} value={v} />
  ))

  return (
    <div className="grid gap-3">
      {estadoExclusao.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estadoExclusao.erro}</AlertDescription>
        </Alert>
      )}
      {contatos.length === 0 && !novo && (
        <p className="text-muted-foreground text-sm">Nenhum contato de emergência cadastrado.</p>
      )}

      {contatos.map((c) =>
        editando === c.id ? (
          <ContatoForm
            key={c.id}
            contato={c}
            salvar={salvar}
            ocultos={ocultos}
            aoFechar={() => setEditando(null)}
          />
        ) : (
          <div key={c.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
            <div className="grid min-w-0 gap-0.5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium break-words">{c.nome}</span>
                {c.vinculo && <Badge variant="outline">{c.vinculo}</Badge>}
                {mostrarOrigem && c.origem === "portal" && (
                  <Badge variant="secondary">informado pelo filiado</Badge>
                )}
              </div>
              <a
                href={`tel:+55${c.telefone}`}
                className="text-muted-foreground inline-flex items-center gap-1 tabular-nums hover:underline"
              >
                <Phone className="size-3.5 shrink-0" />
                {formatarTelefone(c.telefone)}
              </a>
            </div>
            {podeEditar && (
              <AcaoVisualizacao preview={preview} nota="">
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Editar ${c.nome}`}
                    onClick={() => {
                      setNovo(false)
                      setEditando(c.id)
                    }}
                  >
                    <Pencil />
                  </Button>
                  <form action={acaoExcluir}>
                    {ocultos}
                    <input type="hidden" name="contato_id" value={c.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Excluir ${c.nome}`}
                      disabled={excluindo}
                      className="text-destructive hover:text-destructive"
                      onClick={(e) => {
                        if (!confirm(`Excluir o contato de emergência "${c.nome}"?`)) e.preventDefault()
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </form>
                </div>
              </AcaoVisualizacao>
            )}
          </div>
        )
      )}

      {podeEditar &&
        (novo ? (
          <ContatoForm salvar={salvar} ocultos={ocultos} aoFechar={() => setNovo(false)} />
        ) : contatos.length < MAX_CONTATOS_EMERGENCIA ? (
          <AcaoVisualizacao preview={preview}>
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditando(null)
                  setNovo(true)
                }}
              >
                <Plus />
                Adicionar contato
              </Button>
            </div>
          </AcaoVisualizacao>
        ) : (
          <p className="text-muted-foreground text-xs">
            Limite de {MAX_CONTATOS_EMERGENCIA} contatos atingido — exclua um para incluir outro.
          </p>
        ))}
    </div>
  )
}

function ContatoForm({
  contato,
  salvar,
  ocultos,
  aoFechar,
}: {
  contato?: ContatoEmergenciaTela
  salvar: Acao
  ocultos: React.ReactNode
  aoFechar: () => void
}) {
  const [estado, formAction, pendente] = useActionState(async (prev: EstadoForm, formData: FormData) => {
    const r = await salvar(prev, formData)
    if (r.ok) aoFechar()
    return r
  }, {})
  const [telefone, setTelefone] = useState(contato ? mascaraTelefone(contato.telefone) : "")
  const p = contato ? `ce-${contato.id}` : "ce-novo"

  return (
    <form action={formAction} className="bg-muted/30 grid gap-3 rounded-lg border p-3">
      {ocultos}
      {contato && <input type="hidden" name="contato_id" value={contato.id} />}
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor={`${p}-nome`}>Nome *</Label>
          <Input id={`${p}-nome`} name="nome" defaultValue={contato?.nome ?? ""} required maxLength={120} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${p}-telefone`}>Telefone *</Label>
          <Input
            id={`${p}-telefone`}
            name="telefone"
            inputMode="tel"
            placeholder="(22) 99999-9999"
            value={telefone}
            onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${p}-vinculo`}>Vínculo *</Label>
          <select
            id={`${p}-vinculo`}
            name="vinculo"
            defaultValue={contato?.vinculo ?? ""}
            required
            className={SELECT}
          >
            <option value="" disabled>
              Escolha
            </option>
            {VINCULOS_EMERGENCIA.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={aoFechar}>
          <X />
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          {contato ? "Salvar contato" : "Adicionar contato"}
        </Button>
      </div>
    </form>
  )
}
