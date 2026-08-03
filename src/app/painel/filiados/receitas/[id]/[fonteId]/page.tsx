import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, BadgeCheck, ExternalLink, Search } from "lucide-react"

import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
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
import { nomesDeEmpresas } from "@/lib/db/fontes"
import {
  buscarRemessa,
  listarRemessas,
  recebimentosDaRemessa,
  relatorioFonteRemessa,
} from "@/lib/db/receitas"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { createAdminClient } from "@/lib/supabase/admin"

import { EnviarContribuicoes } from "./enviar-contribuicoes"
import { ExcluirLancamentosFonte } from "./excluir-lancamentos-fonte"
import { LancamentoAcoes } from "./lancamento-acoes"
import {
  ListaAtivosNaoPagantes,
  ListaPagantesNaoAtivos,
} from "./listas-conferencia"
import { RecebimentoForm } from "./recebimento-form"
import { TrocarRemessa } from "./trocar-remessa"

export const metadata: Metadata = { title: "Relatório da fonte — Confluir" }

const POR_PAGINA = 100

export default async function RelatorioFontePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; fonteId: string }>
  searchParams: Promise<{
    busca?: string
    pagina?: string
    salvo?: string
    contribuicao?: string
    excluido?: string
    fonte_limpa?: string
    condicoes?: string
  }>
}) {
  await requirePermissao("filiacao_receitas", ["filiacao_gestao"])

  const { id, fonteId } = await params
  const sp = await searchParams
  const busca = sp.busca ?? ""

  const [remessa, cargaRelatorio, recebimentos, nomes, todasRemessas] =
    await Promise.all([
    buscarRemessa(id),
    relatorioFonteRemessa(id, fonteId).then(
      (relatorio) => ({ relatorio, erro: null as string | null }),
      (e: unknown) => ({
        relatorio: null,
        erro:
          e instanceof Error && e.message.includes("timeout")
            ? "A consulta dos lançamentos excedeu o tempo limite do banco — recarregue a página."
            : "Falha ao carregar o relatório.",
      })
    ),
    recebimentosDaRemessa(id),
    nomesDeEmpresas([fonteId]),
    listarRemessas(),
  ])
  if (!remessa) notFound()

  const opcoesRemessa = todasRemessas
    .filter((r) => r.id !== id)
    .map((r) => ({ id: r.id, rotulo: `${r.rotulo} ${r.tipo ?? ""}`.trim() }))

  const nomeFonte = nomes.get(fonteId) ?? "(sem nome)"
  const recebimento = recebimentos.get(fonteId) ?? null

  // Comprovante: caminho no Storage vira link assinado; URLs antigas passam direto
  let urlComprovante: string | null = null
  if (recebimento?.comprovante) {
    if (/^https?:\/\//.test(recebimento.comprovante)) {
      urlComprovante = recebimento.comprovante
    } else {
      const admin = await createAdminClient()
      const { data } = await admin.storage
        .from("comprovantes")
        .createSignedUrl(recebimento.comprovante, 3600)
      urlComprovante = data?.signedUrl ?? null
    }
  }

  const relatorio = cargaRelatorio.relatorio ?? {
    lancamentos: [],
    naoEncontrados: [],
    pagantesNaoAtivos: [],
    ativosNaoPagantes: [],
  }
  const { lancamentos, naoEncontrados, pagantesNaoAtivos, ativosNaoPagantes } =
    relatorio

  const total = lancamentos.reduce((s, l) => s + (l.valor ?? 0), 0)
  const valores = lancamentos.map((l) => l.valor ?? 0)
  const stats = {
    total,
    pagantes: lancamentos.length,
    media: lancamentos.length ? total / lancamentos.length : 0,
    maior: valores.length ? Math.max(...valores) : 0,
    menor: valores.length ? Math.min(...valores) : 0,
  }

  const termo = busca.trim().toLowerCase()
  const filtrados = termo
    ? lancamentos.filter((l) => (l.nome ?? "").toLowerCase().includes(termo))
    : lancamentos
  const pagina = Math.max(1, Number(sp.pagina) || 1)
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const daPagina = filtrados.slice(
    (paginaAtual - 1) * POR_PAGINA,
    paginaAtual * POR_PAGINA
  )
  const urlPagina = (p: number) =>
    `/painel/filiados/receitas/${id}/${fonteId}?${new URLSearchParams({
      ...(busca ? { busca } : {}),
      ...(p > 1 ? { pagina: String(p) } : {}),
    }).toString()}`

  return (
    <>
      <RotuloTrilha
        valores={{
          [id]: `Remessa ${remessa.tipo ?? ""} ${remessa.rotulo}`.trim(),
          [fonteId]: nomeFonte,
        }}
      />
      {sp.fonte_limpa && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            {Number(sp.fonte_limpa).toLocaleString("pt-BR")} lançamento(s) desta
            fonte foram excluídos.
          </AlertDescription>
        </Alert>
      )}
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={`/painel/filiados/receitas/${id}`}>
            <ArrowLeft />
            Remessa {remessa.tipo ?? ""} {remessa.rotulo}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Remessa {remessa.tipo ?? ""} {remessa.rotulo} —{" "}
          <Link
            href={`/painel/representacao/empregadores/${fonteId}`}
            className="underline-offset-4 hover:underline"
          >
            {nomeFonte}
          </Link>
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          {stats.pagantes.toLocaleString("pt-BR")} filiado
          {stats.pagantes === 1 ? "" : "s"} pagante
          {stats.pagantes === 1 ? "" : "s"} · média{" "}
          {formatarMoeda(stats.media)} · maior {formatarMoeda(stats.maior)} ·
          menor {formatarMoeda(stats.menor)} · informado{" "}
          {formatarMoeda(stats.total)}
        </p>
      </div>

      {sp.salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Registro salvo.</AlertDescription>
        </Alert>
      )}
      {sp.contribuicao === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Contribuição incluída.</AlertDescription>
        </Alert>
      )}
      {sp.excluido === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Lançamento excluído.</AlertDescription>
        </Alert>
      )}
      {sp.condicoes === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            Condição dos cadastros marcados atualizada.
          </AlertDescription>
        </Alert>
      )}
      {cargaRelatorio.erro && (
        <Alert variant="destructive">
          <AlertDescription>{cargaRelatorio.erro}</AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <div className="grid gap-4 xl:order-2">
      <GrupoColapsavel
        titulo="Recebimento"
        descricao="Depósito bancário desta fonte na remessa"
        resumo={
          recebimento?.data || recebimento?.valor ? (
            <span className="inline-flex items-center gap-1.5 text-sm whitespace-nowrap">
              <BadgeCheck className="size-4 text-success-fg" />
              {formatarData(recebimento.data)} ·{" "}
              {formatarMoeda(recebimento.valor)}
            </span>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              Sem registro
            </Badge>
          )
        }
      >
        <div className="grid gap-4">
          {urlComprovante && (
            <p className="text-sm">
              <a
                href={urlComprovante}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 underline underline-offset-2"
              >
                Ver comprovante do depósito
                <ExternalLink className="size-3.5" />
              </a>
            </p>
          )}
          <RecebimentoForm
            remessaId={id}
            fonteId={fonteId}
            atual={recebimento}
          />
        </div>
      </GrupoColapsavel>

      <GrupoColapsavel
        titulo="Enviar relação de pagamentos"
        descricao="Importa a remessa de contribuições (CSV) ou inclui um filiado por vez"
      >
        <EnviarContribuicoes remessaId={id} fonteId={fonteId} />
      </GrupoColapsavel>

      <GrupoColapsavel
        titulo="Gerenciar lançamentos desta fonte"
        descricao="Mover para outra remessa ou excluir a relação enviada"
      >
        <div className="grid gap-6">
          <div className="grid gap-1.5">
            <p className="text-sm font-medium">Trocar remessa</p>
            <p className="text-muted-foreground text-xs">
              Move os recebimentos desta fonte para outra remessa.
            </p>
            <TrocarRemessa
              remessaId={id}
              fonteId={fonteId}
              opcoes={opcoesRemessa}
            />
          </div>
          <div className="border-destructive/30 grid gap-2 rounded-md border border-dashed p-3">
            <p className="text-destructive text-sm font-medium">
              Excluir todos os lançamentos desta fonte
            </p>
            <ExcluirLancamentosFonte
              remessaId={id}
              fonteId={fonteId}
              quantidade={lancamentos.length}
            />
          </div>
        </div>
      </GrupoColapsavel>

      <GrupoColapsavel
        titulo="Filiados ativos não pagantes"
        descricao="Ativos com vínculo nesta fonte fora da relação enviada"
        resumo={
          <Badge variant="outline" className="text-muted-foreground tabular-nums">
            {ativosNaoPagantes.length.toLocaleString("pt-BR")}
          </Badge>
        }
      >
        <ListaAtivosNaoPagantes
          remessaId={id}
          fonteId={fonteId}
          linhas={ativosNaoPagantes}
        />
      </GrupoColapsavel>

      <GrupoColapsavel
        titulo="Pagantes não ativos"
        descricao="Pagamentos sem cadastro encontrado ou sem condição “Ativo”"
        resumo={
          <Badge variant="outline" className="text-muted-foreground tabular-nums">
            {(naoEncontrados.length + pagantesNaoAtivos.length).toLocaleString(
              "pt-BR"
            )}
          </Badge>
        }
      >
        <ListaPagantesNaoAtivos
          remessaId={id}
          fonteId={fonteId}
          pagantes={pagantesNaoAtivos.map((l) => ({
            id: l.id,
            filiadoId: l.filiadoId!,
            nome: l.nome,
            condicao: l.condicao,
            valor: l.valor,
          }))}
          naoEncontrados={naoEncontrados.map((l) => ({
            id: l.id,
            matriculaFonte: l.matriculaFonte,
            cpf: l.cpf,
            valor: l.valor,
          }))}
        />
      </GrupoColapsavel>
        </div>

      <Card className="xl:order-1">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">
                Relatório — filiados pagantes (
                {stats.pagantes.toLocaleString("pt-BR")})
              </CardTitle>
              <CardDescription>
                Trabalhadores descontados informados pela fonte
              </CardDescription>
            </div>
            <form method="GET" className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                name="busca"
                defaultValue={busca}
                placeholder="Buscar trabalhador"
                className="w-56 pl-8"
                aria-label="Buscar trabalhador no relatório"
              />
            </form>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          {daPagina.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              {termo
                ? `Nenhum pagante encontrado para “${busca.trim()}”.`
                : "Nenhum lançamento nesta fonte."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Filiado</TableHead>
                  <TableHead className="hidden md:table-cell">
                    Matrícula na fonte
                  </TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {daPagina.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="max-w-72 font-medium">
                      <Link
                        href={`/painel/filiados/${l.filiadoId}`}
                        className="hover:underline"
                      >
                        <span className="block truncate">
                          {l.nome ?? "(sem nome)"}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden font-mono text-xs md:table-cell">
                      {l.matriculaFonte ?? "—"}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {formatarMoeda(l.valor)}
                    </TableCell>
                    <TableCell>
                      <LancamentoAcoes
                        remessaId={id}
                        fonteId={fonteId}
                        lancamentoId={l.id}
                        valor={l.valor}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {totalPaginas > 1 && (
            <div className="flex items-center justify-between gap-4">
              <p className="text-muted-foreground text-sm">
                Página {paginaAtual} de {totalPaginas}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" asChild disabled={paginaAtual <= 1}>
                  {paginaAtual > 1 ? (
                    <Link href={urlPagina(paginaAtual - 1)}>Anterior</Link>
                  ) : (
                    <span>Anterior</span>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  disabled={paginaAtual >= totalPaginas}
                >
                  {paginaAtual < totalPaginas ? (
                    <Link href={urlPagina(paginaAtual + 1)}>Próxima</Link>
                  ) : (
                    <span>Próxima</span>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      </div>
    </>
  )
}
