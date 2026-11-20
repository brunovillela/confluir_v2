import type { Metadata } from "next"
import Link from "next/link"
import { TileIndicador } from "@/components/graficos/tile"
import { hojeSP } from "@/lib/db/comum"
import { hhmm } from "@/lib/horas"
import { ChevronLeft, ChevronRight, Clock4 } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { TabelaDocumentosPessoal } from "@/components/tabela-documentos-pessoal"
import {
  LegendaLinhaDoDia,
  LinhaDoDia,
  dataBr,
  deslocarMes,
  mesAtualSP,
  rotuloMes,
  textoOndeCaiu,
} from "@/components/pessoal/uso-linha-do-dia"
import { Button } from "@/components/ui/button"
import { VoltarPerfil } from "@/components/voltar-perfil"
import { requireSessaoPainel } from "@/lib/auth"
import { exigirFuncionario } from "@/lib/db/perfil"
import { meusDocumentosPessoal } from "@/lib/db/pessoal"
import { faixasHoraExtra } from "@/lib/db/ponto-config"
import { meusAjustesDePonto } from "@/lib/db/ponto-marcacoes"
import { formatarDataHora } from "@/lib/formato"
import { descreverAjuste } from "@/lib/ponto-marcacoes-ajuste"
import { lerPaginacao } from "@/lib/paginacao"
import { competenciaValida, hojeEmSaoPaulo, usoForaDoFuncionario } from "@/lib/db/uso-fora-expediente"
import { JANELA_MOTIVO_DIAS, TOLERANCIA_DIARIA_MIN, podeInformarMotivo, textoMinutos } from "@/lib/uso-fora-expediente"

import { MotivoUsoDoDia } from "./motivo-uso"

export const metadata: Metadata = { title: "Meu controle de ponto — Confluir" }

/** Autosserviço: espelhos de ponto liberados para o próprio funcionário. */
export default async function MeuPontoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const sessao = await requireSessaoPainel()
  // Área de funcionário: diretor e demais usuários sem vínculo com o sindicato voltam ao perfil.
  await exigirFuncionario(sessao.usuario.id as string)
  const [{ pontos }, faixas, ajustes] = await Promise.all([
    meusDocumentosPessoal(sessao.usuario.id),
    faixasHoraExtra(),
    meusAjustesDePonto(String(sessao.usuario.id)),
  ])
  const params = await searchParams
  const paginacao = lerPaginacao(params, 10)
  // Uso do sistema fora do horário (só de quem tem jornada vinculada).
  const mesAtual = mesAtualSP()
  const mesUso = competenciaValida(params.uso) ?? mesAtual
  const uso = await usoForaDoFuncionario(String(sessao.usuario.id), mesUso).catch(() => null)
  const hoje = hojeEmSaoPaulo()

  // Indicadores (padrão de 3 níveis): horas extras e banco, só dos espelhos liberados.
  const anoAtual = hojeSP().slice(0, 4)
  const anoDe = (nome: string | null, criado: string | null) => /(20\d{2})/.exec(nome ?? "")?.[1] ?? (criado ?? "").slice(0, 4)
  const doAno = pontos.filter((p) => anoDe(p.remessaNome, p.created_at) === anoAtual)
  const heAno = doAno.reduce((s, p) => s + (p.horas?.he70 ?? 0) + (p.horas?.he100 ?? 0), 0)
  const he100Ano = doAno.reduce((s, p) => s + (p.horas?.he100 ?? 0), 0)
  const h = (v: number) => hhmm(v)
  return (
    <>
      <VoltarPerfil />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Meu controle de ponto
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Espelhos de ponto liberados pelo departamento de pessoal.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TileIndicador rotulo={`Horas extras em ${anoAtual}`} valor={h(heAno)} nota={`${h(he100Ano)} a ${faixas["100"]}`} />
        <TileIndicador
          rotulo="Meses com horas extras"
          valor={`${doAno.filter((p) => (p.horas?.he70 ?? 0) + (p.horas?.he100 ?? 0) > 0).length} de ${doAno.length}`}
        />
        <TileIndicador
          rotulo="Saldo de horas extras"
          valor={h(pontos[0]?.horas?.saldo ?? 0)}
          nota={
            pontos[0]?.horas
              ? `${h(pontos[0].horas.saldo70)} a ${faixas["70"]} · ${h(pontos[0].horas.saldo100)} a ${faixas["100"]} · ${pontos[0].remessaNome ?? ""}`
              : undefined
          }
        />
      </section>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Espelhos de ponto</CardTitle>
            <Clock4 className="text-muted-foreground size-4" />
          </div>
          <CardDescription>
            {pontos.length} liberado{pontos.length === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TabelaDocumentosPessoal
            documentos={pontos}
            vazio="Nenhum espelho de ponto liberado para você ainda."
            paginacao={paginacao}
            prefixo=""
            faixas={faixas}
          />
        </CardContent>
      </Card>

      {uso?.disponivel && uso.jornada && (
        <Card id="uso-fora" className="scroll-mt-20">
          <CardHeader>
            <CardTitle className="text-base">Uso do sistema fora do expediente</CardTitle>
            <CardDescription>
              O tempo em que você usou o Confluir fora da sua jornada ({uso.jornada.nome}), com a aba aberta e em uso. O
              departamento de pessoal vê o mesmo. Se usou por um motivo (urgência, algo combinado com a chefia, plantão,
              compensação), informe: vale para hoje e para os últimos {JANELA_MOTIVO_DIAS} dias.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <nav className="flex flex-wrap items-center gap-2 text-sm" aria-label="Mês do uso">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/painel/perfil/ponto?uso=${deslocarMes(mesUso, -1)}#uso-fora`} aria-label="Mês anterior">
                  <ChevronLeft />
                </Link>
              </Button>
              <span className="min-w-36 text-center font-medium">{rotuloMes(mesUso).replace(/^./, (c) => c.toUpperCase())}</span>
              {mesUso < mesAtual ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/painel/perfil/ponto?uso=${deslocarMes(mesUso, 1)}#uso-fora`} aria-label="Mês seguinte">
                    <ChevronRight />
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled aria-label="Mês seguinte">
                  <ChevronRight />
                </Button>
              )}
            </nav>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span>
                Uso no mês: <strong>{textoMinutos(uso.resumo.total)}</strong>
              </span>
              <span>
                Fora do expediente: <strong>{textoMinutos(uso.resumo.foraTotal)}</strong> em {uso.resumo.diasComFora} dia(s)
              </span>
            </div>
            {uso.dias.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum uso do sistema registrado neste mês.</p>
            ) : (
              <ul className="divide-y rounded-md border text-sm">
                {uso.dias.map((dia) => (
                  <li key={dia.data} className={`grid gap-1.5 px-3 py-2 ${dia.foraTotal === 0 ? "text-muted-foreground" : ""}`}>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="w-24 shrink-0 tabular-nums">
                        {dataBr(dia.data)} <span className="text-xs">{dia.nomeDia.slice(0, 3).toLowerCase()}</span>
                      </span>
                      <span className="min-w-40 flex-1">
                        <LinhaDoDia dia={dia} />
                      </span>
                      <span className="w-28 text-right text-xs tabular-nums">
                        {dia.foraTotal > 0 ? `${textoMinutos(dia.foraTotal)} fora` : "dentro da jornada"}
                      </span>
                    </div>
                    {dia.foraTotal > 0 && (
                      <div className="grid gap-1 pl-0 text-xs sm:pl-[6.75rem]">
                        <span>
                          {/* Férias, atestado…: o rótulo da ausência diz mais que "Férias ou afastamento". */}
                          {dia.situacao && dia.fora.afastado > 0 ? `${dia.situacao} · ` : ""}
                          {textoOndeCaiu(dia)}
                          {dia.considerado === 0 && " · na tolerância de " + TOLERANCIA_DIARIA_MIN + " min"}
                        </span>
                        {podeInformarMotivo(dia.data, hoje) ? (
                          <MotivoUsoDoDia
                            data={dia.data}
                            rotulo={uso.motivos.get(dia.data) ?? null}
                            atual={uso.justificativas.get(dia.data) ?? null}
                          />
                        ) : (
                          <span className="text-muted-foreground">
                            {uso.motivos.get(dia.data) ? `Motivo: ${uso.motivos.get(dia.data)}` : "Sem motivo informado"}
                          </span>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <LegendaLinhaDoDia />
          </CardContent>
        </Card>
      )}

      {ajustes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ajustes nas suas marcações</CardTitle>
            <CardDescription>
              O departamento de pessoal corrigiu estas marcações lidas do seu espelho de ponto. Cada linha mostra como
              estava e como ficou; a marcação original continua guardada. Se discordar de algum ajuste, fale com o
              departamento de pessoal.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {ajustes.map((m) => (
              <section key={m.registroId} className="grid gap-2">
                <h3 className="text-sm font-semibold">{m.remessa}</h3>
                <ul className="grid gap-2 text-sm">
                  {m.ajustes.map((a, i) => (
                    <li key={i} className="rounded-md border px-3 py-2">
                      <span className="font-medium tabular-nums">{a.data.split("-").reverse().slice(0, 2).join("/")}</span>
                      {" · "}
                      {descreverAjuste(a)}
                      {a.motivo && <span className="block text-xs">Motivo: {a.motivo}</span>}
                      <span className="text-muted-foreground block text-xs">
                        {formatarDataHora(a.em)}
                        {a.porNome ? ` · ${a.porNome}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  )
}
