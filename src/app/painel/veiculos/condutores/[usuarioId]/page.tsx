import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, IdCard, Pencil } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { indicadoresDoCondutor, perfilDoCondutor } from "@/lib/db/veiculos-condutor"
import { historicoDeCnh } from "@/lib/db/veiculos-condutores-cnh"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { cn } from "@/lib/utils"

import { ABAS, lerAba, type Aba, type Params } from "./filtros"
import { ListaAbastecimentos, ListaChecklists, ListaInfracoes, ListaMovimentacoes, ListaReservas } from "./listas"

export const metadata: Metadata = { title: "Condutor — Confluir" }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function Indicador({
  rotulo,
  valor,
  detalhe,
  alerta,
}: {
  rotulo: string
  valor: string
  detalhe?: string | null
  alerta?: boolean
}) {
  return (
    <div className={cn("rounded-lg border p-3", alerta && "border-warning/50")}>
      <p className="text-muted-foreground text-xs">{rotulo}</p>
      <p className={cn("text-xl font-semibold tabular-nums", alerta && "text-warning-fg")}>{valor}</p>
      {detalhe && <p className="text-muted-foreground text-xs">{detalhe}</p>}
    </div>
  )
}

const n = (v: number) => v.toLocaleString("pt-BR")

export default async function CondutorPage({
  params,
  searchParams,
}: {
  params: Promise<{ usuarioId: string }>
  searchParams: Promise<Params>
}) {
  await requirePermissao("veiculos_gestao")
  const { usuarioId } = await params
  if (!UUID.test(usuarioId)) notFound()
  const sp = await searchParams
  const [perfil, ind] = await Promise.all([perfilDoCondutor(usuarioId), indicadoresDoCondutor(usuarioId)])
  if (!perfil) notFound()

  const aba: Aba = lerAba(sp.aba)
  const cad = perfil.cadastro
  const cnhs = cad ? await historicoDeCnh(cad.id) : []
  const aqui = `/painel/veiculos/condutores/${usuarioId}`
  const ctx = { usuarioId, aba, params: sp, veiculos: ind.veiculos, combustiveis: ind.combustiveis }
  const contagem: Record<Aba, number> = {
    movimentacoes: ind.usos,
    reservas: ind.reservas,
    abastecimentos: ind.abastecimentos,
    infracoes: ind.infracoes,
    checklists: ind.checklists,
  }
  const pctAtraso = ind.devolucoesComPrevisao ? Math.round((ind.devolucoesAtrasadas / ind.devolucoesComPrevisao) * 100) : null

  return (
    <>
      <RotuloTrilha valores={{ [usuarioId]: perfil.nome }} />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/painel/veiculos/condutores">
            <ArrowLeft />
            Condutores
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{perfil.nome}</h1>
              {!cad ? (
                <Badge variant="outline" className="text-muted-foreground">
                  Sem cadastro de condutor
                </Badge>
              ) : !cad.autorizado ? (
                <Badge variant="outline" className="text-muted-foreground">
                  Não autorizado
                </Badge>
              ) : cad.cnhVencida ? (
                <Badge variant="outline" className="border-destructive/40 text-destructive">
                  CNH vencida
                </Badge>
              ) : (
                <Badge variant="outline" className="border-success/40 text-success-fg">
                  Apto
                </Badge>
              )}
              {ind.emUso > 0 && (
                <Badge variant="outline" className="border-warning/40 text-warning-fg">
                  Com veículo agora
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="inline-flex items-center gap-1">
                <IdCard className="size-3.5" />
                {cad?.cnh_numero ? `CNH ${cad.cnh_numero}` : "CNH não informada"}
                {cad?.cnh_categoria ? ` · categoria ${cad.cnh_categoria}` : ""}
                {cad?.cnh_validade ? ` · validade ${formatarData(cad.cnh_validade)}` : ""}
              </span>
              {cad?.autorizado && cad.autorizadoPorNome && (
                <span>
                  autorizado por {cad.autorizadoPorNome}
                  {cad.autorizado_em ? ` em ${formatarData(cad.autorizado_em)}` : ""}
                </span>
              )}
              {perfil.email && <span>{perfil.email}</span>}
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/painel/veiculos/condutores">
              <Pencil />
              {cad ? "Atualizar CNH" : "Cadastrar condutor"}
            </Link>
          </Button>
        </div>
      </div>

      {sp.unificado === "1" && (
        <Alert variant="success">
          <AlertDescription>
            Cadastros unificados: este é o cadastro do condutor, com a CNH mais recente, e os lançamentos da outra conta
            já aparecem aqui.
          </AlertDescription>
        </Alert>
      )}

      {cnhs.length > 0 && (
        <details className="rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Histórico de CNH <span className="text-muted-foreground font-normal">({cnhs.length} anterior{cnhs.length === 1 ? "" : "es"})</span>
          </summary>
          <ul className="mt-3 grid gap-2">
            {cnhs.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="tabular-nums">CNH {h.numero ?? "—"}</span>
                {h.categoria && <span className="text-muted-foreground">categoria {h.categoria}</span>}
                <span className={h.vencida ? "text-muted-foreground" : ""}>validade {formatarData(h.validade)}</span>
                <Badge variant="outline" className="text-xs">
                  {h.origem === "unificacao" ? `veio da unificação${h.origemEmail ? ` (${h.origemEmail})` : ""}` : "substituída na renovação"}
                </Badge>
                <span className="text-muted-foreground text-xs">
                  {formatarData(h.registradoEm)}
                  {h.registradoPor ? ` · por ${h.registradoPor}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador
          rotulo="Usos de veículo"
          valor={n(ind.usos)}
          detalhe={ind.ultimoUsoEm ? `último em ${formatarData(ind.ultimoUsoEm)}` : "nenhum uso registrado"}
        />
        <Indicador
          rotulo="Km rodados"
          valor={n(ind.kmTotal)}
          detalhe={`${n(ind.km12Meses)} km nos últimos 12 meses${ind.mediaKmPorUso !== null ? ` · média ${n(ind.mediaKmPorUso)} km/uso` : ""}`}
        />
        <Indicador rotulo="Dias com veículo" valor={n(ind.diasComVeiculo)} detalhe="soma dos dias fora da garagem" />
        <Indicador
          rotulo="Devoluções atrasadas"
          valor={n(ind.devolucoesAtrasadas)}
          detalhe={
            ind.devolucoesComPrevisao
              ? `${pctAtraso}% das ${n(ind.devolucoesComPrevisao)} com previsão de retorno`
              : "nenhuma devolução com previsão"
          }
          alerta={ind.devolucoesAtrasadas > 0}
        />
        <Indicador
          rotulo="Km fora do normal"
          valor={n(ind.kmAnormal)}
          detalhe="devoluções confirmadas pela recepção"
          alerta={ind.kmAnormal > 0}
        />
        <Indicador
          rotulo="Abastecimentos"
          valor={n(ind.abastecimentos)}
          detalhe={`${formatarMoeda(ind.valorAbastecido)} · ${ind.litros.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} L · ${formatarMoeda(ind.valorAbastecido12Meses)} em 12 meses`}
        />
        <Indicador
          rotulo="Infrações"
          valor={n(ind.infracoes)}
          detalhe={`${formatarMoeda(ind.valorInfracoes)}${ind.cobrancasPendentes ? ` · ${ind.cobrancasPendentes} cobrança(s) pendente(s)` : ""}${ind.infracoesSindicais ? ` · ${ind.infracoesSindicais} em atividade sindical` : ""}`}
          alerta={ind.cobrancasPendentes > 0}
        />
        <Indicador
          rotulo="Reservas"
          valor={n(ind.reservas)}
          detalhe={`${n(ind.reservasNegadas)} negada(s) · ${n(ind.reservasCanceladas)} cancelada(s)`}
        />
      </div>

      {ind.veiculos.some((v) => v.usos > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Veículos mais usados</CardTitle>
            <CardDescription>Por número de usos; km e dias somados em cada veículo.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {ind.veiculos
                .filter((v) => v.usos > 0)
                .slice(0, 6)
                .map((v) => (
                  <li key={v.id} className="grid gap-0.5 rounded-md border px-3 py-2 text-sm">
                    <Link href={`${aqui}?aba=movimentacoes&veiculo=${v.id}`} className="text-primary truncate hover:underline">
                      {v.rotulo}
                    </Link>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {n(v.usos)} uso(s) · {n(v.km)} km · {n(v.dias)} d
                    </span>
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        <nav className="flex flex-wrap gap-1.5 border-b pb-2" aria-label="Listas do condutor">
          {ABAS.map((a) => (
            <Button key={a.chave} variant={aba === a.chave ? "default" : "ghost"} size="sm" asChild>
              <Link href={`${aqui}?aba=${a.chave}`} aria-current={aba === a.chave ? "page" : undefined}>
                {a.rotulo}
                <span className="tabular-nums opacity-70">{n(contagem[a.chave])}</span>
              </Link>
            </Button>
          ))}
        </nav>
        {aba === "movimentacoes" && <ListaMovimentacoes ctx={ctx} />}
        {aba === "reservas" && <ListaReservas ctx={ctx} />}
        {aba === "abastecimentos" && <ListaAbastecimentos ctx={ctx} />}
        {aba === "infracoes" && <ListaInfracoes ctx={ctx} />}
        {aba === "checklists" && <ListaChecklists ctx={ctx} />}
      </div>
    </>
  )
}
