import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  MessageCircle,
  Pencil,
  Plus,
} from "lucide-react"

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
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { TrilhaEtapas } from "@/components/trilha-etapas"
import { requirePermissao } from "@/lib/auth"
import { iniciarVisualizacaoFiliado } from "@/lib/actions/visualizacao"
import { marcosDaTrilha, proximaCondicao } from "@/lib/filiacao"
import { formatarCpf } from "@/lib/cpf"
import {
  obterTermosAceitos,
  type TermoAceito,
} from "@/lib/db/filiacao-termos"
import { buscarPerfilFiliado } from "@/lib/db/filiados"
import { listarProntuario } from "@/lib/db/prontuario"
import {
  formatarCep,
  formatarData,
  formatarMoeda,
  formatarTelefone,
} from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { SituacaoBadge } from "../../financeiro/situacao-badge"
import { CondicaoBadge } from "../condicao-badge"
import { avancarEtapa } from "../acompanhamento/actions"

export const metadata: Metadata = { title: "Filiado — Confluir" }

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
      <dd className="mt-0.5 text-sm break-words">{children ?? "—"}</dd>
    </div>
  )
}

function texto(valor: unknown): string {
  return typeof valor === "string" && valor.trim() ? valor : "—"
}

function Consentimento({
  titulo,
  data,
  termo,
}: {
  titulo: string
  data: string | null
  termo: TermoAceito | null
}) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm font-medium">{titulo}</p>
      {data ? (
        <>
          <p className="text-muted-foreground mt-1 text-xs">
            Aceito em {formatarData(data)}
            {termo?.codigo ? (
              <> · versão {termo.codigo}</>
            ) : (
              <> · versão não identificada</>
            )}
          </p>
          {termo?.texto && (
            <div className="mt-3">
              <GrupoColapsavel titulo="Ver texto aceito">
                <p className="text-sm whitespace-pre-wrap">{termo.texto}</p>
              </GrupoColapsavel>
            </div>
          )}
        </>
      ) : (
        <p className="text-muted-foreground mt-1 text-xs">
          Sem aceite registrado
        </p>
      )}
    </div>
  )
}

export default async function FiliadoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string; etapa?: string }>
}) {
  const sessao = await requirePermissao("filiacao_filiados", [
    "filiacao_gestao",
    "filiacao_receitas",
  ])
  const podeEditar = podeAcessar(sessao.permissoes, "filiacao_gestao")

  const { id } = await params
  const { salvo, etapa } = await searchParams
  const [perfil, prontuario] = await Promise.all([
    buscarPerfilFiliado(id),
    listarProntuario(id, 5),
  ])
  if (!perfil) notFound()

  const {
    filiacao: f,
    outrosRegistros,
    vinculos,
    contribuicoes,
    reembolsos,
  } = perfil

  const idTermo = (v: unknown) => (typeof v === "string" && v ? v : null)
  const aceites = await obterTermosAceitos(
    idTermo(f.tl_lgpd_id),
    idTermo(f.tl_desconto_id)
  )

  // Situação derivada dos vínculos de filiação (padrão do sistema antigo)
  const filiacaoAberta = vinculos.some(
    (v) => !v.data_desfiliacao && !v.filiacao_data_saida
  )
  const primeiraFiliacao = vinculos
    .flatMap((v) => [v.data_filiacao, v.filiacao_data_adesao])
    .filter((d): d is string => Boolean(d))
    .sort()[0]
  const endereco = [
    texto(f.endereco_logradouro) !== "—" &&
      `${f.endereco_logradouro}${f.endereco_numero ? `, ${f.endereco_numero}` : ""}`,
    texto(f.endereco_complemento) !== "—" && f.endereco_complemento,
    texto(f.endereco_bairro) !== "—" && f.endereco_bairro,
  ]
    .filter(Boolean)
    .join(" — ")

  // Gráfico de etapas: aparece só quando há processo (filiação/desfiliação)
  // em andamento. As datas dos marcos saem das colunas de filiacoes.
  const condicaoAtual =
    typeof f.filiacao_condicao === "string" ? f.filiacao_condicao : null
  const dataCol = (v: unknown) => (typeof v === "string" ? v : null)
  const trilha = marcosDaTrilha(condicaoAtual, {
    created_at: dataCol(f.created_at),
    ficha_assinada_em: dataCol(f.ficha_assinada_em),
    filiacao_informada_fonte_em: dataCol(f.filiacao_informada_fonte_em),
    ativo_em: dataCol(f.ativo_em),
    desfiliacao_informada_fonte_em: dataCol(f.desfiliacao_informada_fonte_em),
    inativo_em: dataCol(f.inativo_em),
  })
  const proximaEtapa = proximaCondicao(condicaoAtual)

  return (
    <>
      <div>
        <div className="mb-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link href="/painel/filiados/lista">
              <ArrowLeft />
              Filiados
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <form action={iniciarVisualizacaoFiliado}>
              <input type="hidden" name="filiacaoId" value={f.id} />
              <Button variant="outline" size="sm" type="submit">
                <Eye />
                Visualizar área
              </Button>
            </form>
            {podeEditar && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/painel/filiados/${f.id}/editar`}>
                  <Pencil />
                  Editar cadastro
                </Link>
              </Button>
            )}
          </div>
        </div>
        {salvo === "1" && (
          <Alert className="mb-4 border-success/40 text-success-fg">
            <AlertDescription>Cadastro atualizado com sucesso.</AlertDescription>
          </Alert>
        )}
        {etapa === "ok" && (
          <Alert className="mb-4 border-success/40 text-success-fg">
            <AlertDescription>Etapa avançada.</AlertDescription>
          </Alert>
        )}
        {etapa === "fim" && (
          <Alert variant="warning" className="mb-4">
            <AlertDescription>
              Este cadastro já está no estágio final do processo.
            </AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight break-words min-w-0">
            {texto(f.nome_completo)}
          </h1>
          {f.filiacao_excluida === true ? (
            <Badge variant="outline" className="text-destructive border-destructive/40">
              Filiação excluída
            </Badge>
          ) : typeof f.filiacao_condicao === "string" ? (
            <CondicaoBadge condicao={f.filiacao_condicao} />
          ) : filiacaoAberta ? (
            // Fallback para registros sem condição: situação derivada dos vínculos
            <Badge variant="outline" className="border-success/40 text-success-fg">
              Ativo
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              Desfiliado
            </Badge>
          )}
          {typeof f.nome_social === "string" && f.nome_social.trim() && (
            <span className="text-muted-foreground text-sm">
              Nome social: {f.nome_social}
            </span>
          )}
        </div>
        <p className="text-muted-foreground mt-1 font-mono text-sm">
          {f.cpf ? formatarCpf(f.cpf) : "CPF não informado"}
          {f.matricula_sindical && <> · matrícula {f.matricula_sindical}</>}
        </p>
      </div>

      {trilha && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">
                  {trilha.processo === "filiacao"
                    ? "Processo de filiação"
                    : "Processo de desfiliação"}
                </CardTitle>
                <CardDescription>
                  Etapa atual: {condicaoAtual}
                </CardDescription>
              </div>
              {podeEditar && proximaEtapa && (
                <form action={avancarEtapa}>
                  <input type="hidden" name="filiado_id" value={f.id} />
                  <input
                    type="hidden"
                    name="redirect_to"
                    value={`/painel/filiados/${f.id}`}
                  />
                  <Button type="submit" variant="outline" size="sm">
                    Avançar etapa
                    <ArrowRight />
                  </Button>
                </form>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-1">
            <TrilhaEtapas marcos={trilha.marcos} />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Identificação</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Campo rotulo="Nascimento">
                {formatarData(f.nascimento_data as string | null)}
              </Campo>
              <Campo rotulo="Sexo">{texto(f.sexo)}</Campo>
              <Campo rotulo="Primeira filiação em">
                {formatarData(primeiraFiliacao)}
              </Campo>
              <Campo rotulo="Atualizado em">
                {formatarData(f.updated_at as string | null)}
              </Campo>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contato</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-y-3">
              <Campo rotulo="Email pessoal">
                {texto(f.email_pessoal)}
              </Campo>
              <Campo rotulo="Email corporativo">
                {texto(f.email_corporativo)}
              </Campo>
              <div className="grid grid-cols-2 gap-x-4 [&>*]:min-w-0">
                <Campo rotulo="Telefone 1">
                  <span className="inline-flex items-center gap-1.5">
                    {formatarTelefone(f.telefone_1 as string | null)}
                    {f.telefone_1_whatsapp === true && (
                      <MessageCircle className="size-3.5 text-success-fg" aria-label="WhatsApp" />
                    )}
                  </span>
                </Campo>
                <Campo rotulo="Telefone 2">
                  <span className="inline-flex items-center gap-1.5">
                    {formatarTelefone(f.telefone_2 as string | null)}
                    {f.telefone_2_whatsapp === true && (
                      <MessageCircle className="size-3.5 text-success-fg" aria-label="WhatsApp" />
                    )}
                  </span>
                </Campo>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Endereço</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-y-3">
              <Campo rotulo="Endereço">{endereco || "—"}</Campo>
              <div className="grid grid-cols-2 gap-x-4 [&>*]:min-w-0">
                <Campo rotulo="Cidade / UF">
                  {texto(f.endereco_cidade) !== "—"
                    ? `${f.endereco_cidade}${f.endereco_estado ? ` / ${f.endereco_estado}` : ""}`
                    : "—"}
                </Campo>
                <Campo rotulo="CEP">
                  {formatarCep(f.endereco_cep as string | null)}
                </Campo>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Consentimentos</CardTitle>
          <CardDescription>
            Termos de LGPD e de desconto que o filiado aceitou
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Consentimento
            titulo="Proteção de dados (LGPD)"
            data={f.tl_lgpd_data as string | null}
            termo={aceites.lgpd}
          />
          <Consentimento
            titulo="Desconto em folha"
            data={f.tl_desconto_data as string | null}
            termo={aceites.desconto}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              Histórico de filiação
              <span className="text-muted-foreground ml-2 text-sm font-normal">
                {vinculos.length} registro{vinculos.length === 1 ? "" : "s"}
              </span>
            </CardTitle>
            {podeEditar && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/painel/filiados/${f.id}/vinculos/novo`}>
                  <Plus />
                  Adicionar vínculo
                </Link>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {vinculos.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Nenhum vínculo registrado.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fonte pagadora</TableHead>
                    <TableHead>Cargo</TableHead>
                    <TableHead className="hidden md:table-cell">
                      Lotação
                    </TableHead>
                    <TableHead className="hidden lg:table-cell">
                      Matrícula
                    </TableHead>
                    <TableHead>Admissão</TableHead>
                    <TableHead className="hidden xl:table-cell">
                      Demissão
                    </TableHead>
                    <TableHead>Filiação</TableHead>
                    <TableHead>Desfiliação</TableHead>
                    <TableHead className="hidden lg:table-cell">
                      Condição
                    </TableHead>
                    {podeEditar && <TableHead className="w-10" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vinculos.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="max-w-52 truncate font-medium">
                        {v.fontePagadora ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-40 truncate">
                        {v.cargo ?? v.fonte_pg_cargo ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden max-w-40 truncate md:table-cell">
                        {v.lotacao ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden lg:table-cell">
                        {v.matricula ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {formatarData(
                          v.data_entrada_admissao ?? v.fonte_pg_admissao
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden whitespace-nowrap xl:table-cell">
                        {formatarData(v.data_saida_demissao)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatarData(v.data_filiacao ?? v.filiacao_data_adesao)}
                      </TableCell>
                      <TableCell>
                        {formatarData(
                          v.data_desfiliacao ?? v.filiacao_data_saida
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden lg:table-cell">
                        {v.filiacao_condicao ?? "—"}
                      </TableCell>
                      {podeEditar && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            asChild
                            className="size-7"
                          >
                            <Link
                              href={`/painel/filiados/${f.id}/vinculos/${v.id}`}
                              aria-label="Editar vínculo"
                            >
                              <Pencil className="size-3.5" />
                            </Link>
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">
                Contribuições
                <span className="text-muted-foreground ml-2 text-sm font-normal">
                  {contribuicoes.total.toLocaleString("pt-BR")} no total —
                  últimas {contribuicoes.ultimas.length}
                </span>
              </CardTitle>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/painel/filiados/${f.id}/contribuicoes`}>
                  Ver todas
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {contribuicoes.ultimas.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                Nenhuma contribuição registrada.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Competência</TableHead>
                    <TableHead className="hidden sm:table-cell">Fonte</TableHead>
                    <TableHead className="hidden md:table-cell">Tipo</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contribuicoes.ultimas.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {c.competencia ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden max-w-40 truncate sm:table-cell">
                        {c.fonte ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden md:table-cell">
                        {c.tipo ?? "—"}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {formatarMoeda(c.valor)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Reembolsos e pagamentos
              <span className="text-muted-foreground ml-2 text-sm font-normal">
                {reembolsos.total.toLocaleString("pt-BR")} no total
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {reembolsos.ultimos.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                Nenhuma ordem de pagamento em favor deste filiado.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="hidden sm:table-cell">Tipo</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reembolsos.ultimos.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="max-w-44 truncate font-medium">
                        {r.descricao ?? r.codigo ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden max-w-36 truncate sm:table-cell">
                        {r.tipo ?? "—"}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {formatarMoeda(r.valor_pago)}
                      </TableCell>
                      <TableCell>
                        <SituacaoBadge situacao={r.situacao} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              Prontuário
              <span className="text-muted-foreground ml-2 text-sm font-normal">
                {prontuario.disponivel
                  ? `${prontuario.total.toLocaleString("pt-BR")} apontamento${prontuario.total === 1 ? "" : "s"} — últimos ${prontuario.apontamentos.length}`
                  : "indisponível"}
              </span>
            </CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/painel/filiados/${f.id}/prontuario`}>
                {podeEditar ? "Ver todos / registrar" : "Ver todos"}
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!prontuario.disponivel ? (
            <p className="text-muted-foreground text-sm">
              A tabela do prontuário ainda não existe no banco.
            </p>
          ) : prontuario.apontamentos.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              Nenhum apontamento registrado.
            </p>
          ) : (
            <ul className="grid gap-2.5">
              {prontuario.apontamentos.map((a) => (
                <li key={a.id} className="flex items-start gap-3 text-sm">
                  <span className="text-muted-foreground w-20 shrink-0 text-xs leading-5 tabular-nums">
                    {formatarData(a.data)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate">
                      {a.descricao ?? "—"}
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      {[a.tipo, a.autor && `por ${a.autor}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {outrosRegistros.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Outros registros deste CPF
              <span className="text-muted-foreground ml-2 text-sm font-normal">
                dado migrado do Bubble — mesma pessoa
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {outrosRegistros.map((o) => (
              <Link
                key={o.id}
                href={`/painel/filiados/${o.id}`}
                className="hover:bg-muted/60 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm transition-colors"
              >
                <span className="font-medium">{o.nome_completo ?? "(sem nome)"}</span>
                <span className="text-muted-foreground flex items-center gap-3 text-xs">
                  {o.matricula_sindical && <span>mat. {o.matricula_sindical}</span>}
                  <span>cadastro {formatarData(o.created_at)}</span>
                  {o.filiacao_excluida === true ? (
                    <Badge variant="outline" className="text-destructive border-destructive/40">
                      Excluída
                    </Badge>
                  ) : (
                    <CondicaoBadge condicao={o.filiacao_condicao} />
                  )}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  )
}
