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
import { buscarRemessaPonto, funcionariosParaSelecao, urlArquivoPessoal } from "@/lib/db/pessoal"
import { competenciaDaRemessa, rotuloCompetenciaPonto } from "@/lib/db/ponto-analise"
import { faixasHoraExtra, regrasApuracaoPonto } from "@/lib/db/ponto-config"
import { bloqueioDoItem, isentosDaRemessa, obterImportacao } from "@/lib/db/ponto-importacao"
import { formatarData } from "@/lib/formato"

import { ResumoRegras } from "../resumo-regras"
import { ProvedorLeitura } from "../trabalhando"
import { ItensImportacao, LeitorImportacao, type ItemTela } from "./itens"

export const metadata: Metadata = { title: "Importação do relatório de ponto — Confluir" }
// A leitura pela IA roda em lotes chamados desta página.
export const maxDuration = 300

export default async function ImportacaoPage({ params }: { params: Promise<{ id: string; importacaoId: string }> }) {
  await requirePermissao("pessoal_gestao")
  const { id, importacaoId } = await params
  const [remessa, imp, regras, faixas, isentos, funcionarios] = await Promise.all([
    buscarRemessaPonto(id),
    obterImportacao(importacaoId),
    regrasApuracaoPonto(),
    faixasHoraExtra(),
    isentosDaRemessa(id),
    funcionariosParaSelecao(),
  ])
  if (!remessa || !imp || imp.remessaId !== id) notFound()

  const competencia = competenciaDaRemessa(remessa)
  const competenciaRelatorio = imp.periodoInicio?.slice(0, 7) ?? null
  const outraCompetencia = competencia && competenciaRelatorio && competencia !== competenciaRelatorio
  const urlOriginal = await urlArquivoPessoal(imp.arquivo)

  // Funcionários do cadastro + quem já veio do relatório (pode estar desligado).
  const opcoes = [...funcionarios]
  for (const i of imp.itens) {
    if (i.funcionarioId && !opcoes.some((f) => f.usuarioId === i.funcionarioId)) {
      opcoes.push({ usuarioId: i.funcionarioId, nome: i.funcionarioNome ?? "(sem nome)" })
    }
  }
  opcoes.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))

  const itens: ItemTela[] = imp.itens.map((i) => ({
    id: i.id,
    paginas: i.paginas,
    nomeLido: i.nomeLido ?? i.leitura?.nome ?? null,
    cpfLido: i.cpfLido,
    funcionarioId: i.funcionarioId,
    funcionarioNome: i.funcionarioNome,
    situacao: i.situacao,
    erro: i.erro,
    apuracao: i.apuracao,
    marcacoes: Object.fromEntries((i.leitura?.dias ?? []).map((d) => [d.data, d.marcacoes])),
    bloqueio: bloqueioDoItem(i, regras, isentos),
    registroId: i.registroId,
  }))
  const conta = (s: ItemTela["situacao"]) => itens.filter((i) => i.situacao === s).length
  const semCadastro = itens.filter((i) => !i.funcionarioId && i.situacao !== "descartado").length
  const comAlerta = itens.filter((i) => (i.apuracao?.alertas.length ?? 0) > 0).length

  return (
    <ProvedorLeitura>
      <RotuloTrilha
        valores={{ [id]: remessa.nome_remessa ?? "(sem nome)", importar: "Importar relatório", [importacaoId]: imp.nomeArquivo ?? "Importação" }}
      />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={`/painel/pessoal/ponto/${id}`}>
            <ArrowLeft />
            {remessa.nome_remessa ?? "Remessa"}
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{imp.nomeArquivo ?? "Relatório de ponto"}</h1>
            <p className="text-muted-foreground mt-1 text-xs">
              {imp.paginas} página(s) · período {formatarData(imp.periodoInicio)} a {formatarData(imp.periodoFim)} · enviado em{" "}
              {formatarData(imp.criadoEm)}
              {imp.criadoPor ? ` por ${imp.criadoPor}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {urlOriginal && (
              <Button variant="outline" asChild>
                <a href={urlOriginal} target="_blank" rel="noreferrer">
                  <Download />
                  Relatório original
                </a>
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link href="/painel/pessoal/ponto?regras=1#regras-hora-extra">
                <Settings2 />
                Regras de apuração
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {outraCompetencia && (
        <Alert variant="warning">
          <AlertDescription>
            O relatório é de {rotuloCompetenciaPonto(competenciaRelatorio!)}, e a remessa, de {rotuloCompetenciaPonto(competencia!)}. Confira
            antes de aplicar.
          </AlertDescription>
        </Alert>
      )}

      <LeitorImportacao remessaId={id} importacaoId={importacaoId} pendentes={conta("pendente")} />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TileIndicador rotulo="Funcionários no relatório" valor={String(itens.length)} nota={`${conta("lido") + conta("aplicado")} lido(s) · ${conta("erro")} com erro`} />
        <TileIndicador rotulo="Aplicados à remessa" valor={String(conta("aplicado"))} nota={`${conta("descartado")} descartado(s)`} />
        <TileIndicador rotulo="Sem cadastro" valor={String(semCadastro)} nota="escolha o funcionário na linha" />
        <TileIndicador rotulo="Com alertas" valor={String(comAlerta)} nota="sem batidas, incompletos ou total divergente" />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Funcionários do relatório</CardTitle>
          <CardDescription>
            Horas apuradas pelas batidas: “A mais” e “Negativas” somam os saldos dos dias; “Realiz.” é o que vai para o registro.
            “Relatório” é o saldo que o relógio imprimiu, só para conferência.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ItensImportacao remessaId={id} importacaoId={importacaoId} itens={itens} funcionarios={opcoes} faixas={faixas} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Regras usadas</CardTitle>
        </CardHeader>
        <CardContent>
          <ResumoRegras regras={regras} />
        </CardContent>
      </Card>
    </ProvedorLeitura>
  )
}
