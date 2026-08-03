"use client"

import { useActionState, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowDown, ArrowUp, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatarMoeda } from "@/lib/formato"
import { cn } from "@/lib/utils"

import { CondicaoBadge } from "../../../condicao-badge"
import { definirCondicaoMarcados } from "./actions"

type Direcao = "asc" | "desc"

function comparar(a: unknown, b: unknown, dir: Direcao): number {
  const sinal = dir === "desc" ? -1 : 1
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : 1
  if (b === null || b === undefined) return -1
  if (typeof a === "number" && typeof b === "number") return sinal * (a - b)
  return sinal * String(a).localeCompare(String(b), "pt-BR")
}

function CabecalhoOrdenavel<T extends string>({
  campo,
  ordem,
  dir,
  aoOrdenar,
  className,
  children,
}: {
  campo: T
  ordem: T
  dir: Direcao
  aoOrdenar: (campo: T) => void
  className?: string
  children: React.ReactNode
}) {
  const ativo = ordem === campo
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => aoOrdenar(campo)}
        className={cn(
          "hover:text-foreground inline-flex items-center gap-1",
          ativo && "text-foreground font-medium"
        )}
      >
        {children}
        {ativo &&
          (dir === "asc" ? (
            <ArrowUp className="size-3.5" />
          ) : (
            <ArrowDown className="size-3.5" />
          ))}
      </button>
    </TableHead>
  )
}

function useOrdenacao<T extends string>(inicial: T) {
  const [ordem, setOrdem] = useState<T>(inicial)
  const [dir, setDir] = useState<Direcao>("asc")
  const aoOrdenar = (campo: T) => {
    if (campo === ordem) setDir(dir === "asc" ? "desc" : "asc")
    else {
      setOrdem(campo)
      setDir("asc")
    }
  }
  return { ordem, dir, aoOrdenar }
}

function useSelecao(todosIds: string[]) {
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const todosMarcados =
    todosIds.length > 0 && todosIds.every((id) => marcados.has(id))
  const alternar = (id: string, valor: boolean) => {
    setMarcados((atual) => {
      const novo = new Set(atual)
      if (valor) novo.add(id)
      else novo.delete(id)
      return novo
    })
  }
  const alternarTodos = (valor: boolean) => {
    setMarcados(valor ? new Set(todosIds) : new Set())
  }
  return { marcados, todosMarcados, alternar, alternarTodos }
}

function BotaoAcaoMarcados({
  remessaId,
  fonteId,
  condicao,
  marcados,
  rotulo,
  confirmacao,
}: {
  remessaId: string
  fonteId: string
  condicao: "Ativo" | "Inativo"
  marcados: Set<string>
  rotulo: string
  confirmacao: string
}) {
  const [estado, formAction, pendente] = useActionState(
    definirCondicaoMarcados,
    {}
  )
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm(`${confirmacao} (${marcados.size} cadastro${marcados.size === 1 ? "" : "s"})?`)) {
          e.preventDefault()
        }
      }}
      className="flex flex-wrap items-center justify-end gap-2"
    >
      <input type="hidden" name="remessa_id" value={remessaId} />
      <input type="hidden" name="fonte_id" value={fonteId} />
      <input type="hidden" name="condicao" value={condicao} />
      {[...marcados].map((id) => (
        <input key={id} type="hidden" name="ids" value={id} />
      ))}
      {estado.erro && (
        <span className="text-destructive text-xs">{estado.erro}</span>
      )}
      <Button type="submit" size="sm" disabled={pendente || marcados.size === 0}>
        {pendente && <Loader2 className="animate-spin" />}
        {rotulo}
        {marcados.size > 0 && ` (${marcados.size})`}
      </Button>
    </form>
  )
}

// ── Filiados ativos não pagantes ───────────────────────────────────────────

export type AtivoNaoPagante = {
  id: string
  nome: string | null
  matriculaSindical: string | null
  matriculaFonte: string | null
}

export function ListaAtivosNaoPagantes({
  remessaId,
  fonteId,
  linhas,
}: {
  remessaId: string
  fonteId: string
  linhas: AtivoNaoPagante[]
}) {
  type Campo = "nome" | "matriculaSindical" | "matriculaFonte"
  const { ordem, dir, aoOrdenar } = useOrdenacao<Campo>("nome")
  const ordenadas = useMemo(
    () => [...linhas].sort((a, b) => comparar(a[ordem], b[ordem], dir)),
    [linhas, ordem, dir]
  )
  const { marcados, todosMarcados, alternar, alternarTodos } = useSelecao(
    linhas.map((l) => l.id)
  )

  if (linhas.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Todos os filiados ativos da fonte constam na relação.
      </p>
    )
  }

  return (
    <div className="grid gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">
              <Checkbox
                checked={todosMarcados}
                onCheckedChange={(v) => alternarTodos(v === true)}
                aria-label="Marcar todos"
              />
            </TableHead>
            <CabecalhoOrdenavel campo="nome" ordem={ordem} dir={dir} aoOrdenar={aoOrdenar}>
              Filiado
            </CabecalhoOrdenavel>
            <CabecalhoOrdenavel
              campo="matriculaSindical"
              ordem={ordem}
              dir={dir}
              aoOrdenar={aoOrdenar}
              className="hidden sm:table-cell"
            >
              Matrícula sindical
            </CabecalhoOrdenavel>
            <CabecalhoOrdenavel campo="matriculaFonte" ordem={ordem} dir={dir} aoOrdenar={aoOrdenar}>
              Matrícula na fonte
            </CabecalhoOrdenavel>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ordenadas.map((f) => (
            <TableRow key={f.id} data-state={marcados.has(f.id) ? "selected" : undefined}>
              <TableCell>
                <Checkbox
                  checked={marcados.has(f.id)}
                  onCheckedChange={(v) => alternar(f.id, v === true)}
                  aria-label={`Marcar ${f.nome ?? "filiado"}`}
                />
              </TableCell>
              <TableCell className="max-w-52 font-medium">
                <Link href={`/painel/filiados/${f.id}`} className="hover:underline">
                  <span className="block truncate">{f.nome ?? "(sem nome)"}</span>
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground hidden font-mono text-xs sm:table-cell">
                {f.matriculaSindical ?? "—"}
              </TableCell>
              <TableCell className="text-muted-foreground font-mono text-xs">
                {f.matriculaFonte ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <BotaoAcaoMarcados
        remessaId={remessaId}
        fonteId={fonteId}
        condicao="Inativo"
        marcados={marcados}
        rotulo="Tornar inativos os marcados"
        confirmacao="Mudar a condição para Inativo"
      />
    </div>
  )
}

// ── Pagantes não ativos ────────────────────────────────────────────────────

export type PaganteNaoAtivo = {
  id: string
  filiadoId: string
  nome: string | null
  condicao: string | null
  valor: number | null
}

export type PaganteNaoEncontrado = {
  id: string
  matriculaFonte: string | null
  cpf: string | null
  valor: number | null
}

export function ListaPagantesNaoAtivos({
  remessaId,
  fonteId,
  pagantes,
  naoEncontrados,
}: {
  remessaId: string
  fonteId: string
  pagantes: PaganteNaoAtivo[]
  naoEncontrados: PaganteNaoEncontrado[]
}) {
  type Campo = "nome" | "condicao" | "valor"
  const { ordem, dir, aoOrdenar } = useOrdenacao<Campo>("nome")
  const ordenadas = useMemo(
    () => [...pagantes].sort((a, b) => comparar(a[ordem], b[ordem], dir)),
    [pagantes, ordem, dir]
  )

  type CampoNE = "matriculaFonte" | "cpf" | "valor"
  const ordNE = useOrdenacao<CampoNE>("matriculaFonte")
  const neOrdenadas = useMemo(
    () =>
      [...naoEncontrados].sort((a, b) =>
        comparar(a[ordNE.ordem], b[ordNE.ordem], ordNE.dir)
      ),
    [naoEncontrados, ordNE.ordem, ordNE.dir]
  )

  // Seleção por FILIADO (um filiado pode ter mais de um lançamento)
  const filiadosUnicos = useMemo(
    () => [...new Set(pagantes.map((p) => p.filiadoId))],
    [pagantes]
  )
  const { marcados, todosMarcados, alternar, alternarTodos } =
    useSelecao(filiadosUnicos)

  if (pagantes.length === 0 && naoEncontrados.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Todos os pagantes foram encontrados e estão ativos.
      </p>
    )
  }

  return (
    <div className="grid gap-5">
      {pagantes.length > 0 && (
        <div className="grid gap-3">
          <p className="text-muted-foreground text-xs font-medium">
            Pagaram, mas sem condição “Ativo” ({pagantes.length})
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox
                    checked={todosMarcados}
                    onCheckedChange={(v) => alternarTodos(v === true)}
                    aria-label="Marcar todos"
                  />
                </TableHead>
                <CabecalhoOrdenavel campo="nome" ordem={ordem} dir={dir} aoOrdenar={aoOrdenar}>
                  Filiado
                </CabecalhoOrdenavel>
                <CabecalhoOrdenavel campo="condicao" ordem={ordem} dir={dir} aoOrdenar={aoOrdenar}>
                  Condição
                </CabecalhoOrdenavel>
                <CabecalhoOrdenavel
                  campo="valor"
                  ordem={ordem}
                  dir={dir}
                  aoOrdenar={aoOrdenar}
                  className="text-right"
                >
                  Valor
                </CabecalhoOrdenavel>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordenadas.map((l) => (
                <TableRow
                  key={l.id}
                  data-state={marcados.has(l.filiadoId) ? "selected" : undefined}
                >
                  <TableCell>
                    <Checkbox
                      checked={marcados.has(l.filiadoId)}
                      onCheckedChange={(v) => alternar(l.filiadoId, v === true)}
                      aria-label={`Marcar ${l.nome ?? "filiado"}`}
                    />
                  </TableCell>
                  <TableCell className="max-w-52 font-medium">
                    <Link
                      href={`/painel/filiados/${l.filiadoId}`}
                      className="hover:underline"
                    >
                      <span className="block truncate">
                        {l.nome ?? "(sem nome)"}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <CondicaoBadge condicao={l.condicao} />
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {formatarMoeda(l.valor)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <BotaoAcaoMarcados
            remessaId={remessaId}
            fonteId={fonteId}
            condicao="Ativo"
            marcados={marcados}
            rotulo="Tornar ativos os marcados"
            confirmacao="Mudar a condição para Ativo"
          />
        </div>
      )}

      {naoEncontrados.length > 0 && (
        <div className="grid gap-3">
          <p className="text-muted-foreground text-xs font-medium">
            Não encontrados no cadastro ({naoEncontrados.length}) — sem
            registro para ativar
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <CabecalhoOrdenavel
                  campo="matriculaFonte"
                  ordem={ordNE.ordem}
                  dir={ordNE.dir}
                  aoOrdenar={ordNE.aoOrdenar}
                >
                  Matrícula na fonte
                </CabecalhoOrdenavel>
                <CabecalhoOrdenavel
                  campo="cpf"
                  ordem={ordNE.ordem}
                  dir={ordNE.dir}
                  aoOrdenar={ordNE.aoOrdenar}
                >
                  CPF
                </CabecalhoOrdenavel>
                <CabecalhoOrdenavel
                  campo="valor"
                  ordem={ordNE.ordem}
                  dir={ordNE.dir}
                  aoOrdenar={ordNE.aoOrdenar}
                  className="text-right"
                >
                  Valor
                </CabecalhoOrdenavel>
              </TableRow>
            </TableHeader>
            <TableBody>
              {neOrdenadas.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-mono text-xs">
                    {l.matriculaFonte ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {l.cpf
                      ? l.cpf.replace(
                          /(\d{3})(\d{3})(\d{3})(\d{2})/,
                          "$1.$2.$3-$4"
                        )
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {formatarMoeda(l.valor)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
