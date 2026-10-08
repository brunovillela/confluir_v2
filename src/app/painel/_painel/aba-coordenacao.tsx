import Link from "next/link"
import { FileText, HandCoins, PiggyBank, Receipt, ShoppingCart, TreePalm, Users } from "lucide-react"

import { AvaliacaoOrdemForm } from "@/app/painel/compras/avaliacoes/avaliacao-ordem-form"
import {
  autorizarFeriasCoordenadorAction,
  avaliarDiariaCoordenadorAction,
  decidirFaltaCoordenadorAction,
} from "@/app/painel/coordenador/actions"
import { DecisaoPedido } from "@/app/painel/coordenador/decisao-pedido"
import { compacto } from "@/components/graficos/base"
import { BarraHud, CartaoHud, KpiHud, ListaHud } from "@/components/painel/hud"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import type { SessaoPainel } from "@/lib/auth"
import { ROTULOS_SITUACAO_PROCESSO } from "@/lib/compras-constantes"
import { DecisaoRemessaCompacta } from "@/components/remessa-avaliacao-form"
import { areaDoCoordenador } from "@/lib/db/coordenador"
import { agruparPorRemessa } from "@/lib/db/diarias"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { moduloDaRota, podeAcessarModulo } from "@/lib/permissoes"
import { cn } from "@/lib/utils"

/**
 * COORDENAÇÃO — o departamento de quem o coordena: pedidos da equipe para
 * decidir, orçado × realizado, ordens, compras, contratos e a equipe. Antes
 * era /painel/coordenador (os dados vêm de lib/db/coordenador.ts).
 */
export async function AbaCoordenacao({
  sessao,
  depto,
  salvo,
}: {
  sessao: SessaoPainel
  depto?: string
  salvo?: string
}) {
  const a = await areaDoCoordenador(sessao, depto)
  if (!a) {
    return (
      <Alert>
        <AlertDescription>
          Você não coordena nenhum departamento. A coordenação é definida em Institucional → Organização → Departamentos.
        </AlertDescription>
      </Alert>
    )
  }

  const aqui = `/painel?aba=coordenacao&depto=${a.departamento.id}`
  const podeAbrir = (href: string) => {
    const m = moduloDaRota(href)
    return !m || podeAcessarModulo(sessao.permissoes, m)
  }
  // 08/10: diária em remessa é decidida com a remessa inteira.
  const diariasDaEquipe = agruparPorRemessa(a.pedidos.diarias)
  const pedidos =
    a.pedidos.ferias.length + a.pedidos.faltas.length + diariasDaEquipe.remessas.length + diariasDaEquipe.avulsas.length
  const emAutorizacao = a.ordens.abertas.filter((o) => o.situacao === "Em autorização")
  const totalAberto = a.ordens.abertas.reduce((s, o) => s + (o.valor_inicial_cobranca ?? 0), 0)
  const o = a.orcamento
  const pctTotal = o.totalOrcado > 0 ? o.totalRealizado / o.totalOrcado : 0

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">{a.departamento.nome}</h2>
        {a.outros.length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="text-muted-foreground">Também coordena:</span>
            {a.outros.map((d) => (
              <Link key={d.id} href={`/painel?aba=coordenacao&depto=${d.id}`} className="text-primary hover:underline">
                {d.nome}
              </Link>
            ))}
          </div>
        )}
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Avaliação registrada.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiHud rotulo="Pedidos da equipe" valor={String(pedidos)} nota="férias, faltas e diárias" destaque={pedidos > 0} href="#pedidos" />
        <KpiHud
          rotulo="Ordens em autorização"
          valor={String(emAutorizacao.length)}
          nota={`${a.ordens.abertas.length} em aberto · ${compacto(totalAberto, true)}`}
          href="#ordens"
        />
        <KpiHud
          rotulo={`Orçamento ${o.ano}`}
          valor={o.totalOrcado > 0 ? `${Math.round(pctTotal * 100)}%` : "—"}
          nota={o.totalOrcado > 0 ? `${compacto(o.totalRealizado, true)} de ${compacto(o.totalOrcado, true)}` : "sem orçamento lançado"}
          alerta={o.totalOrcado > 0 && o.totalRealizado > o.totalEsperado}
          href="#orcamento"
        />
        <KpiHud rotulo="Contratos vigentes" valor={String(a.contratos.length)} nota={`${a.equipe.length} pessoas na equipe`} href="#contratos" />
      </div>

      <CartaoHud
        id="pedidos"
        titulo="Pedidos da equipe"
        descricao="Pedidos dos funcionários aguardando decisão. A sua decisão é a autorização — o funcionário é avisado como se o Pessoal tivesse decidido."
        icone={TreePalm}
      >
        {pedidos === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhum pedido aguardando.</p>
        ) : (
          <div className="grid gap-2">
            {a.pedidos.ferias.map((g) => (
              <Pedido
                key={g.gozoId}
                icone={TreePalm}
                tipo="Férias"
                titulo={g.nome}
                detalhe={`${formatarData(g.inicio)} a ${formatarData(g.termino)}${g.dias ? ` · ${g.dias} dias` : ""}${g.abono ? " · venda de 1/3" : ""}${g.pedidoEm ? ` · pedido em ${formatarData(g.pedidoEm)}` : ""}`}
              >
                <DecisaoPedido
                  id={g.gozoId}
                  acao={autorizarFeriasCoordenadorAction}
                  pergunta={`Autorizar as férias de ${g.nome} (${formatarData(g.inicio)} a ${formatarData(g.termino)})?`}
                  aprovar={{ valor: "autorizar", rotulo: "Autorizar" }}
                />
              </Pedido>
            ))}
            {a.pedidos.faltas.map((f) => (
              <Pedido
                key={f.id}
                icone={FileText}
                tipo="Falta justificada"
                titulo={f.funcionarioNome ?? "(sem nome)"}
                detalhe={[formatarData(f.data), f.tipo, f.observacao].filter(Boolean).join(" · ")}
              >
                <DecisaoPedido
                  id={f.id}
                  acao={decidirFaltaCoordenadorAction}
                  pergunta={`Autorizar a falta justificada de ${f.funcionarioNome ?? "funcionário"} em ${formatarData(f.data)}?`}
                  aprovar={{ valor: "autorizar", rotulo: "Autorizar" }}
                  recusar={{ valor: "recusar", rotulo: "Recusar" }}
                />
              </Pedido>
            ))}
            {diariasDaEquipe.remessas.map((r) => (
              <Pedido
                key={r.id}
                icone={HandCoins}
                tipo={r.situacao === "reenviada" ? "Remessa de diárias (reenviada)" : "Remessa de diárias"}
                titulo={`${r.beneficiarioNome ?? "(sem nome)"} — ${formatarMoeda(r.total)}`}
                detalhe={r.diarias
                  .map(
                    (d) =>
                      `${d.tipoNome ?? "Diária"}${d.quantidade ? ` × ${d.quantidade}` : ""}${d.data_inicio ? ` em ${formatarData(d.data_inicio)}` : ""}${d.motivo ? ` (${d.motivo})` : ""}`
                  )
                  .join(" · ")}
              >
                <DecisaoRemessaCompacta
                  remessaId={r.id}
                  resumo={`a remessa de diárias de ${r.beneficiarioNome ?? "funcionário"} (${formatarMoeda(r.total)})`}
                />
              </Pedido>
            ))}
            {diariasDaEquipe.avulsas.map((d) => (
              <Pedido
                key={d.id}
                icone={HandCoins}
                tipo="Diária"
                titulo={`${d.funcionarioNome ?? "(sem nome)"} — ${formatarMoeda((d.valor_total ?? 0) + d.valorDespesas)}`}
                detalhe={[
                  `${d.tipoNome ?? "Diária"}${d.quantidade ? ` × ${d.quantidade}` : ""}`,
                  d.data_inicio ? `${formatarData(d.data_inicio)}${d.data_termino ? ` a ${formatarData(d.data_termino)}` : ""}` : null,
                  d.motivo,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              >
                <DecisaoPedido
                  id={d.id}
                  acao={avaliarDiariaCoordenadorAction}
                  pergunta={`Aprovar a diária de ${d.funcionarioNome ?? "funcionário"}?`}
                  aprovar={{ valor: "aprovar", rotulo: "Aprovar" }}
                  recusar={{ valor: "reprovar", rotulo: "Reprovar" }}
                />
              </Pedido>
            ))}
          </div>
        )}
      </CartaoHud>

      <div className="grid gap-4 xl:grid-cols-2">
        <CartaoHud
          id="orcamento"
          titulo={`Orçado × realizado — ${o.ano}`}
          descricao="Centros de custo do departamento. Só acompanhamento: quem orça é o Financeiro. A marca é o esperado até hoje."
          icone={PiggyBank}
        >
          {!o.disponivel ? (
            <p className="text-muted-foreground text-sm">O orçamento ainda não está disponível neste sistema.</p>
          ) : o.linhas.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum centro de custo do departamento tem orçamento ou gasto em {o.ano}.</p>
          ) : (
            <div className="grid gap-3">
              {o.linhas.map((l) => (
                <div key={l.centroId} className="grid gap-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">{l.nome}</span>
                    <span className="hud-numero text-muted-foreground text-xs">
                      {compacto(l.realizado, true)}
                      {l.orcado > 0 ? ` / ${compacto(l.orcado, true)}` : " · sem orçamento"}
                    </span>
                  </div>
                  {l.orcado > 0 && (
                    <BarraHud pct={l.pct} esperado={l.esperadoAteAgora / l.orcado} alerta={l.realizado > l.esperadoAteAgora} />
                  )}
                </div>
              ))}
              {o.centrosSemOrcamento > 0 && (
                <p className="text-warning-fg text-xs">
                  {o.centrosSemOrcamento} centro(s) com gasto em {o.ano} e sem orçamento lançado — fale com o Financeiro.
                </p>
              )}
            </div>
          )}
        </CartaoHud>

        <CartaoHud
          id="ordens"
          titulo="Ordens de pagamento"
          descricao={`Em aberto: ${a.ordens.abertas.length} · pagas em ${o.ano}: ${a.ordens.pagasNoAno.quantidade} (${compacto(a.ordens.pagasNoAno.valor, true)}). Aprovar depende da sua alçada.`}
          icone={Receipt}
        >
          <div className="grid max-h-[28rem] gap-2 overflow-y-auto pr-1">
            {a.ordens.abertas.length === 0 && <p className="text-muted-foreground text-sm">Nenhuma ordem em aberto.</p>}
            {a.ordens.abertas.map((ord) => (
              <div key={ord.id} className="bg-muted/40 grid gap-2 rounded-lg p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 text-sm">
                    <p className="truncate font-medium">
                      {podeAbrir(`/painel/financeiro/ordens/${ord.id}`) ? (
                        <Link href={`/painel/financeiro/ordens/${ord.id}`} className="text-primary hud-numero hover:underline">
                          {ord.codigo ?? "(sem código)"}
                        </Link>
                      ) : (
                        <span className="hud-numero">{ord.codigo ?? "(sem código)"}</span>
                      )}
                      {ord.favorecidoNome && <> — {ord.favorecidoNome}</>}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {[ord.tipo, ord.vencimento ? `vence ${formatarData(ord.vencimento)}` : null].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <span className="shrink-0 text-right">
                    <span className="hud-numero block text-sm font-semibold">{formatarMoeda(ord.valor_inicial_cobranca)}</span>
                    <Badge variant="outline" className="mt-0.5 text-[0.6875rem]">
                      {ord.situacao}
                    </Badge>
                  </span>
                </div>
                {ord.podeAvaliar && (
                  <AvaliacaoOrdemForm ordemId={ord.id} valorTexto={formatarMoeda(ord.valor_inicial_cobranca)} voltarPara={aqui} />
                )}
              </div>
            ))}
          </div>
        </CartaoHud>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <CartaoHud titulo={`Compras em andamento (${a.compras.length})`} icone={ShoppingCart}>
          <ListaHud vazio="Nenhuma compra em andamento.">
            {a.compras.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
                <span className="min-w-0">
                  {podeAbrir(`/painel/compras/${c.id}`) ? (
                    <Link href={`/painel/compras/${c.id}`} className="text-primary hud-numero hover:underline">
                      {c.codigo ?? "(sem código)"}
                    </Link>
                  ) : (
                    <span className="hud-numero">{c.codigo ?? "(sem código)"}</span>
                  )}
                  <span className="text-muted-foreground block truncate text-xs">{c.produto ?? "—"}</span>
                </span>
                <Badge variant="outline" className="shrink-0">
                  {ROTULOS_SITUACAO_PROCESSO[c.situacao as keyof typeof ROTULOS_SITUACAO_PROCESSO] ?? c.situacao}
                </Badge>
              </li>
            ))}
          </ListaHud>
        </CartaoHud>

        <CartaoHud id="contratos" titulo={`Contratos vigentes (${a.contratos.length})`} icone={FileText}>
          <ListaHud vazio="Nenhum contrato vigente.">
            {a.contratos.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
                <span className="min-w-0">
                  {podeAbrir(`/painel/compras/contratos/${c.id}`) ? (
                    <Link href={`/painel/compras/contratos/${c.id}`} className="text-primary hover:underline">
                      {c.codigo ?? c.objeto ?? "(sem código)"}
                    </Link>
                  ) : (
                    <span>{c.codigo ?? c.objeto ?? "(sem código)"}</span>
                  )}
                  <span className="text-muted-foreground block truncate text-xs">{[c.fornecedorNome, c.objeto].filter(Boolean).join(" · ")}</span>
                </span>
                <span className={cn("hud-numero shrink-0 text-right text-xs", c.vigencia === "vencendo" ? "text-warning-fg" : "text-muted-foreground")}>
                  {c.vigencia_termino ? formatarData(c.vigencia_termino) : "sem termo"}
                </span>
              </li>
            ))}
          </ListaHud>
        </CartaoHud>

        <CartaoHud titulo={`Equipe (${a.equipe.length})`} icone={Users}>
          <ListaHud vazio="">
            {a.equipe.map((m) => (
              <li key={m.usuarioId} className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{m.nome}</span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {[m.coordenador ? "Coordenação" : null, m.origem === "diretor" ? "Diretor" : m.origem === "funcionario" ? "Funcionário" : null, m.cargo]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                {m.emFeriasAte && (
                  <Badge variant="outline" className="border-info/40 text-info-fg shrink-0">
                    férias até {formatarData(m.emFeriasAte)}
                  </Badge>
                )}
              </li>
            ))}
          </ListaHud>
          {a.feriasProximas.length > 0 && (
            <div className="mt-3 border-t pt-3">
              <p className="hud-rotulo mb-1.5">Férias nos próximos 60 dias</p>
              <ul className="grid gap-1 text-xs">
                {a.feriasProximas.map((f, i) => (
                  <li key={`${f.nome}-${f.inicio}-${i}`} className="flex justify-between gap-2">
                    <span className="truncate">{f.nome}</span>
                    <span className="hud-numero text-muted-foreground shrink-0">
                      {formatarData(f.inicio)} a {formatarData(f.termino)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CartaoHud>
      </div>
    </div>
  )
}

function Pedido({
  icone: Icone,
  tipo,
  titulo,
  detalhe,
  children,
}: {
  icone: React.ComponentType<{ className?: string }>
  tipo: string
  titulo: string
  detalhe: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-muted/40 flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg p-3">
      <div className="flex min-w-0 flex-1 basis-56 items-start gap-2.5">
        <Icone className="text-primary mt-0.5 size-4 shrink-0" />
        <div className="min-w-0">
          <p className="hud-rotulo">{tipo}</p>
          <p className="truncate text-sm font-medium">{titulo}</p>
          {detalhe && <p className="text-muted-foreground mt-0.5 text-xs">{detalhe}</p>}
        </div>
      </div>
      {children}
    </div>
  )
}
