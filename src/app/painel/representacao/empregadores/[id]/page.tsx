import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  Landmark,
  Link2,
  Pencil,
  Receipt,
  ScrollText,
  UserRoundCheck,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import {
  buscarFontePagadora,
  estatisticasFonteDetalhe,
} from "@/lib/db/fontes"
import { listarDocumentosEmpregador } from "@/lib/db/representacao-docs"
import { formatarCnpjCpf, formatarData } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"
import { ROTULO_TIPO_DOC } from "@/lib/representacao-docs-constantes"

import {
  AdicionarDocumento,
  BotaoExcluirDocumento,
} from "./empregador-docs-forms"

export const metadata: Metadata = { title: "Empregador — Confluir" }

function Campo({
  rotulo,
  children,
}: {
  rotulo: string
  children: React.ReactNode
}) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="mt-0.5 text-sm">{children ?? "—"}</dd>
    </div>
  )
}

export default async function FontePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const sessao = await requirePermissao("empregadores")
  const podeEditar = podeAcessar(sessao.permissoes, "empregadores")

  const { id } = await params
  const fonte = await buscarFontePagadora(id)
  if (!fonte) notFound()
  const stats = await estatisticasFonteDetalhe(id)
  const documentos = await listarDocumentosEmpregador(id)

  const nome = fonte.nome_fantasia ?? fonte.nome_razao ?? "(sem nome)"

  const indicadores = [
    {
      titulo: "Filiados ativos",
      valor: stats.filiadosAtivos,
      detalhe: "pessoas com condição “Ativo” e vínculo em aberto",
      icone: UserRoundCheck,
      href: `/painel/filiados/lista?fonte=${id}&condicao=Ativo&situacao=todas`,
    },
    {
      titulo: "Vínculos em aberto",
      valor: stats.vinculosAbertos,
      detalhe: "sem data de desfiliação",
      icone: Link2,
      href: `/painel/filiados/lista?fonte=${id}&situacao=todas`,
    },
    {
      titulo: "Vínculos no histórico",
      valor: stats.vinculosTotal,
      detalhe: "todos os vínculos já registrados",
      icone: Landmark,
      href: `/painel/filiados/lista?fonte=${id}&situacao=todas`,
    },
    {
      titulo: "Contribuições",
      valor: stats.contribuicoes,
      detalhe:
        stats.contribuicoes === null
          ? "contagem indisponível agora — recarregue"
          : "lançamentos ligados à fonte",
      icone: Receipt,
      href: null,
    },
  ]

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/representacao/empregadores">
            <ArrowLeft />
            Empregadores
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{nome}</h1>
              <Badge variant="outline" className="text-muted-foreground">
                {fonte.fundo_pensao === true ? "Fundo de pensão" : "Empregador"}
              </Badge>
              {fonte.inativa === true ? (
                <Badge variant="outline" className="text-muted-foreground">
                  Inativa
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-success/40 text-success-fg"
                >
                  Ativa
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1 font-mono text-sm">
              {formatarCnpjCpf(fonte.cnpj_cpf)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {podeEditar && (
              <Button variant="outline" asChild>
                <Link href={`/painel/representacao/empregadores/${id}/editar`}>
                  <Pencil />
                  Editar
                </Link>
              </Button>
            )}
            <Button asChild>
              <Link
                href={`/painel/filiados/lista?fonte=${id}&condicao=Ativo&situacao=todas`}
              >
                Ver filiados da fonte
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {indicadores.map((ind) => {
          const conteudo = (
            <Card
              key={ind.titulo}
              className={
                ind.href
                  ? "group-hover:border-primary/40 h-full transition-colors"
                  : "h-full"
              }
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardDescription>{ind.titulo}</CardDescription>
                  <ind.icone className="text-muted-foreground size-4" />
                </div>
                <CardTitle className="text-2xl tabular-nums">
                  {ind.valor === null ? "—" : ind.valor.toLocaleString("pt-BR")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-xs">{ind.detalhe}</p>
              </CardContent>
            </Card>
          )
          return ind.href ? (
            <Link key={ind.titulo} href={ind.href} className="group">
              {conteudo}
            </Link>
          ) : (
            conteudo
          )
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados da fonte</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
            <Campo rotulo="Nome">{fonte.nome_fantasia ?? "—"}</Campo>
            <Campo rotulo="Razão social">{fonte.nome_razao ?? "—"}</Campo>
            <Campo rotulo="CNPJ / CPF">
              {formatarCnpjCpf(fonte.cnpj_cpf)}
            </Campo>
            <Campo rotulo="Tipo">
              {fonte.fundo_pensao === true ? "Fundo de pensão" : "Empregador"}
            </Campo>
            <Campo rotulo="Cadastro">{formatarData(fonte.created_at)}</Campo>
            <Campo rotulo="Inativa desde">
              {fonte.inativa === true ? formatarData(fonte.inativa_data) : "—"}
            </Campo>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Documentação legal</CardTitle>
              <CardDescription>
                Cartas, atas, editais e demais documentos da representação
              </CardDescription>
            </div>
            <ScrollText className="text-muted-foreground size-4" />
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          {documentos.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhum documento cadastrado.
            </p>
          ) : (
            <ul className="grid gap-2">
              {documentos.map((d) => (
                <li
                  key={d.id}
                  className="border-border flex items-start justify-between gap-2 rounded-md border p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {d.numero && (
                        <span className="text-muted-foreground mr-1 tabular-nums">
                          {d.numero}
                        </span>
                      )}
                      {d.titulo ?? "(sem título)"}{" "}
                      <Badge variant="secondary" className="ml-1 align-middle">
                        {ROTULO_TIPO_DOC[d.tipo]}
                      </Badge>
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {d.data_documento
                        ? formatarData(d.data_documento)
                        : "sem data"}
                      {d.vigencia_fim && (
                        <> · vigência até {formatarData(d.vigencia_fim)}</>
                      )}
                      {d.arquivoUrl && (
                        <>
                          {" · "}
                          <a
                            href={d.arquivoUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary inline-flex items-center gap-1 hover:underline"
                          >
                            <FileText className="size-3" /> abrir PDF
                          </a>
                        </>
                      )}
                    </p>
                    {d.observacoes && (
                      <p className="text-muted-foreground mt-0.5 text-xs whitespace-pre-wrap">
                        {d.observacoes}
                      </p>
                    )}
                  </div>
                  {podeEditar && (
                    <BotaoExcluirDocumento documentoId={d.id} empresaId={id} />
                  )}
                </li>
              ))}
            </ul>
          )}
          {podeEditar && <AdicionarDocumento empresaId={id} />}
        </CardContent>
      </Card>
    </>
  )
}
