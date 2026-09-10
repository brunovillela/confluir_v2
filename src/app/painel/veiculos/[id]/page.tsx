import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  ClipboardCheck,
  ExternalLink,
  FileWarning,
  Fuel,
  History,
  KeyRound,
  LogIn,
  Wrench,
} from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { EmUsoBadge } from "@/components/veiculos"
import { AlertaChecklist } from "@/components/veiculos-checklist"
import { AlertaManutencao } from "@/components/veiculos-manutencao"

import { requirePermissao } from "@/lib/auth"
import { hojeSP } from "@/lib/db/comum"
import { nomesDasSedes } from "@/lib/db/organizacao"
import {
  obterConfig as obterConfigChecklist,
  situacaoDoVeiculo,
} from "@/lib/db/veiculos-checklist"
import {
  hodometroAtual,
  situacaoDosPlanos,
} from "@/lib/db/veiculos-manutencoes"
import {
  buscarVeiculo,
  consumoDoVeiculo,
  indicadoresDoVeiculo,
  listarContratos,
  listarMovimentacoes,
  urlArquivoVeiculos,
} from "@/lib/db/veiculos"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { atualizarVeiculoAction } from "../actions"
import { VeiculoForm } from "../veiculo-form"
import { InativarVeiculoBotao } from "./veiculo-acoes"

export const metadata: Metadata = { title: "Veículo — Confluir" }

/** Dias entre hoje e uma data ISO (negativo = já passou). */
function diasAte(iso: string | null): number | null {
  if (!iso) return null
  const ms = Date.parse(iso) - Date.parse(hojeSP())
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) : null
}

/**
 * Visão geral do veículo: avisos, indicadores de uso, dados e histórico.
 * As áreas com formulário (entrada/saída, manutenções, checklist,
 * abastecimentos, infrações) vivem em subpáginas, nos botões do topo.
 */
export default async function VeiculoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string }>
}) {
  const sessao = await requirePermissao("veiculos", [
    "veiculos_gestao",
    "veiculos_recepcao",
  ])
  const gestor = podeAcessar(sessao.permissoes, "veiculos_gestao")
  const recepcao = podeAcessar(sessao.permissoes, "veiculos_recepcao", [
    "veiculos_gestao",
  ])
  const podeChecklist = podeAcessar(sessao.permissoes, "veiculos_checklist", [
    "veiculos_gestao",
  ])
  const podeManutencao = podeAcessar(sessao.permissoes, "veiculos_manutencao", [
    "veiculos_gestao",
  ])
  const { id } = await params
  const { salvo } = await searchParams

  const veiculo = await buscarVeiculo(id)
  if (!veiculo) notFound()

  const [
    movimentacoes,
    indicadores,
    consumo,
    hodometro,
    contratosRes,
    sedes,
    checklist,
    { config: cfgChecklist },
    preventivas,
  ] = await Promise.all([
    listarMovimentacoes({ veiculoId: id, limite: 10 }),
    indicadoresDoVeiculo(id),
    consumoDoVeiculo(id),
    hodometroAtual(id),
    gestor
      ? listarContratos({ situacao: "vigentes" })
      : Promise.resolve({ disponivel: true, contratos: [] }),
    gestor ? nomesDasSedes() : Promise.resolve<string[]>([]),
    situacaoDoVeiculo(id),
    obterConfigChecklist(),
    situacaoDosPlanos(id),
  ])

  const [crlvUrls, apoliceUrl, crvUrl] = await Promise.all([
    Promise.all(veiculo.crlv_urls.map((c) => urlArquivoVeiculos(c))),
    urlArquivoVeiculos(veiculo.seguro_apolice_url),
    urlArquivoVeiculos(veiculo.crv_transferencia_url),
  ])
  const documentos = [
    ...crlvUrls
      .filter((u): u is string => Boolean(u))
      .map((url, i) => ({ rotulo: `CRLV${crlvUrls.length > 1 ? ` ${i + 1}` : ""}`, url })),
    ...(apoliceUrl ? [{ rotulo: "Apólice do seguro", url: apoliceUrl }] : []),
    ...(crvUrl ? [{ rotulo: "CRV / transferência", url: crvUrl }] : []),
  ]

  // ── Avisos do veículo ──────────────────────────────────────────────────
  const movimentacaoAberta = veiculo.movimentacaoAbertaId
    ? (movimentacoes.find((m) => m.id === veiculo.movimentacaoAbertaId) ?? null)
    : null
  const diasSeguro = diasAte(veiculo.seguro_vencimento)
  const diasContrato = diasAte(veiculo.contrato?.vigencia_termino ?? null)
  const diasPrevisao = diasAte(movimentacaoAberta?.previsao_retorno ?? null)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/painel/veiculos">
            <ArrowLeft />
            Veículos
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
              <span className="tabular-nums">{veiculo.placa ?? "(sem placa)"}</span>
              {veiculo.inativo ? (
                <Badge variant="outline" className="text-muted-foreground">
                  Inativo
                </Badge>
              ) : veiculo.manutencao ? (
                <Badge
                  variant="outline"
                  className="border-warning/40 text-warning-fg"
                >
                  Em manutenção
                </Badge>
              ) : (
                <EmUsoBadge emUso={veiculo.emUso} />
              )}
              <Badge variant="outline">
                {veiculo.eh_alugado ? "Alugado" : "Próprio"}
              </Badge>
            </h1>
            <p className="text-muted-foreground mt-1 text-xs">
              {veiculo.marca_modelo ?? "—"}
              {veiculo.cor ? ` · ${veiculo.cor}` : ""}
              {veiculo.lotacao ? ` · ${veiculo.lotacao}` : ""}
              {hodometro !== null
                ? ` · hodômetro ${hodometro.toLocaleString("pt-BR")} km`
                : ""}
            </p>
          </div>
          <div className="grid gap-2">
            <div className="flex flex-wrap gap-2">
              {recepcao && !veiculo.inativo && (
                <Button size="sm" asChild>
                  <Link href={`/painel/veiculos/${veiculo.id}/movimentacao`}>
                    {veiculo.emUso ? <LogIn /> : <KeyRound />}
                    {veiculo.emUso ? "Registrar entrada" : "Registrar saída"}
                  </Link>
                </Button>
              )}
              <Button size="sm" variant="outline" asChild>
                <Link href={`/painel/veiculos/${veiculo.id}/manutencoes`}>
                  <Wrench />
                  Manutenções
                </Link>
              </Button>
              {checklist.ativo && (
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/painel/veiculos/${veiculo.id}/checklist`}>
                    <ClipboardCheck />
                    Checklist
                  </Link>
                </Button>
              )}
              {gestor && (
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/painel/veiculos/${veiculo.id}/abastecimentos`}>
                    <Fuel />
                    Abastecimentos
                  </Link>
                </Button>
              )}
              <Button size="sm" variant="outline" asChild>
                <Link href={`/painel/veiculos/${veiculo.id}/infracoes`}>
                  <FileWarning />
                  Infrações
                </Link>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link href={`/painel/veiculos/${veiculo.id}/historico`}>
                  <History />
                  Histórico de uso
                </Link>
              </Button>
            </div>
            {gestor && (
              <InativarVeiculoBotao veiculoId={veiculo.id} inativo={veiculo.inativo} />
            )}
          </div>
        </div>
      </div>

      {salvo && (
        <Alert variant="success">
          <AlertDescription>Alterações salvas.</AlertDescription>
        </Alert>
      )}

      {/* ── Avisos ─────────────────────────────────────────────────────── */}
      {veiculo.emUso && (
        <Alert variant={diasPrevisao !== null && diasPrevisao < 0 ? "warning" : "info"}>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              Veículo fora com{" "}
              <strong>{veiculo.condutorEmUsoNome ?? "condutor não informado"}</strong>
              {movimentacaoAberta?.data_retirada
                ? ` desde ${formatarData(movimentacaoAberta.data_retirada)}`
                : ""}
              {movimentacaoAberta?.destino ? ` · ${movimentacaoAberta.destino}` : ""}
              {movimentacaoAberta?.previsao_retorno
                ? diasPrevisao !== null && diasPrevisao < 0
                  ? ` · previsão de retorno vencida há ${Math.abs(diasPrevisao)} ${Math.abs(diasPrevisao) === 1 ? "dia" : "dias"} (${formatarData(movimentacaoAberta.previsao_retorno)})`
                  : ` · retorno previsto para ${formatarData(movimentacaoAberta.previsao_retorno)}`
                : ""}
            </span>
            {recepcao && (
              <Button asChild size="sm" variant="outline">
                <Link href={`/painel/veiculos/${veiculo.id}/movimentacao`}>
                  <LogIn />
                  Registrar entrada
                </Link>
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      {!veiculo.inativo && veiculo.seguro_vencimento && diasSeguro !== null && diasSeguro <= 30 && (
        <Alert variant={diasSeguro < 0 ? "destructive" : "warning"}>
          <AlertDescription>
            {diasSeguro < 0
              ? `Seguro vencido há ${Math.abs(diasSeguro)} ${Math.abs(diasSeguro) === 1 ? "dia" : "dias"} (${formatarData(veiculo.seguro_vencimento)}).`
              : diasSeguro === 0
                ? "Seguro vence hoje."
                : `Seguro vence em ${diasSeguro} ${diasSeguro === 1 ? "dia" : "dias"} (${formatarData(veiculo.seguro_vencimento)}).`}
          </AlertDescription>
        </Alert>
      )}
      {!veiculo.inativo && !veiculo.seguro_vencimento && (
        <Alert variant="info">
          <AlertDescription>
            Sem vencimento de seguro cadastrado — informe em Editar cadastro
            para receber o aviso.
          </AlertDescription>
        </Alert>
      )}
      {veiculo.contrato && diasContrato !== null && diasContrato <= 30 && (
        <Alert variant={diasContrato < 0 ? "destructive" : "warning"}>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {diasContrato < 0
                ? `Contrato de aluguel ${veiculo.contrato.numero ?? ""} terminou em ${formatarData(veiculo.contrato.vigencia_termino)}.`
                : `Contrato de aluguel ${veiculo.contrato.numero ?? ""} termina em ${diasContrato} ${diasContrato === 1 ? "dia" : "dias"} (${formatarData(veiculo.contrato.vigencia_termino)}).`}
            </span>
            {gestor && (
              <Link
                href={`/painel/veiculos/contratos/${veiculo.contrato.id}`}
                className="text-primary text-sm hover:underline"
              >
                Abrir contrato
              </Link>
            )}
          </AlertDescription>
        </Alert>
      )}
      {checklist.ativo && cfgChecklist.ativo && !veiculo.inativo && (
        <AlertaChecklist
          veiculoId={veiculo.id}
          situacao={checklist}
          podeRealizar={podeChecklist}
        />
      )}
      {preventivas.ativo && !veiculo.inativo && (
        <AlertaManutencao
          veiculoId={veiculo.id}
          planos={preventivas.linhas}
          podeRegistrar={podeManutencao}
        />
      )}

      {/* ── Indicadores ────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador
          rotulo="Km rodado (total)"
          valor={indicadores.kmTotal.toLocaleString("pt-BR")}
          detalhe={`${indicadores.km12Meses.toLocaleString("pt-BR")} km nos últimos 12 meses`}
        />
        <Indicador
          rotulo="Usos registrados"
          valor={indicadores.usos.toLocaleString("pt-BR")}
          detalhe={
            indicadores.ultimoUsoEm
              ? `último em ${formatarData(indicadores.ultimoUsoEm)}`
              : "nenhuma movimentação"
          }
        />
        <Indicador
          rotulo="Média por uso"
          valor={
            indicadores.mediaKmPorUso !== null
              ? `${indicadores.mediaKmPorUso.toLocaleString("pt-BR")} km`
              : "—"
          }
          detalhe={
            indicadores.mediaDiasPorUso !== null
              ? `${indicadores.mediaDiasPorUso.toLocaleString("pt-BR")} dias fora, em média`
              : `${indicadores.diasFora.toLocaleString("pt-BR")} dias fora no total`
          }
        />
        <Indicador
          rotulo="Consumo"
          valor={
            consumo?.kmPorLitro
              ? `${consumo.kmPorLitro.toLocaleString("pt-BR")} km/l`
              : "—"
          }
          detalhe={
            consumo
              ? `${formatarMoeda(consumo.totalGasto)} em ${consumo.lancamentos} abastecimento${consumo.lancamentos === 1 ? "" : "s"}`
              : "sem abastecimentos vinculados"
          }
        />
      </div>

      {(indicadores.condutoresPorKm.length > 0 ||
        indicadores.condutoresPorDias.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="grid gap-2 text-sm">
              <p className="font-medium">Condutores que mais rodaram</p>
              <Ranking
                linhas={indicadores.condutoresPorKm.map((c) => ({
                  id: c.id,
                  nome: c.nome,
                  valor: `${c.km.toLocaleString("pt-BR")} km`,
                  detalhe: `${c.usos} uso${c.usos === 1 ? "" : "s"}`,
                }))}
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="grid gap-2 text-sm">
              <p className="font-medium">Condutores que mais ficam com o veículo</p>
              <Ranking
                linhas={indicadores.condutoresPorDias.map((c) => ({
                  id: c.id,
                  nome: c.nome,
                  valor: `${c.dias.toLocaleString("pt-BR")} ${c.dias === 1 ? "dia" : "dias"}`,
                  detalhe: `${c.usos} uso${c.usos === 1 ? "" : "s"}`,
                }))}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Dados ──────────────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardContent className="grid gap-2 text-sm">
            <p className="font-medium">Dados do veículo</p>
            <Linha rotulo="Código" valor={veiculo.codigo} />
            <Linha rotulo="Renavam" valor={veiculo.renavan} />
            <Linha
              rotulo="Ano fabricação/modelo"
              valor={
                veiculo.ano_fabricacao || veiculo.ano_modelo
                  ? `${veiculo.ano_fabricacao?.slice(0, 4) ?? "—"} / ${veiculo.ano_modelo?.slice(0, 4) ?? "—"}`
                  : null
              }
            />
            <Linha rotulo="Combustível" valor={veiculo.combustivel} />
            <Linha
              rotulo="Seguro vence em"
              valor={
                veiculo.seguro_vencimento
                  ? formatarData(veiculo.seguro_vencimento)
                  : null
              }
            />
            <Linha
              rotulo="Checklist"
              valor={
                !checklist.ativo
                  ? null
                  : checklist.nunca
                    ? "nunca realizado"
                    : `último em ${formatarData(checklist.ultimoEm)}`
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-2 text-sm">
            <p className="font-medium">Documentos</p>
            {documentos.length === 0 ? (
              <p className="text-muted-foreground">Nenhum documento anexado.</p>
            ) : (
              documentos.map((d) => (
                <a
                  key={d.url}
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary flex items-center gap-1.5 hover:underline"
                >
                  <ExternalLink className="size-3.5" />
                  {d.rotulo}
                </a>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-2 text-sm">
            <p className="font-medium">
              {veiculo.eh_alugado ? "Contrato de aluguel" : "Combustível"}
            </p>
            {veiculo.contrato ? (
              <>
                <Linha rotulo="Contrato" valor={veiculo.contrato.numero} />
                <Linha rotulo="Locadora" valor={veiculo.contrato.fornecedorNome} />
                <Linha
                  rotulo="Vigência"
                  valor={`${formatarData(veiculo.contrato.vigencia_inicio)} → ${formatarData(veiculo.contrato.vigencia_termino)}`}
                />
                {gestor && (
                  <Link
                    href={`/painel/veiculos/contratos/${veiculo.contrato.id}`}
                    className="text-primary hover:underline"
                  >
                    Abrir contrato
                  </Link>
                )}
              </>
            ) : consumo ? (
              <>
                <Linha
                  rotulo="Gasto em combustível"
                  valor={formatarMoeda(consumo.totalGasto)}
                />
                <Linha
                  rotulo="Litros"
                  valor={consumo.totalLitros.toLocaleString("pt-BR")}
                />
                <Linha
                  rotulo="Km na janela medida"
                  valor={consumo.kmRodados?.toLocaleString("pt-BR") ?? "—"}
                />
              </>
            ) : (
              <p className="text-muted-foreground">
                Sem abastecimentos vinculados a este veículo.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Histórico de uso ───────────────────────────────────────────── */}
      <GrupoColapsavel
        titulo="Histórico de uso"
        descricao="As 10 movimentações mais recentes — o histórico completo, com filtros, fica no botão do topo"
        resumo={
          <span className="text-muted-foreground text-sm tabular-nums">
            {movimentacoes.length}
          </span>
        }
        aberto
      >
        {movimentacoes.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhuma movimentação.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Saída</TableHead>
                <TableHead>Entrada</TableHead>
                <TableHead>Condutor</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead className="text-right">Hodômetro</TableHead>
                <TableHead className="text-right">Km</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movimentacoes.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatarData(m.data_retirada)}
                    {m.sede_retirada ? ` · ${m.sede_retirada}` : ""}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {m.aberta ? (
                      <Badge
                        variant="outline"
                        className="border-warning/40 text-warning-fg"
                      >
                        Fora
                        {m.previsao_retorno
                          ? ` · prev. ${formatarData(m.previsao_retorno)}`
                          : ""}
                      </Badge>
                    ) : (
                      `${formatarData(m.data_devolucao)}${m.sede_devolucao ? ` · ${m.sede_devolucao}` : ""}`
                    )}
                  </TableCell>
                  <TableCell>{m.condutorNome ?? "—"}</TableCell>
                  <TableCell className="max-w-52">
                    <span className="line-clamp-1">{m.destino ?? "—"}</span>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {m.hodometro_retirada?.toLocaleString("pt-BR") ?? "—"}
                    {" → "}
                    {m.hodometro_devolucao?.toLocaleString("pt-BR") ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {m.km_rodado?.toLocaleString("pt-BR") ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <div className="mt-3">
          <Button size="sm" variant="ghost" asChild>
            <Link href={`/painel/veiculos/${veiculo.id}/historico`}>
              <History />
              Ver histórico completo
            </Link>
          </Button>
        </div>
      </GrupoColapsavel>

      {gestor && (
        <GrupoColapsavel
          titulo="Editar cadastro"
          descricao="Placa, modelo, lotação, seguro e vínculo com contrato"
        >
          <VeiculoForm
            action={atualizarVeiculoAction}
            dados={veiculo}
            sedes={sedes}
            contratoAtualId={veiculo.contrato_aluguel_id}
            contratos={contratosRes.contratos
              .map((c) => ({
                id: c.id,
                rotulo: `${c.numero ?? "(sem número)"} — ${c.fornecedorNome ?? "locadora"}`,
              }))
              .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"))}
          />
        </GrupoColapsavel>
      )}
    </>
  )
}

function Indicador({
  rotulo,
  valor,
  detalhe,
}: {
  rotulo: string
  valor: string
  detalhe?: string
}) {
  return (
    <Card>
      <CardContent className="grid gap-1 py-4">
        <span className="text-muted-foreground text-xs">{rotulo}</span>
        <span className="text-2xl font-semibold tabular-nums">{valor}</span>
        {detalhe && <span className="text-muted-foreground text-xs">{detalhe}</span>}
      </CardContent>
    </Card>
  )
}

function Ranking({
  linhas,
}: {
  linhas: { id: string; nome: string; valor: string; detalhe: string }[]
}) {
  if (linhas.length === 0) {
    return <p className="text-muted-foreground">Sem dados.</p>
  }
  return (
    <ol className="grid gap-1.5">
      {linhas.map((l, i) => (
        <li key={l.id} className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate">
            <span className="text-muted-foreground mr-2 tabular-nums">{i + 1}.</span>
            {l.nome}
          </span>
          <span className="shrink-0 text-right tabular-nums">
            <span className="font-medium">{l.valor}</span>
            <span className="text-muted-foreground ml-2 text-xs">{l.detalhe}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

function Linha({
  rotulo,
  valor,
}: {
  rotulo: string
  valor: string | null | undefined
}) {
  return (
    <p className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="text-right">{valor ?? "—"}</span>
    </p>
  )
}
