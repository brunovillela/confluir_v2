"use client"

import { useActionState } from "react"
import { Loader2, Plus, Trash2, X } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import {
  adicionarMembroGhe,
  atualizarGhe,
  criarGhe,
  excluirGhe,
  removerMembroGhe,
} from "../actions"

const SELECT_CLS =
  "border-input bg-background h-9 rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

/** Criar/editar GHE (nome + descrição). */
export function GheForm({
  ghe,
}: {
  ghe?: { id: string; nome: string | null; descricao: string | null }
}) {
  const [estado, action, pend] = useActionState(
    ghe ? atualizarGhe : criarGhe,
    {}
  )
  return (
    <form action={action} className="grid gap-3">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}
      {ghe && <input type="hidden" name="id" value={ghe.id} />}
      <div className="grid gap-1.5">
        <Label htmlFor="ghe-nome">Nome do GHE *</Label>
        <Input
          id="ghe-nome"
          name="nome"
          placeholder="Ex.: Administrativo — atendimento presencial"
          defaultValue={ghe?.nome ?? ""}
          required
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="ghe-descricao">Descrição</Label>
        <Textarea
          id="ghe-descricao"
          name="descricao"
          rows={2}
          placeholder="Critério de homogeneidade (mesmas atividades/perigos, exposição semelhante)"
          defaultValue={ghe?.descricao ?? ""}
        />
      </div>
      <div>
        <Button type="submit" variant={ghe ? "default" : "secondary"} disabled={pend}>
          {pend && <Loader2 className="animate-spin" />}
          {ghe ? "Salvar GHE" : "Criar GHE"}
        </Button>
      </div>
    </form>
  )
}

/** Criar GHE a partir de uma sugestão (membros pré-preenchidos). */
export function CriarGheDaSugestao({
  nomeSugerido,
  descricao,
  membros,
}: {
  nomeSugerido: string
  descricao: string
  membros: string[]
}) {
  const [estado, action, pend] = useActionState(criarGhe, {})
  return (
    <form action={action} className="flex items-center gap-2">
      {estado.erro && (
        <span className="text-destructive text-xs">{estado.erro}</span>
      )}
      <input type="hidden" name="nome" value={nomeSugerido} />
      <input type="hidden" name="descricao" value={descricao} />
      <input type="hidden" name="membros" value={membros.join(",")} />
      <Button type="submit" size="sm" variant="outline" disabled={pend}>
        {pend ? <Loader2 className="animate-spin" /> : <Plus className="size-4" />}
        Criar GHE com este grupo
      </Button>
    </form>
  )
}

/** Membros do GHE: lista com remoção + form para adicionar. */
export function MembrosGhe({
  gheId,
  membros,
  opcoes,
}: {
  gheId: string
  membros: { id: string; funcionarioId: string; nome: string | null }[]
  opcoes: { usuarioId: string; nome: string | null }[]
}) {
  const [estado, action, pend] = useActionState(adicionarMembroGhe, {})
  const ja = new Set(membros.map((m) => m.funcionarioId))
  const disponiveis = opcoes.filter((o) => !ja.has(o.usuarioId))

  return (
    <div className="grid gap-3">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {membros.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nenhum funcionário neste GHE ainda.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {membros.map((m) => (
            <li key={m.id} className="flex items-center gap-2 px-3 py-2">
              <span className="flex-1 text-sm">{m.nome ?? "(sem nome)"}</span>
              <BotaoRemoverMembro id={m.id} gheId={gheId} />
            </li>
          ))}
        </ul>
      )}
      <form action={action} className="flex items-end gap-2">
        <input type="hidden" name="ghe_id" value={gheId} />
        <select
          name="funcionario_id"
          required
          defaultValue=""
          className={`${SELECT_CLS} flex-1`}
        >
          <option value="" disabled>
            Escolha um funcionário…
          </option>
          {disponiveis.map((o) => (
            <option key={o.usuarioId} value={o.usuarioId}>
              {o.nome ?? "(sem nome)"}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary" disabled={pend}>
          {pend && <Loader2 className="animate-spin" />}
          Adicionar
        </Button>
      </form>
    </div>
  )
}

function BotaoRemoverMembro({ id, gheId }: { id: string; gheId: string }) {
  const [, act, pend] = useActionState(removerMembroGhe, {})
  return (
    <form action={act}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="ghe_id" value={gheId} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pend}
        className="text-destructive hover:text-destructive h-7 px-2"
      >
        {pend ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <X className="size-3.5" />
        )}
      </Button>
    </form>
  )
}

/** Excluir GHE (não apaga funcionários nem atividades). */
export function ExcluirGhe({ id }: { id: string }) {
  const [estado, action, pend] = useActionState(excluirGhe, {})
  return (
    <form action={action} className="grid gap-2">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="id" value={id} />
      <div>
        <Button type="submit" variant="destructive" disabled={pend}>
          {pend ? <Loader2 className="animate-spin" /> : <Trash2 className="size-4" />}
          Excluir GHE
        </Button>
      </div>
    </form>
  )
}
