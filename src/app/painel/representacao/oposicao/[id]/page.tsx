import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Pencil } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Paginacao } from "@/components/paginacao"
import { requirePermissao } from "@/lib/auth"
import {
  fonteIdsDaCampanha,
  listarOpositores,
  obterCampanha,
  opcoesFontes,
} from "@/lib/db/oposicao"
import { formatarData } from "@/lib/formato"
import { mascaraCpf } from "@/lib/mascaras"
import {
  MODOS_FORMALIZACAO,
  ROTULO_SITUACAO_OPOSITOR,
  SITUACOES_OPOSITOR,
  type SituacaoOpositor,
} from "@/lib/oposicao-constantes"

import {
  AdicionarPergunta,
  BotaoExcluirPergunta,
  CampanhaForm,
} from "../oposicao-forms"

export const metadata: Metadata = {
  title: "Campanha de oposição — Confluir",
}

const VARIANTE: Record<SituacaoOpositor, "secondary" | "outline"> = {
  aprovada: "secondary",
  reprovada: "outline",
  nao_avaliada: "outline",
  desistente: "outline",
  aguardando_documento: "outline",
}

export default async function CampanhaOposicaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    situacao?: string
    busca?: string
    pagina?: string
    editar?: string
    salvo?: string
  }>
}) {
  await requirePermissao("oposicao")

  const { id } = await params
  const brutos = await searchParams
  const campanha = await obterCampanha(id)
  if (!campanha) notFound()

  const editando = brutos.editar === "1"
  const [fontes, fonteIds] = editando
    ? await Promise.all([opcoesFontes(), fonteIdsDaCampanha(id)])
    : [[], []]

  const situacao = SITUACOES_OPOSITOR.some((s) => s.chave === brutos.situacao)
    ? (brutos.situacao as SituacaoOpositor)
    : "todas"
  const busca = (brutos.busca ?? "").trim()
  const pagina = Math.max(1, Number(brutos.pagina) || 1)

  const lista = await listarOpositores({
    campanhaId: id,
    situacao,
    busca,
    pagina,
  })

  const modo = MODOS_FORMALIZACAO.find(
    (m) => m.chave === campanha.modo_formalizacao
  )
  const aqui = `/painel/representacao/oposicao/${id}`

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/representacao/oposicao">
            <ArrowLeft />
            Oposição
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          {campanha.nome ?? campanha.codigo ?? "(sem nome)"}
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Prazo {formatarData(campanha.prazo_inicio)} –{" "}
          {formatarData(campanha.prazo_fim)}
          {campanha.fontes.length > 0 && <> · {campanha.fontes.join(", ")}</>}
        </p>
      </div>

      {brutos.salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Campanha salva.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Dados da campanha</CardTitle>
            {!editando && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`${aqui}?editar=1`}>
                  <Pencil />
                  Editar
                </Link>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {editando ? (
            <CampanhaForm
              campanha={campanha}
              fontes={fontes}
              fonteIds={fonteIds}
              aoCancelarHref={aqui}
            />
          ) : (
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="text-muted-foreground text-xs">Contribuição</dt>
                <dd className="mt-0.5 text-sm">
                  {campanha.detalhe_desconto ?? "—"}
                </dd>
              </div>
              <Campo rotulo="Código" valor={campanha.codigo} />
              <Campo rotulo="Formalização" valor={modo?.rotulo ?? null} />
              <Campo
                rotulo="Fontes pagadoras"
                valor={campanha.fontes.join(", ") || null}
              />
              <Campo
                rotulo="Perguntas do questionário"
                valor={String(campanha.perguntas.length)}
              />
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Questionário</CardTitle>
          <CardDescription>
            Perguntas respondidas pelo trabalhador ao se opor.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {campanha.perguntas.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhuma pergunta cadastrada.
            </p>
          ) : (
            <ul className="grid gap-2">
              {campanha.perguntas.map((p, i) => (
                <li
                  key={p.id}
                  className="border-border flex items-start justify-between gap-2 rounded-md border p-3 text-sm"
                >
                  <span>
                    <span className="text-muted-foreground mr-1 tabular-nums">
                      {i + 1}.
                    </span>
                    {p.pergunta ?? "—"}
                  </span>
                  <BotaoExcluirPergunta perguntaId={p.id} campanhaId={id} />
                </li>
              ))}
            </ul>
          )}
          <AdicionarPergunta campanhaId={id} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {SITUACOES_OPOSITOR.map((s) => (
          <Link key={s.chave} href={`${aqui}?situacao=${s.chave}`}>
            <Card className="hover:border-primary/40 transition-colors">
              <CardContent className="py-4 text-center">
                <p className="text-2xl font-semibold tabular-nums">
                  {campanha.contagem[s.chave].toLocaleString("pt-BR")}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {s.rotulo}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Opositores</CardTitle>
          <CardDescription>
            {lista.total.toLocaleString("pt-BR")}
            {situacao !== "todas" && (
              <> · {ROTULO_SITUACAO_OPOSITOR[situacao]}</>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="mb-4 flex flex-wrap items-center gap-2" action={aqui}>
            <input
              type="search"
              name="busca"
              defaultValue={busca}
              placeholder="Nome, CPF ou matrícula"
              className="border-input bg-background h-9 w-64 max-w-full rounded-md border px-3 text-sm shadow-xs outline-none"
            />
            <select
              name="situacao"
              defaultValue={situacao}
              className="border-input bg-background h-9 rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
            >
              <option value="todas">Todas as situações</option>
              {SITUACOES_OPOSITOR.map((s) => (
                <option key={s.chave} value={s.chave}>
                  {s.rotulo}
                </option>
              ))}
            </select>
            <Button type="submit" variant="outline" size="sm">
              Filtrar
            </Button>
          </form>

          {lista.linhas.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              Nenhum opositor com esses filtros.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead>Matrícula</TableHead>
                  <TableHead>Fonte</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.linhas.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="max-w-64">
                      <Link
                        href={`/painel/representacao/oposicao/${id}/opositor/${o.id}`}
                        className="text-primary line-clamp-1 hover:underline"
                      >
                        {o.nome ?? "(sem nome)"}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {o.cpf ? mascaraCpf(o.cpf) : "—"}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {o.matricula ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-40">
                      <span className="line-clamp-1">
                        {o.empregadorNome ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="whitespace-nowrap">
                        {o.ehFiliado ? "Filiado" : "Não filiado"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={VARIANTE[o.situacao]}
                        className="whitespace-nowrap"
                      >
                        {ROTULO_SITUACAO_OPOSITOR[o.situacao]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <div className="mt-4">
            <Paginacao
              total={lista.total}
              pagina={lista.pagina}
              totalPaginas={lista.totalPaginas}
              porPagina={50}
              padrao={50}
            />
          </div>
        </CardContent>
      </Card>
    </>
  )
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="mt-0.5 text-sm">{valor ?? "—"}</dd>
    </div>
  )
}
