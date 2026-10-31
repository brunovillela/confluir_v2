import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Download, Settings2 } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { TileIndicador } from "@/components/graficos/tile"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { alertasDaLeitura, competenciaDoNome } from "@/lib/contracheque-leitura"
import { bloqueioDoItemCC, comContrachequeNaRemessa, liquidosAnteriores, obterImportacaoCC } from "@/lib/db/contracheque-importacao"
import { obterConfigContracheques } from "@/lib/db/contracheques-ordens"
import { buscarRemessaContracheques, funcionariosParaSelecao, naturezaRemessaContracheques, urlArquivoPessoal } from "@/lib/db/pessoal"
import { formatarData, formatarMoeda } from "@/lib/formato"

import { ConferenciaCC, type ItemTelaCC } from "./conferencia"

export const metadata: Metadata = { title: "Importação da folha de contracheques — Confluir" }
// A leitura pela IA roda em lotes chamados desta página.
export const maxDuration = 300

export default async function ImportacaoFolhaPage({ params }: { params: Promise<{ id: string; importacaoId: string }> }) {
  await requirePermissao("pessoal_gestao", ["pessoal_contracheque"])
  const { id, importacaoId } = await params
  const [remessa, imp, config, funcionarios, jaTem] = await Promise.all([
    buscarRemessaContracheques(id),
    obterImportacaoCC(importacaoId),
    obterConfigContracheques(),
    funcionariosParaSelecao(),
    comContrachequeNaRemessa(id),
  ])
  if (!remessa || !imp || imp.remessaId !== id) notFound()
  const urlOriginal = await urlArquivoPessoal(imp.arquivo)

  // Funcionários do cadastro + quem já veio da folha (pode estar desligado).
  const opcoes = [...funcionarios]
  for (const i of imp.itens) {
    if (i.funcionarioId && !opcoes.some((f) => f.usuarioId === i.funcionarioId)) {
      opcoes.push({ usuarioId: i.funcionarioId, nome: i.funcionarioNome ?? "(sem nome)" })
    }
  }
  opcoes.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))

  // Conferências além da conta: competência da remessa e variação do líquido.
  const competenciaRemessa = competenciaDoNome(remessa.nome_remessa)
  const anteriores = await liquidosAnteriores(
    id,
    imp.itens.map((i) => i.funcionarioId).filter((v): v is string => Boolean(v))
  )

  const itens: ItemTelaCC[] = await Promise.all(
    imp.itens.map(async (i) => ({
      id: i.id,
      paginas: i.paginas,
      nomeLido: i.nomeLido ?? i.leitura?.nome ?? null,
      cpfLido: i.cpfLido ?? i.leitura?.cpf ?? null,
      funcionarioId: i.funcionarioId,
      funcionarioNome: i.funcionarioNome,
      situacao: i.situacao,
      erro: i.erro,
      leitura: i.leitura,
      alertas: i.leitura
        ? alertasDaLeitura(i.leitura, {
            competenciaRemessa,
            liquidoAnterior: i.funcionarioId ? anteriores.get(i.funcionarioId) : null,
          })
        : [],
      bloqueio: bloqueioDoItemCC(i, jaTem, config.gerarOrdem),
      urlPdf: await urlArquivoPessoal(i.arquivo),
    }))
  )
  const conta = (s: ItemTelaCC["situacao"]) => itens.filter((i) => i.situacao === s).length
  const semCadastro = itens.filter((i) => !i.funcionarioId && i.situacao !== "descartado").length
  const comAlerta = itens.filter((i) => i.situacao !== "descartado" && i.alertas.length > 0).length
  const totalLiquido = itens
    .filter((i) => i.situacao !== "descartado")
    .reduce((s, i) => s + (i.leitura?.valorLiquido ?? 0), 0)
  const competencias = [...new Set(itens.map((i) => i.leitura?.competencia).filter(Boolean))]

  // Quem ficou de fora: funcionário ativo sem contracheque na remessa nem
  // nesta folha. Só na mensal — adiantamento, férias e 13º não são de todos.
  const naFolha = new Set(itens.filter((i) => i.situacao !== "descartado").map((i) => i.funcionarioId))
  const deFora =
    naturezaRemessaContracheques(remessa) === "Mensal" && conta("pendente") === 0
      ? funcionarios.filter((f) => !jaTem.has(f.usuarioId) && !naFolha.has(f.usuarioId))
      : []

  return (
    <>
      <RotuloTrilha
        valores={{ [id]: remessa.nome_remessa ?? "Remessa", importar: "Importar folha", [importacaoId]: imp.nomeArquivo ?? "Importação" }}
      />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={`/painel/pessoal/contracheques/${id}`}>
            <ArrowLeft />
            {remessa.nome_remessa ?? "Remessa"}
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{imp.nomeArquivo ?? "Folha de contracheques"}</h1>
            <p className="text-muted-foreground mt-1 text-xs">
              {imp.paginas} página(s) · enviado em {formatarData(imp.criadoEm)}
              {imp.criadoPor ? ` por ${imp.criadoPor}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {urlOriginal && (
              <Button variant="outline" asChild>
                <a href={urlOriginal} target="_blank" rel="noreferrer">
                  <Download />
                  Folha original
                </a>
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link href="/painel/pessoal/contracheques/configuracao">
                <Settings2 />
                Configuração das ordens
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {config.gerarOrdem && !config.centroCustoId && (
        <Alert variant="warning">
          <AlertDescription>
            A geração de ordens de pagamento está ligada, mas falta o centro de custo da folha: defina em{" "}
            <Link href="/painel/pessoal/contracheques/configuracao" className="underline underline-offset-4">
              Contracheques → Configuração
            </Link>{" "}
            (ou desligue ali a geração) antes de aplicar.
          </AlertDescription>
        </Alert>
      )}

      {deFora.length > 0 && (
        <Alert variant="warning">
          <AlertDescription>
            <span>
              {deFora.length} funcionário(s) ativo(s) sem contracheque nesta remessa nem nesta folha — confira se a folha veio
              completa:
            </span>
            <span className="mt-1 block text-xs">{deFora.map((f) => f.nome).join(", ")}</span>
          </AlertDescription>
        </Alert>
      )}

      {competenciaRemessa === null && competencias.length > 1 && (
        <Alert variant="warning">
          <AlertDescription>
            A folha traz mais de uma competência ({competencias.map((c) => c!.split("-").reverse().join("/")).join(", ")}). Confira
            antes de aplicar.
          </AlertDescription>
        </Alert>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TileIndicador rotulo="Funcionários na folha" valor={String(itens.length)} nota={`${conta("lido") + conta("aplicado")} lido(s) · ${conta("erro")} com erro`} />
        <TileIndicador rotulo="Aplicados à remessa" valor={String(conta("aplicado"))} nota={`${conta("descartado")} descartado(s)`} />
        <TileIndicador rotulo="Líquido lido" valor={formatarMoeda(totalLiquido)} nota="sem os descartados" />
        <TileIndicador rotulo="Com alertas" valor={String(comAlerta + semCadastro)} nota="sem cadastro, conta que não fecha, outra competência ou variação ≥ 30%" />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Funcionários da folha</CardTitle>
          <CardDescription>
            Valores lidos pela IA em cada contracheque. O líquido vira o valor do contracheque
            {config.gerarOrdem ? " e da ordem de pagamento" : ""}; proventos e descontos servem para conferir
            (proventos − descontos deve dar o líquido). <strong>PDF</strong> abre só as páginas da pessoa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConferenciaCC remessaId={id} importacaoId={importacaoId} itens={itens} funcionarios={opcoes} geraOrdem={config.gerarOrdem} />
        </CardContent>
      </Card>
    </>
  )
}
