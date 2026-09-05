import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ExternalLink } from "lucide-react"

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

import { RecorrenciaVeiculoForm } from "../checklists/checklist-forms"
import { requirePermissao } from "@/lib/auth"
import { nomesDasSedes } from "@/lib/db/organizacao"
import {
  obterConfig as obterConfigChecklist,
  situacaoDoVeiculo,
} from "@/lib/db/veiculos-checklist"
import {
  listarManutencoes,
  situacaoDosPlanos,
} from "@/lib/db/veiculos-manutencoes"
import {
  buscarVeiculo,
  consumoDoVeiculo,
  listarAbastecimentos,
  listarContratos,
  listarInfracoes,
  listarMovimentacoes,
  urlArquivoVeiculos,
} from "@/lib/db/veiculos"
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { atualizarVeiculoAction } from "../actions"
import { VeiculoForm } from "../veiculo-form"
import { VeiculoAcoes } from "./veiculo-acoes"

export const metadata: Metadata = { title: "Veículo — Confluir" }

export default async function VeiculoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string }>
}) {
  const sessao = await requirePermissao("veiculos", ["veiculos_gestao"])
  const gestor = podeAcessar(sessao.permissoes, "veiculos_gestao")
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

  const [movimentacoes, abastecimentos, infracoes, consumo, contratosRes, sedes] =
    await Promise.all([
      listarMovimentacoes({ veiculoId: id, limite: 10 }),
      listarAbastecimentos({ veiculoId: id, pagina: 1 }),
      listarInfracoes({ veiculoId: id, limite: 10 }),
      consumoDoVeiculo(id),
      gestor
        ? listarContratos({ situacao: "vigentes" })
        : Promise.resolve({ disponivel: true, contratos: [] }),
      gestor ? nomesDasSedes() : Promise.resolve<string[]>([]),
    ])

  // Checklist: situação do veículo + a recorrência padrão da frota (esta última
  // só interessa ao gestor, que pode definir prazo próprio para o veículo).
  const [checklist, { config: cfgChecklist }, preventivas, manutencoes] =
    await Promise.all([
      situacaoDoVeiculo(id),
      obterConfigChecklist(),
      situacaoDosPlanos(id),
      listarManutencoes({ veiculoId: id, limite: 20 }),
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
            </p>
          </div>
          {gestor && (
            <VeiculoAcoes
              veiculoId={veiculo.id}
              manutencao={veiculo.manutencao}
              inativo={veiculo.inativo}
            />
          )}
        </div>
      </div>

      {salvo && (
        <Alert variant="success">
          <AlertDescription>Alterações salvas.</AlertDescription>
        </Alert>
      )}
      {veiculo.emUso && veiculo.condutorEmUsoNome && (
        <Alert variant="info">
          <AlertDescription>
            Veículo em uso com {veiculo.condutorEmUsoNome}.
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

      {manutencoes.ativo && (
        <GrupoColapsavel
          titulo="Prontuário de manutenções"
          descricao="Tudo que já foi feito neste veículo, com local, garantia e nota."
          resumo={
            <span className="text-muted-foreground text-xs">
              {manutencoes.linhas.length === 0
                ? "nenhuma manutenção registrada"
                : `${manutencoes.linhas.length} registro(s) · última em ${formatarData(manutencoes.linhas[0].realizada_em)}`}
            </span>
          }
        >
          <div className="grid gap-4 pt-2">
            {manutencoes.linhas.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Serviço</TableHead>
                      <TableHead>Local</TableHead>
                      <TableHead className="text-right">Hodômetro</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {manutencoes.linhas.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="whitespace-nowrap">
                          <Link
                            href={`/painel/veiculos/manutencoes/${m.id}`}
                            className="font-medium hover:underline"
                          >
                            {formatarData(m.realizada_em)}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              m.tipo === "corretiva" ? "warning" : "secondary"
                            }
                          >
                            {m.tipo === "corretiva" ? "Corretiva" : "Preventiva"}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-64 truncate">
                          {m.descricao ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {m.local_nome ?? "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {m.hodometro?.toLocaleString("pt-BR") ?? "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {m.valor !== null ? formatarMoeda(m.valor) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {podeManutencao && (
              <div>
                <Button asChild size="sm" variant="outline">
                  <Link
                    href={`/painel/veiculos/manutencoes/nova?veiculo=${veiculo.id}`}
                  >
                    Registrar manutenção
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </GrupoColapsavel>
      )}

      {gestor && checklist.ativo && (
        <GrupoColapsavel
          titulo="Checklist deste veículo"
          descricao="Prazo próprio e acesso às verificações já realizadas."
          resumo={
            <span className="text-muted-foreground text-xs">
              {checklist.nunca
                ? "nunca realizado"
                : `último em ${formatarData(checklist.ultimoEm)}`}
              {checklist.recorrenciaPropria
                ? ` · prazo próprio de ${checklist.recorrenciaPropria} dias`
                : ` · segue o padrão da frota (${cfgChecklist.recorrencia_dias} dias)`}
            </span>
          }
        >
          <div className="grid gap-4 pt-2">
            <RecorrenciaVeiculoForm
              veiculoId={veiculo.id}
              atual={checklist.recorrenciaPropria}
              padrao={cfgChecklist.recorrencia_dias}
            />
            <div className="flex flex-wrap gap-2">
              {podeChecklist && (
                <Button asChild size="sm" variant="outline">
                  <Link
                    href={`/painel/veiculos/checklists/novo?veiculo=${veiculo.id}`}
                  >
                    Realizar checklist
                  </Link>
                </Button>
              )}
              {checklist.ultimoId && (
                <Button asChild size="sm" variant="ghost">
                  <Link
                    href={`/painel/veiculos/checklists/${checklist.ultimoId}`}
                  >
                    Ver o último
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </GrupoColapsavel>
      )}

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
              {veiculo.eh_alugado ? "Contrato de aluguel" : "Consumo"}
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
                <Linha
                  rotulo="Média km/l"
                  valor={consumo.kmPorLitro?.toLocaleString("pt-BR") ?? "—"}
                />
              </>
            ) : (
              <p className="text-muted-foreground">
                Sem lançamentos vinculados a este veículo.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {consumo && veiculo.contrato && (
        <Card>
          <CardContent className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <p className="font-medium">Consumo:</p>
            <span>Gasto {formatarMoeda(consumo.totalGasto)}</span>
            <span>{consumo.totalLitros.toLocaleString("pt-BR")} litros</span>
            <span>
              Média{" "}
              {consumo.kmPorLitro
                ? `${consumo.kmPorLitro.toLocaleString("pt-BR")} km/l`
                : "—"}
            </span>
          </CardContent>
        </Card>
      )}

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
            contratos={contratosRes.contratos.map((c) => ({
              id: c.id,
              rotulo: `${c.numero ?? "(sem número)"} — ${c.fornecedorNome ?? "locadora"}`,
            }))}
          />
        </GrupoColapsavel>
      )}

      <GrupoColapsavel
        titulo="Histórico de uso"
        descricao="Retiradas e devoluções mais recentes"
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
                <TableHead>Retirada</TableHead>
                <TableHead>Devolução</TableHead>
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
                        Em aberto
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
      </GrupoColapsavel>

      <GrupoColapsavel
        titulo="Abastecimentos"
        descricao="Lançamentos vinculados a este veículo (fluxo novo)"
        resumo={
          <span className="text-muted-foreground text-sm tabular-nums">
            {abastecimentos.total}
          </span>
        }
      >
        {abastecimentos.linhas.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nenhum abastecimento vinculado — os lançamentos legados do Bubble
            não têm veículo.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Posto</TableHead>
                <TableHead>Combustível</TableHead>
                <TableHead className="text-right">Litros</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Hodômetro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {abastecimentos.linhas.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatarDataHora(a.data_hora)}
                  </TableCell>
                  <TableCell>{a.posto ?? "—"}</TableCell>
                  <TableCell>{a.combustivel ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {a.volume?.toLocaleString("pt-BR") ?? "—"}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {formatarMoeda(a.valor)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {a.hodometro?.toLocaleString("pt-BR") ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </GrupoColapsavel>

      <GrupoColapsavel
        titulo="Infrações"
        descricao="Multas registradas neste veículo"
        resumo={
          <span className="text-muted-foreground text-sm tabular-nums">
            {infracoes.length}
          </span>
        }
      >
        {infracoes.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhuma infração.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Gravidade</TableHead>
                <TableHead>Condutor</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {infracoes.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>
                    <Link
                      href={`/painel/veiculos/infracoes/${i.id}`}
                      className="text-primary whitespace-nowrap hover:underline"
                    >
                      {formatarData(i.infracao_data)}
                    </Link>
                  </TableCell>
                  <TableCell>{i.infracao_tipo ?? "—"}</TableCell>
                  <TableCell>{i.condutorNome ?? "—"}</TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {formatarMoeda(i.custo)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </GrupoColapsavel>
    </>
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
