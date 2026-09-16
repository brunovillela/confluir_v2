import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, CopyCheck, Search, X } from "lucide-react"

import { Paginacao } from "@/components/paginacao"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { formatarCpf } from "@/lib/cpf"
import {
  listarDuplicidades,
  ROTULO_DUPLICIDADE,
  type TipoDuplicidade,
} from "@/lib/db/filiacao-duplicidades"
import { formatarData, formatarDataHora } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { semAcento } from "@/lib/texto"

import { AcoesDoGrupo } from "./grupo-acoes"

export const metadata: Metadata = { title: "Possíveis duplicidades — Confluir" }

const TIPOS: TipoDuplicidade[] = ["cpf", "matricula", "nome"]

/** Cadastros que parecem ser da mesma pessoa, para mesclar ou descartar. */
export default async function DuplicidadesPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; busca?: string; pagina?: string; porPagina?: string }>
}) {
  await requirePermissao("filiacao_gestao")
  const brutos = await searchParams
  const tipo = TIPOS.includes(brutos.tipo as TipoDuplicidade) ? (brutos.tipo as TipoDuplicidade) : null
  const busca = (brutos.busca ?? "").trim()

  const dados = await listarDuplicidades()
  const termo = semAcento(busca)
  const digitos = busca.replace(/\D/g, "")
  const filtrados = dados.grupos.filter((g) => {
    if (tipo && g.tipo !== tipo) return false
    if (!termo) return true
    return g.cadastros.some(
      (c) =>
        semAcento(c.nome ?? "").includes(termo) ||
        (digitos.length >= 3 && ((c.cpf ?? "").replace(/\D/g, "").includes(digitos) || (c.matricula ?? "") === digitos))
    )
  })
  const paginacao = lerPaginacao(brutos, 30)
  const pagina = paginar(filtrados, paginacao)

  const url = (t: TipoDuplicidade | null) =>
    `/painel/filiados/duplicidades${t ? `?tipo=${t}` : ""}${busca ? `${t ? "&" : "?"}busca=${encodeURIComponent(busca)}` : ""}`

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/filiados/cadastros-pendentes">
            <ArrowLeft />
            Cadastros pendentes
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Possíveis duplicidades</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Cadastros que parecem ser da mesma pessoa. <strong>Mesclar</strong> junta tudo num só
          cadastro sem apagar nada; <strong>Não é duplicidade</strong> tira o grupo da lista.
        </p>
      </div>

      {!dados.disponivel && (
        <Alert>
          <AlertDescription>
            A mesclagem ainda não está configurada — rode <code>supabase/filiacao-duplicidades.sql</code>.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href={url(null)} className="group">
          <Card className={!tipo ? "border-primary/50" : "group-hover:border-primary/40"}>
            <CardContent className="grid gap-1">
              <span className="text-muted-foreground text-xs">Todos os grupos</span>
              <span className="text-2xl font-semibold tabular-nums">
                {dados.grupos.length.toLocaleString("pt-BR")}
              </span>
            </CardContent>
          </Card>
        </Link>
        {TIPOS.map((t) => (
          <Link key={t} href={url(t)} className="group">
            <Card className={tipo === t ? "border-primary/50" : "group-hover:border-primary/40"}>
              <CardContent className="grid gap-1">
                <span className="text-muted-foreground text-xs">{ROTULO_DUPLICIDADE[t]}</span>
                <span className="text-2xl font-semibold tabular-nums">
                  {dados.totais[t].toLocaleString("pt-BR")}
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <form className="flex gap-2">
        {tipo && <input type="hidden" name="tipo" value={tipo} />}
        <Input name="busca" defaultValue={busca} placeholder="Nome, CPF ou matrícula" className="w-full sm:w-72" />
        <Button type="submit" variant="outline" size="icon" aria-label="Buscar">
          <Search />
        </Button>
        {(busca || tipo) && (
          <Button asChild variant="ghost" size="icon" title="Limpar">
            <Link href="/painel/filiados/duplicidades">
              <X />
            </Link>
          </Button>
        )}
      </form>

      {pagina.total === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
            <CopyCheck className="size-6" />
            {busca ? "Nenhum grupo encontrado na busca." : "Nenhuma duplicidade a resolver."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {pagina.linhas.map((g) => {
            const ativos = g.cadastros.filter((c) => c.condicao === "Ativo").length
            return (
              <Card key={`${g.tipo}:${g.chave}`}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge variant="outline">{ROTULO_DUPLICIDADE[g.tipo]}</Badge>
                      <span className="font-mono text-xs">
                        {g.tipo === "cpf" ? formatarCpf(g.chave) : g.tipo === "matricula" ? g.chave : ""}
                      </span>
                      {g.tipo === "nome" && (
                        <Badge variant="outline" className={g.mesmoNascimento ? "border-warning/40 text-warning-fg" : "text-muted-foreground"}>
                          {g.mesmoNascimento ? "mesmo nascimento" : "só o nome"}
                        </Badge>
                      )}
                      {ativos > 1 && (
                        <Badge variant="outline" className="border-destructive/40 text-destructive">
                          {ativos} ativos
                        </Badge>
                      )}
                      {g.pessoasDiferentes && g.tipo !== "nome" && (
                        <Badge variant="outline" className="border-destructive/40 text-destructive">
                          nomes diferentes — confira antes de mesclar
                        </Badge>
                      )}
                    </div>
                    <AcoesDoGrupo tipo={g.tipo} chave={g.chave} ids={g.cadastros.map((c) => c.id)} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nome</TableHead>
                          <TableHead>CPF</TableHead>
                          <TableHead>Matrícula</TableHead>
                          <TableHead className="hidden md:table-cell">Nascimento</TableHead>
                          <TableHead>Condição</TableHead>
                          <TableHead className="hidden lg:table-cell">Criado em</TableHead>
                          <TableHead className="text-right">Vínculos</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {g.cadastros.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell className="max-w-64 truncate font-medium">
                              <Link href={`/painel/filiados/${c.id}`} target="_blank" className="hover:underline">
                                {c.nome ?? "—"}
                              </Link>
                            </TableCell>
                            <TableCell className="tabular-nums">{c.cpf ? formatarCpf(c.cpf) : "—"}</TableCell>
                            <TableCell className="tabular-nums">{c.matricula ?? "—"}</TableCell>
                            <TableCell className="hidden md:table-cell">{formatarData(c.nascimento)}</TableCell>
                            <TableCell>{c.condicao ?? "—"}</TableCell>
                            <TableCell className="text-muted-foreground hidden lg:table-cell">
                              {formatarData(c.criadoEm)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{c.vinculos}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )
          })}
          <Paginacao
            total={pagina.total}
            pagina={pagina.pagina}
            totalPaginas={pagina.totalPaginas}
            porPagina={paginacao.porPagina}
            padrao={30}
          />
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        A varredura passa por todos os cadastros não excluídos e fica guardada por 10 minutos.
        Última apuração: {formatarDataHora(dados.geradoEm)}.
      </p>
    </>
  )
}
