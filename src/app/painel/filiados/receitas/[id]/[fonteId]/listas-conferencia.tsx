"use client"

import { useActionState, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowDown, ArrowUp, Loader2, UserRoundPlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
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
import { cadastrarNaoEncontradosAction, definirCondicaoMarcados } from "./actions"
import { confirmarEnvio } from "@/components/ui/confirmacao"

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
        confirmarEnvio(e, `${confirmacao} (${marcados.size} cadastro${marcados.size === 1 ? "" : "s"})?`)
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
      {/* Quem chega ao fim da trilha de filiação recebe as boas-vindas (A58);
          desmarcar serve à correção em massa, que não deve avisar ninguém. */}
      {condicao === "Ativo" && (
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
          <Checkbox name="avisar" defaultChecked />
          Avisar quem concluiu a filiação (portal e e-mail)
        </label>
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
  /** Nome como veio na relação (null nos lançamentos antigos). */
  nome: string | null
  matriculaFonte: string | null
  cpf: string | null
  valor: number | null
}

export function ListaPagantesNaoAtivos({
  remessaId,
  fonteId,
  pagantes,
  naoEncontrados,
  podeCadastrar,
}: {
  remessaId: string
  fonteId: string
  pagantes: PaganteNaoAtivo[]
  naoEncontrados: PaganteNaoEncontrado[]
  /** Gestão de filiação, numa fonte de verdade (não "sem fonte"). */
  podeCadastrar: boolean
}) {
  type Campo = "nome" | "condicao" | "valor"
  const { ordem, dir, aoOrdenar } = useOrdenacao<Campo>("nome")
  const ordenadas = useMemo(
    () => [...pagantes].sort((a, b) => comparar(a[ordem], b[ordem], dir)),
    [pagantes, ordem, dir]
  )

  type CampoNE = "nome" | "matriculaFonte" | "cpf" | "valor"
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
  const selNE = useSelecao(naoEncontrados.map((l) => l.id))
  const cadastro = useActionState(cadastrarNaoEncontradosAction, {})
  // Nome digitado por linha; começa com o que veio na relação.
  const [nomes, setNomes] = useState<Record<string, string>>(() =>
    Object.fromEntries(naoEncontrados.map((l) => [l.id, l.nome ?? ""]))
  )

  const resultado = <ResultadoCadastro estado={cadastro[0]} />

  if (pagantes.length === 0 && naoEncontrados.length === 0) {
    return (
      <div className="grid gap-3">
        {resultado}
        <p className="text-muted-foreground text-sm">
          Todos os pagantes foram encontrados e estão ativos.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-5">
      {resultado}
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
            Não encontrados no cadastro ({naoEncontrados.length})
            {podeCadastrar
              ? " — marque quem cadastrar como filiado ativo desta fonte"
              : " — sem registro para ativar"}
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                {podeCadastrar && (
                  <TableHead className="w-8">
                    <Checkbox
                      checked={selNE.todosMarcados}
                      onCheckedChange={(v) => selNE.alternarTodos(v === true)}
                      aria-label="Marcar todos os não encontrados"
                    />
                  </TableHead>
                )}
                <CabecalhoOrdenavel
                  campo="nome"
                  ordem={ordNE.ordem}
                  dir={ordNE.dir}
                  aoOrdenar={ordNE.aoOrdenar}
                >
                  Nome na relação
                </CabecalhoOrdenavel>
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
                <TableRow
                  key={l.id}
                  data-state={selNE.marcados.has(l.id) ? "selected" : undefined}
                >
                  {podeCadastrar && (
                    <TableCell>
                      <Checkbox
                        checked={selNE.marcados.has(l.id)}
                        onCheckedChange={(v) => selNE.alternar(l.id, v === true)}
                        aria-label={`Marcar ${nomes[l.id] || l.matriculaFonte || "pagante"}`}
                      />
                    </TableCell>
                  )}
                  <TableCell className="min-w-40">
                    {podeCadastrar ? (
                      <Input
                        value={nomes[l.id] ?? ""}
                        onChange={(e) => {
                          const valor = e.target.value
                          setNomes((n) => ({ ...n, [l.id]: valor }))
                        }}
                        placeholder="Nome completo"
                        aria-label="Nome completo"
                        aria-invalid={selNE.marcados.has(l.id) && (nomes[l.id] ?? "").trim().length < 3}
                        className="h-8"
                      />
                    ) : (
                      <span className="truncate">{l.nome ?? "—"}</span>
                    )}
                  </TableCell>
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
          {podeCadastrar && (
            <CadastrarMarcados
              acao={cadastro}
              remessaId={remessaId}
              fonteId={fonteId}
              itens={naoEncontrados
                .filter((l) => selNE.marcados.has(l.id))
                .map((l) => ({ lancamentoId: l.id, nome: nomes[l.id] ?? "" }))}
            />
          )}
        </div>
      )}
    </div>
  )
}

type EstadoCadastro = Awaited<ReturnType<typeof cadastrarNaoEncontradosAction>>

function CadastrarMarcados({
  acao,
  remessaId,
  fonteId,
  itens,
}: {
  acao: [EstadoCadastro, (fd: FormData) => void, boolean]
  remessaId: string
  fonteId: string
  itens: { lancamentoId: string; nome: string }[]
}) {
  const [estado, formAction, pendente] = acao
  const semNome = itens.filter((i) => i.nome.trim().length < 3).length
  const plural = itens.length === 1 ? "" : "s"
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        confirmarEnvio(
          e,
          `Cadastrar ${itens.length} pessoa${plural} como filiado${plural} ativo${plural} desta fonte? Quem tiver CPF já cadastrado não é duplicado: o cadastro existente é usado.`
        )
      }}
      className="grid justify-items-end gap-2"
    >
      <input type="hidden" name="remessa_id" value={remessaId} />
      <input type="hidden" name="fonte_id" value={fonteId} />
      <input type="hidden" name="itens" value={JSON.stringify(itens)} />
      <p className="text-muted-foreground max-w-xl text-right text-xs">
        Cada marcado vira filiado <strong>Ativo</strong> com o nome ao lado, o CPF
        da relação (quando veio) e um vínculo nesta fonte com a matrícula da
        relação; o pagamento passa a ser dele. O que faltar (CPF, admissão,
        ficha…) aparece em Cadastros pendentes.
      </p>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {semNome > 0 && (
          <span className="text-destructive text-xs">
            {semNome} marcado{semNome === 1 ? "" : "s"} sem nome
          </span>
        )}
        {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
        <Button type="submit" size="sm" disabled={pendente || itens.length === 0 || semNome > 0}>
          {pendente ? <Loader2 className="animate-spin" /> : <UserRoundPlus />}
          Cadastrar como ativos os marcados
          {itens.length > 0 && ` (${itens.length})`}
        </Button>
      </div>
    </form>
  )
}

function ResultadoCadastro({ estado }: { estado: EstadoCadastro }) {
  const r = estado.resultado
  if (!r) return null
  return (
    <div className="border-success/40 bg-success/5 rounded-md border p-3 text-sm">
      <p className="font-medium">
        {r.criados.toLocaleString("pt-BR")} cadastrado{r.criados === 1 ? "" : "s"} como ativo
        {r.criados === 1 ? "" : "s"}
        {r.reaproveitados > 0 &&
          ` · ${r.reaproveitados.toLocaleString("pt-BR")} já com cadastro pelo CPF (ligado e ativado)`}
        {r.erros.length > 0 && ` · ${r.erros.length} com problema`}
      </p>
      {r.erros.length > 0 && (
        <ul className="text-muted-foreground mt-1 grid gap-0.5 text-xs">
          {r.erros.slice(0, 30).map((e, i) => (
            <li key={i}>
              {e.nome} · {e.motivo}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
