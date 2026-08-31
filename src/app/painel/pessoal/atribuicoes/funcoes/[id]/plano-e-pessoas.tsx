"use client"

import { useActionState } from "react"
import { Loader2, Sparkles, Trash2, X } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

import {
  adicionarAtribuicao,
  desvincularFuncionario,
  excluirAtribuicao,
  sugerirPlanoComIA,
  vincularFuncionario,
} from "../../actions"

type Atribuicao = {
  id: string
  descricao: string
  atividadeNome: string | null
}
type Vinculado = { id: string; funcionarioId: string; nome: string | null }
type OpcaoFuncionario = { usuarioId: string; nome: string | null }

function LinhaExcluir({
  action,
  hidden,
}: {
  action: typeof excluirAtribuicao
  hidden: Record<string, string>
}) {
  const [, act, pend] = useActionState(action, {})
  return (
    <form action={act}>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pend}
        className="text-destructive hover:text-destructive h-7 px-2"
      >
        {pend ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
      </Button>
    </form>
  )
}

export function PlanoCargos({
  funcaoId,
  funcaoNome,
  funcaoDescricao,
  atribuicoes,
  tarefas,
}: {
  funcaoId: string
  funcaoNome: string
  funcaoDescricao: string | null
  atribuicoes: Atribuicao[]
  tarefas: { id: string; nome: string | null }[]
}) {
  const [estadoAdd, addAction, addPend] = useActionState(adicionarAtribuicao, {})
  const [estadoIA, iaAction, iaPend] = useActionState(sugerirPlanoComIA, {})
  const msgErro = estadoAdd.erro ?? estadoIA.erro
  const msgOk = estadoAdd.ok ?? estadoIA.ok

  return (
    <div className="grid gap-3">
      {msgErro && (
        <Alert variant="destructive">
          <AlertDescription>{msgErro}</AlertDescription>
        </Alert>
      )}
      {msgOk && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>{msgOk}</AlertDescription>
        </Alert>
      )}

      {atribuicoes.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nenhuma atribuição no plano ainda. Adicione manualmente ou peça
          sugestões à IA.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {atribuicoes.map((a) => (
            <li key={a.id} className="flex items-start gap-2 px-3 py-2">
              <span className="flex-1 text-sm">
                {a.descricao}
                {a.atividadeNome && (
                  <span className="text-muted-foreground">
                    {" "}
                    · tarefa: {a.atividadeNome}
                  </span>
                )}
              </span>
              <LinhaExcluir
                action={excluirAtribuicao}
                hidden={{ id: a.id, funcao_id: funcaoId }}
              />
            </li>
          ))}
        </ul>
      )}

      <form action={addAction} className="grid gap-2">
        <input type="hidden" name="funcao_id" value={funcaoId} />
        <Textarea
          name="descricao"
          rows={1}
          placeholder="Nova atribuição esperada da função"
          required
        />
        <div className="flex flex-wrap items-end gap-2">
          <select
            name="atividade_id"
            defaultValue=""
            className="border-input bg-background h-9 flex-1 rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
          >
            <option value="">Vincular a uma tarefa (opcional)…</option>
            {tarefas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome ?? "(sem nome)"}
              </option>
            ))}
          </select>
          <Button type="submit" variant="secondary" disabled={addPend}>
            {addPend && <Loader2 className="animate-spin" />}
            Adicionar
          </Button>
        </div>
      </form>

      <form action={iaAction}>
        <input type="hidden" name="funcao_id" value={funcaoId} />
        <input type="hidden" name="nome" value={funcaoNome} />
        <input type="hidden" name="descricao" value={funcaoDescricao ?? ""} />
        <Button type="submit" variant="outline" size="sm" disabled={iaPend}>
          {iaPend ? <Loader2 className="animate-spin" /> : <Sparkles className="size-4" />}
          Sugerir plano com IA
        </Button>
      </form>
    </div>
  )
}

export function FuncionariosFuncao({
  funcaoId,
  vinculados,
  opcoes,
}: {
  funcaoId: string
  vinculados: Vinculado[]
  opcoes: OpcaoFuncionario[]
}) {
  const [estadoAdd, addAction, addPend] = useActionState(vincularFuncionario, {})
  const jaVinculados = new Set(vinculados.map((v) => v.funcionarioId))
  const disponiveis = opcoes.filter((o) => !jaVinculados.has(o.usuarioId))

  return (
    <div className="grid gap-3">
      {estadoAdd.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estadoAdd.erro}</AlertDescription>
        </Alert>
      )}

      {vinculados.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nenhum funcionário vinculado a esta função.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {vinculados.map((v) => (
            <li key={v.id} className="flex items-center gap-2 px-3 py-2">
              <span className="flex-1 text-sm">{v.nome ?? "(sem nome)"}</span>
              <LinhaExcluir
                action={desvincularFuncionario}
                hidden={{ id: v.id, funcao_id: funcaoId }}
              />
            </li>
          ))}
        </ul>
      )}

      <form action={addAction} className="flex items-end gap-2">
        <input type="hidden" name="funcao_id" value={funcaoId} />
        <select
          name="funcionario_id"
          required
          defaultValue=""
          className="border-input bg-background h-9 flex-1 rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
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
        <Button type="submit" variant="secondary" disabled={addPend}>
          {addPend && <Loader2 className="animate-spin" />}
          Vincular
        </Button>
      </form>
      <p className="text-muted-foreground text-xs">
        <Trash2 className="mr-1 inline size-3 align-[-1px]" />
        Um funcionário pode ocupar só uma função — vincular aqui move-o para esta.
      </p>
    </div>
  )
}
