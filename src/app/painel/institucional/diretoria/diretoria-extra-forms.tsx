"use client"

import { useActionState, useState } from "react"
import { Check, Loader2, Plus, Save, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type EstadoForm } from "@/lib/contas"

import {
  adicionarAssentoAction,
  adicionarLiberacaoAction,
  atualizarInstanciaAction,
  criarInstanciaAction,
  removerAssentoAction,
  removerLiberacaoAction,
} from "./actions"

type OpcaoIntegrante = { id: string; nome: string; cargo: string | null }

const INPUT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
const AREA =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none"

// ── Liberações sindicais ────────────────────────────────────────────────────

export function AdicionarLiberacao({
  mandatoId,
  integrantes,
  empregadoresPorIntegrante,
}: {
  mandatoId: string
  integrantes: OpcaoIntegrante[]
  /** Por integrante, as fontes pagadoras (empregadores) dos seus vínculos ativos. */
  empregadoresPorIntegrante: Record<string, { id: string; nome: string }[]>
}) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    adicionarLiberacaoAction,
    {}
  )
  const [diretorId, setDiretorId] = useState("")
  const empregadores = empregadoresPorIntegrante[diretorId] ?? []

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="mandato_id" value={mandatoId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="lib-integrante">Diretor *</Label>
          <select
            id="lib-integrante"
            name="integrante_id"
            required
            value={diretorId}
            onChange={(e) => setDiretorId(e.target.value)}
            className={INPUT}
          >
            <option value="">(selecione)</option>
            {integrantes.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nome}
                {i.cargo ? ` — ${i.cargo}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="lib-tipo">Tipo</Label>
          <select id="lib-tipo" name="tipo" defaultValue="permanente" className={INPUT}>
            <option value="permanente">Permanente</option>
            <option value="pontual">Pontual</option>
          </select>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="lib-empregador">Empregador (fonte pagadora que libera)</Label>
        <select
          id="lib-empregador"
          name="empresa_id"
          className={INPUT}
          disabled={!diretorId}
        >
          {!diretorId ? (
            <option value="">Selecione o diretor primeiro</option>
          ) : empregadores.length === 0 ? (
            <option value="">
              Nenhum vínculo ativo — vincule o diretor a um filiado com vínculo
            </option>
          ) : (
            <>
              <option value="">(selecione)</option>
              {empregadores.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </>
          )}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="lib-inicio">Início da vigência</Label>
          <input id="lib-inicio" name="inicio" type="date" className={INPUT} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="lib-fim">Fim (vazio = permanente)</Label>
          <input id="lib-fim" name="fim" type="date" className={INPUT} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="lib-doc">Documento que oficializou (PDF/imagem)</Label>
        <input
          id="lib-doc"
          name="documento"
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          className="text-sm"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="lib-obs">Observação</Label>
        <textarea id="lib-obs" name="observacao" rows={2} className={AREA} />
      </div>
      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      <div>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Plus />}
          Registrar liberação
        </Button>
      </div>
    </form>
  )
}

export function RemoverLiberacao({
  liberacaoId,
  mandatoId,
}: {
  liberacaoId: string
  mandatoId: string
}) {
  const [, formAction, pendente] = useActionState<EstadoForm, FormData>(
    removerLiberacaoAction,
    {}
  )
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm("Remover esta liberação?")) e.preventDefault()
      }}
    >
      <input type="hidden" name="liberacao_id" value={liberacaoId} />
      <input type="hidden" name="mandato_id" value={mandatoId} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pendente}
        aria-label="Remover liberação"
      >
        {pendente ? (
          <Loader2 className="animate-spin" />
        ) : (
          <Trash2 className="text-destructive" />
        )}
      </Button>
    </form>
  )
}

// ── Instâncias ──────────────────────────────────────────────────────────────

export function InstanciaForm({
  edicao,
  dados,
}: {
  edicao?: boolean
  dados?: { id?: string; nome?: string | null; descricao?: string | null }
}) {
  const [estado, formAction, pendente] = useActionState(
    edicao ? atualizarInstanciaAction : criarInstanciaAction,
    {}
  )
  return (
    <form action={formAction} className="grid max-w-xl gap-3">
      {dados?.id && <input type="hidden" name="instancia_id" value={dados.id} />}
      <div className="grid gap-1.5">
        <Label htmlFor="inst-nome">Nome da instância *</Label>
        <Input
          id="inst-nome"
          name="nome"
          required
          defaultValue={dados?.nome ?? ""}
          placeholder="Ex.: Conselho Municipal de Saúde"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="inst-desc">Descrição</Label>
        <textarea
          id="inst-desc"
          name="descricao"
          rows={2}
          defaultValue={dados?.descricao ?? ""}
          className={AREA}
        />
      </div>
      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      {estado.ok && (
        <p className="text-success-fg flex items-center gap-1.5 text-sm">
          <Check className="size-4" />
          {estado.ok}
        </p>
      )}
      <div>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? (
            <Loader2 className="animate-spin" />
          ) : edicao ? (
            <Save />
          ) : (
            <Plus />
          )}
          {edicao ? "Salvar" : "Criar instância"}
        </Button>
      </div>
    </form>
  )
}

export function AdicionarAssento({
  instanciaId,
  integrantes,
}: {
  instanciaId: string
  integrantes: OpcaoIntegrante[]
}) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    adicionarAssentoAction,
    {}
  )
  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="instancia_id" value={instanciaId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="as-integrante">Diretor representante</Label>
          <select id="as-integrante" name="integrante_id" className={INPUT}>
            <option value="">(selecione)</option>
            {integrantes.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nome}
                {i.cargo ? ` — ${i.cargo}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="as-cargo">Cargo na instância</Label>
          <Input id="as-cargo" name="cargo" placeholder="Ex.: Conselheiro titular" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="as-inicio">Início do mandato</Label>
          <input id="as-inicio" name="mandato_inicio" type="date" className={INPUT} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="as-fim">Fim do mandato</Label>
          <input id="as-fim" name="mandato_fim" type="date" className={INPUT} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="as-doc">Documento que oficializa o cargo (PDF/imagem)</Label>
        <input
          id="as-doc"
          name="documento"
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          className="text-sm"
        />
      </div>
      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      <div>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Plus />}
          Adicionar assento
        </Button>
      </div>
    </form>
  )
}

export function RemoverAssento({
  assentoId,
  instanciaId,
}: {
  assentoId: string
  instanciaId: string
}) {
  const [, formAction, pendente] = useActionState<EstadoForm, FormData>(
    removerAssentoAction,
    {}
  )
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm("Remover este assento?")) e.preventDefault()
      }}
    >
      <input type="hidden" name="assento_id" value={assentoId} />
      <input type="hidden" name="instancia_id" value={instanciaId} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pendente}
        aria-label="Remover assento"
      >
        {pendente ? (
          <Loader2 className="animate-spin" />
        ) : (
          <Trash2 className="text-destructive" />
        )}
      </Button>
    </form>
  )
}
