"use client"

import { useActionState, useState } from "react"
import { Archive, ArchiveRestore, Check, Loader2, Plus, Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type EstadoForm } from "@/lib/contas"
import type { Departamento, PessoaDepartamento } from "@/lib/db/departamentos"

import {
  reativarDepartamentoAction,
  salvarDepartamentoAction,
  tornarLegadoAction,
} from "./actions"

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
 * Cadastro/edição de um departamento: nome, pessoas vinculadas (funcionários e
 * diretores com conta) e o coordenador, escolhido ENTRE as pessoas marcadas.
 * Sem `departamento`, cria. Departamento não se exclui: vira legado.
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
  const [estadoLegado, acaoLegado, pendenteLegado] = useActionState(
    tornarLegadoAction,
    {}
  )
  // O coordenador atual que ainda não está entre as pessoas (dado antigo) já
  // entra marcado: ao salvar, ele passa a ser uma das pessoas vinculadas.
  const coordenadorFora = Boolean(
    departamento?.coordenadorId &&
      !departamento.integrantes.some((i) => i.usuarioId === departamento.coordenadorId)
  )
  const [marcados, setMarcados] = useState<Set<string>>(
    () =>
      new Set([
        ...(departamento?.integrantes.map((i) => i.usuarioId) ?? []),
        ...(coordenadorFora && departamento?.coordenadorId ? [departamento.coordenadorId] : []),
      ])
  )
  const [coordenador, setCoordenador] = useState(departamento?.coordenadorId ?? "")
  const alternar = (id: string, marcado: boolean) => {
    setMarcados((atual) => {
      const novo = new Set(atual)
      if (marcado) novo.add(id)
      else novo.delete(id)
      return novo
    })
    if (!marcado && id === coordenador) setCoordenador("")
  }
  const vinculaveis = pessoas.filter((p) => p.usuarioId)
  // Quem já está vinculado mas não aparece entre funcionários e diretoria (saiu
  // do quadro, ou o diretor tem outro cadastro de usuário com o mesmo CPF): fica
  // à vista e marcado — senão, salvar o desvincularia sem ninguém ver.
  const naLista = new Set(vinculaveis.map((p) => p.usuarioId))
  const extra = [
    ...(departamento?.integrantes ?? []).map((i) => ({ usuarioId: i.usuarioId, nome: i.nome })),
    ...(departamento?.coordenadorId && coordenadorFora
      ? [{ usuarioId: departamento.coordenadorId, nome: departamento.coordenadorNome ?? "(coordenador atual)" }]
      : []),
  ].filter((p) => !naLista.has(p.usuarioId))
  const opcoesCoordenador = [...vinculaveis, ...extra].filter((p) => marcados.has(p.usuarioId ?? ""))
  const semPessoas = (departamento?.integrantes.length ?? 0) === 0 && !departamento?.coordenadorId
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
                  checked={marcados.has(p.usuarioId ?? "")}
                  onChange={(e) => alternar(p.usuarioId ?? "", e.target.checked)}
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
              value={coordenador}
              onChange={(e) => setCoordenador(e.target.value)}
            >
              <option value="">Sem coordenador</option>
              {opcoesCoordenador.map((p) => (
                <option key={p.usuarioId} value={p.usuarioId ?? ""}>
                  {p.nome}
                </option>
              ))}
            </select>
            <span className="text-muted-foreground text-xs">
              {opcoesCoordenador.length === 0
                ? "Marque as pessoas do departamento abaixo; o coordenador é uma delas."
                : "Escolhido entre as pessoas marcadas abaixo."}
            </span>
          </div>
        </div>

        <div className="grid gap-3">
          <p className="text-sm font-medium">Pessoas do departamento</p>
          {coordenadorFora && (
            <p className="text-warning-fg text-xs">
              {departamento?.coordenadorNome ?? "O coordenador"} coordena o departamento mas
              não estava entre as pessoas — já vem marcado; salve para confirmar.
            </p>
          )}
          {extra.length > 0 && (
            <div className="grid gap-1.5">
              <p className="text-muted-foreground text-xs font-medium">
                Vinculados, fora da lista de funcionários e da diretoria vigente
              </p>
              <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {extra.map((p) => (
                  <li key={p.usuarioId}>
                    <label className="flex cursor-pointer items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="integrantes"
                        value={p.usuarioId}
                        checked={marcados.has(p.usuarioId)}
                        onChange={(e) => alternar(p.usuarioId, e.target.checked)}
                        className="accent-primary mt-1"
                      />
                      <span className="min-w-0">
                        <span className="block truncate">{p.nome}</span>
                        <span className="text-muted-foreground block truncate text-xs">
                          saiu do quadro ou tem outro cadastro com o mesmo CPF
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
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
          action={acaoLegado}
          onSubmit={(e) => {
            if (
              !confirm(
                `Tornar “${departamento.nome}” legado? Ele sai das listas de escolha e continua nos registros antigos. Dá para reativar depois.`
              )
            )
              e.preventDefault()
          }}
          className="grid gap-1.5 border-t pt-3"
        >
          <input type="hidden" name="departamento_id" value={departamento.id} />
          <div>
            <Button
              type="submit"
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={pendenteLegado || !semPessoas}
            >
              {pendenteLegado ? <Loader2 className="animate-spin" /> : <Archive />}
              Excluir (tornar legado)
            </Button>
          </div>
          <span className="text-muted-foreground text-xs">
            {semPessoas
              ? "O departamento não é apagado: compras, ofícios e contas continuam apontando para ele. Ele sai das listas de escolha e pode ser reativado."
              : "Para excluir, primeiro desmarque todas as pessoas, deixe sem coordenador e salve. Depois ele vira legado — não é apagado, porque compras e ofícios apontam para ele."}
          </span>
          {estadoLegado.erro && <span className="text-destructive text-xs">{estadoLegado.erro}</span>}
        </form>
      )}
    </div>
  )
}

/** Departamento legado: volta às listas de escolha. */
export function ReativarDepartamento({ departamentoId }: { departamentoId: string }) {
  const [estado, acao, pendente] = useActionState(reativarDepartamentoAction, {})
  return (
    <form action={acao} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="departamento_id" value={departamentoId} />
      <Button type="submit" size="sm" variant="outline" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <ArchiveRestore />}
        Reativar
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}
