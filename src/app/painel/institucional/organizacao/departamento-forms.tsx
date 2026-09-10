"use client"

import { useActionState } from "react"
import { Check, Loader2, Plus, Save, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type EstadoForm } from "@/lib/contas"
import type { Departamento, PessoaDepartamento } from "@/lib/db/departamentos"

import { excluirDepartamentoAction, salvarDepartamentoAction } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

function Sucesso({ estado }: { estado: EstadoForm }) {
  if (!estado.ok) return null
  return (
    <p className="text-success-fg flex items-center gap-1.5 text-sm">
      <Check className="size-4" />
      {estado.ok}
    </p>
  )
}

/**
 * Cadastro/edição de um departamento: nome, coordenador e as pessoas
 * vinculadas (funcionários e diretores com conta). Sem `departamento`, cria.
 */
export function DepartamentoForm({
  departamento,
  pessoas,
}: {
  departamento?: Departamento
  pessoas: PessoaDepartamento[]
}) {
  const [estado, formAction, pendente] = useActionState(
    salvarDepartamentoAction,
    {}
  )
  const [estadoExcluir, acaoExcluir, pendenteExcluir] = useActionState(
    excluirDepartamentoAction,
    {}
  )
  const vinculados = new Set(departamento?.integrantes.map((i) => i.usuarioId) ?? [])
  const vinculaveis = pessoas.filter((p) => p.usuarioId)
  const semConta = pessoas.filter((p) => !p.usuarioId)
  const funcionarios = vinculaveis.filter((p) => p.origem === "funcionario")
  const diretores = vinculaveis.filter((p) => p.origem === "diretor")
  const prefixo = departamento?.id ?? "novo"

  const grupo = (titulo: string, lista: PessoaDepartamento[]) =>
    lista.length > 0 && (
      <div className="grid gap-1.5">
        <p className="text-muted-foreground text-xs font-medium">{titulo}</p>
        <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((p) => (
            <li key={p.usuarioId}>
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="integrantes"
                  value={p.usuarioId ?? ""}
                  defaultChecked={vinculados.has(p.usuarioId ?? "")}
                  className="accent-primary mt-1"
                />
                <span className="min-w-0">
                  <span className="block truncate">{p.nome}</span>
                  {p.cargo && (
                    <span className="text-muted-foreground block truncate text-xs">
                      {p.cargo}
                    </span>
                  )}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    )

  return (
    <div className="grid gap-3">
      <form action={formAction} className="grid gap-4">
        {departamento && (
          <input type="hidden" name="departamento_id" value={departamento.id} />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor={`${prefixo}-nome`}>Nome *</Label>
            <Input
              id={`${prefixo}-nome`}
              name="nome"
              required
              defaultValue={departamento?.nome ?? ""}
              placeholder="Ex.: Comunicação"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${prefixo}-coordenador`}>Coordenador(a)</Label>
            <select
              id={`${prefixo}-coordenador`}
              name="coordenador_id"
              className={SELECT}
              defaultValue={departamento?.coordenadorId ?? ""}
            >
              <option value="">Sem coordenador</option>
              {departamento?.coordenadorId &&
                !vinculaveis.some((p) => p.usuarioId === departamento.coordenadorId) && (
                  <option value={departamento.coordenadorId}>
                    {departamento.coordenadorNome ?? "(coordenador atual)"}
                  </option>
                )}
              {vinculaveis.map((p) => (
                <option key={p.usuarioId} value={p.usuarioId ?? ""}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-3">
          <p className="text-sm font-medium">Pessoas do departamento</p>
          {vinculaveis.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhum funcionário ativo ou diretor com conta de usuário para vincular.
            </p>
          ) : (
            <>
              {grupo("Funcionários", funcionarios)}
              {grupo("Diretores (mandato vigente)", diretores)}
            </>
          )}
          {semConta.length > 0 && (
            <p className="text-muted-foreground text-xs">
              Sem conta de usuário, por isso não vinculáveis:{" "}
              {semConta.map((p) => p.nome).join(", ")}.
            </p>
          )}
        </div>

        {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" variant={departamento ? "outline" : "default"} disabled={pendente}>
            {pendente ? <Loader2 className="animate-spin" /> : departamento ? <Save /> : <Plus />}
            {departamento ? "Salvar departamento" : "Criar departamento"}
          </Button>
          <Sucesso estado={estado} />
        </div>
      </form>

      {departamento && (
        <form
          action={acaoExcluir}
          onSubmit={(e) => {
            if (!confirm(`Excluir o departamento “${departamento.nome}”?`)) e.preventDefault()
          }}
          className="flex flex-wrap items-center gap-3 border-t pt-3"
        >
          <input type="hidden" name="departamento_id" value={departamento.id} />
          <Button
            type="submit"
            size="sm"
            variant="ghost"
            className="text-destructive"
            disabled={pendenteExcluir || departamento.usoEmCompras + departamento.usoEmDemandas > 0}
          >
            {pendenteExcluir ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Excluir departamento
          </Button>
          {departamento.usoEmCompras + departamento.usoEmDemandas > 0 && (
            <span className="text-muted-foreground text-xs">
              Em uso em {departamento.usoEmCompras > 0 ? `Compras (${departamento.usoEmCompras})` : ""}
              {departamento.usoEmCompras > 0 && departamento.usoEmDemandas > 0 ? " e " : ""}
              {departamento.usoEmDemandas > 0 ? `Demandas (${departamento.usoEmDemandas})` : ""} — não pode ser excluído.
            </span>
          )}
          {estadoExcluir.erro && (
            <span className="text-destructive text-xs">{estadoExcluir.erro}</span>
          )}
        </form>
      )}
    </div>
  )
}
