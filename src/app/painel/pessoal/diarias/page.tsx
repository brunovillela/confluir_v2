import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, History, Landmark, Send, Table2 } from "lucide-react"

import { linkDeOrdem } from "@/components/coluna-ordenavel"
import { GrandesNumerosDiarias, SituacaoDiariaBadge } from "@/components/diarias"
import { AbasLink } from "@/components/pessoal/abas-link"
import { FiltrosFuncionarios } from "@/components/pessoal/filtros-funcionarios"
import { TabelaFuncionarios } from "@/components/pessoal/tabela-funcionarios"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SelectNativo } from "@/components/ui/select-nativo"
import { LembrarLista } from "@/components/voltar-lista"
import { requirePermissao } from "@/lib/auth"
import { listarSolicitacoesDiaria, type SolicitacaoDiaria } from "@/lib/db/diarias"
import { contarRemessasHistorico } from "@/lib/db/diarias-historico"
import { listarRemessasNovas } from "@/lib/db/diarias-remessas"
import { departamentosDaLista, funcionariosDaArea } from "@/lib/db/pessoal-area"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { filtrarFuncionarios, lerFiltrosArea, ordenarPor, paramsDosFiltros } from "@/lib/pessoal-area"

import { ListaSolicitacoesDiaria } from "./solicitacoes-lista"

export const metadata: Metadata = { title: "Diárias — Confluir" }

const ORDENS = ["nome", "quantidade", "valor", "aguardando", "ultima"] as const

/** Ano de uma diária: o do início da atividade (senão, o da solicitação). */
const anoDa = (s: SolicitacaoDiaria) => (s.data_inicio ?? s.created_at ?? "").slice(0, 4)
/** Diária "de verdade" (o complemento de despesas conta junto da original). */
const principal = (s: SolicitacaoDiaria) => !s.complementoDe

/**
 * Diárias — nível 1 do padrão das áreas do Pessoal: as remessas a avaliar
 * (a fila) no topo, os grandes números e as abas Funcionários (inicial) e
 * Solicitações.
 */
export default async function DiariasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requirePermissao("pessoal_gestao", ["pessoal_diarias"])
  const sp = await searchParams
  const aba = sp.aba === "solicitacoes" ? "solicitacoes" : "funcionarios"

  // Só as de funcionário: as da diretoria têm porta e permissão próprias.
  const [{ disponivel, solicitacoes }, noHistorico, { remessas }, funcionarios] = await Promise.all([
    listarSolicitacoesDiaria({ quadro: "funcionario" }),
    contarRemessasHistorico(),
    listarRemessasNovas({ quadro: "funcionario" }),
    funcionariosDaArea(),
  ])
  // Remessas a avaliar (abertas ou reenviadas, com diária) — 08/10.
  const aAvaliar = remessas.filter(
    (r) =>
      !r.enviada &&
      r.situacao !== "devolvida" &&
      r.situacao !== "preparacao" &&
      r.situacao !== "aprovada" &&
      r.contagem.aguardando + r.contagem.aprovada > 0
  )
  const aguardando = solicitacoes.filter((s) => s.situacao === "aguardando").length

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal">
            <ArrowLeft />
            Pessoal
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Diárias</h1>
            <p className="text-muted-foreground mt-1 text-xs">
              {aguardando} aguardando avaliação · {solicitacoes.length.toLocaleString("pt-BR")} solicitação(ões) no total —
              cada diária entra na remessa do funcionário, avaliada inteira
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/painel/pessoal/diarias/remessas">
                <Send />
                Remessas
                {aAvaliar.length > 0 && <> ({aAvaliar.length} a avaliar)</>}
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/painel/pessoal/diarias/historico">
                <History />
                Histórico
                {noHistorico > 0 && <> ({noHistorico.toLocaleString("pt-BR")})</>}
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/painel/pessoal/diarias/tipos">
                <Table2 />
                Tipos de diária
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/painel/pessoal/diarias/contas">
                <Landmark />
                Centros de custo
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {!disponivel && (
        <Alert>
          <AlertDescription>
            As solicitações de diária ainda não estão configuradas no banco — rode <code>supabase/diarias.sql</code> no SQL
            Editor do Supabase.
          </AlertDescription>
        </Alert>
      )}

      <GrandesNumerosDiarias solicitacoes={solicitacoes} />

      {aAvaliar.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Remessas a avaliar
              <span className="text-muted-foreground ml-2 text-sm font-normal">{aAvaliar.length}</span>
            </CardTitle>
            <CardDescription>A avaliação é da remessa inteira: aprovada, vira uma ordem de pagamento.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {aAvaliar.map((r) => (
              <Link
                key={r.id}
                href={`/painel/pessoal/diarias/remessas/${r.id}`}
                className="hover:bg-muted flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <span className="font-medium">
                  {r.beneficiarioNome ?? "(sem nome)"}{" "}
                  <span className="text-muted-foreground font-normal">· remessa {r.codigo ?? ""}</span>
                </span>
                <span className="flex items-center gap-2">
                  {r.situacao === "reenviada" && <Badge variant="info">Reenviada</Badge>}
                  <span className="tabular-nums">{formatarMoeda(r.valorTotal)}</span>
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <AbasLink
        rotulo="Visões das diárias"
        abas={[
          { href: "/painel/pessoal/diarias", rotulo: "Funcionários", ativo: aba === "funcionarios" },
          {
            href: "/painel/pessoal/diarias?aba=solicitacoes",
            rotulo: "Solicitações",
            ativo: aba === "solicitacoes",
            contador: solicitacoes.length,
          },
        ]}
      />

      {aba === "solicitacoes" ? (
        <ListaSolicitacoesDiaria solicitacoes={solicitacoes} brutos={sp} noHistorico={noHistorico} />
      ) : (
        <AbaFuncionarios sp={sp} solicitacoes={solicitacoes} funcionarios={funcionarios} />
      )}
    </>
  )
}

function AbaFuncionarios({
  sp,
  solicitacoes,
  funcionarios,
}: {
  sp: Record<string, string | undefined>
  solicitacoes: SolicitacaoDiaria[]
  funcionarios: Awaited<ReturnType<typeof funcionariosDaArea>>
}) {
  const anos = [...new Set(solicitacoes.map(anoDa).filter(Boolean))].sort().reverse()
  const anoAtual = new Date().getFullYear().toString()
  const ano = sp.ano && anos.includes(sp.ano) ? sp.ano : anos.includes(anoAtual) ? anoAtual : anos[0]
  const doAno = solicitacoes.filter((s) => anoDa(s) === ano)

  type Resumo = { quantidade: number; valor: number; aguardando: number; ultima: SolicitacaoDiaria | null }
  const resumo = new Map<string, Resumo>()
  for (const s of doAno) {
    if (!s.funcionario_id) continue
    const r = resumo.get(s.funcionario_id) ?? { quantidade: 0, valor: 0, aguardando: 0, ultima: null }
    if (s.situacao === "aprovada") {
      if (principal(s)) r.quantidade += s.quantidade ?? 1
      r.valor += (s.valor_total ?? 0) + s.valorDespesas
    }
    if (s.situacao === "aguardando") r.aguardando++
    if (principal(s) && (!r.ultima || (s.data_inicio ?? "") > (r.ultima.data_inicio ?? ""))) r.ultima = s
    resumo.set(s.funcionario_id, r)
  }

  const f = lerFiltrosArea(sp, ORDENS, { ordem: "nome" })
  const valor = (l: (typeof funcionarios)[number]) => {
    const r = resumo.get(l.usuarioId)
    switch (f.ordem) {
      case "quantidade":
        return r?.quantidade
      case "valor":
        return r?.valor
      case "aguardando":
        return r?.aguardando
      case "ultima":
        return r?.ultima?.data_inicio
      default:
        return l.nome
    }
  }
  const linhas = ordenarPor(filtrarFuncionarios(funcionarios, f), f.dir, valor)
  const paginacao = lerPaginacao(sp, 30)
  const pagina = paginar(linhas, paginacao)
  const params = paramsDosFiltros(f, { ano: sp.ano })
  const urlAtual = `/painel/pessoal/diarias?${new URLSearchParams(
    Object.entries({ ...params, pagina: sp.pagina, porPagina: sp.porPagina }).filter((e): e is [string, string] => Boolean(e[1]))
  )}`

  return (
    <>
      <LembrarLista chave="diarias-funcionarios" url={urlAtual} />
      <FiltrosFuncionarios
        filtros={f}
        departamentos={departamentosDaLista(funcionarios)}
        extras={
          anos.length > 0 && (
            <SelectNativo name="ano" defaultValue={ano} aria-label="Ano" className="h-9 w-auto">
              {anos.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </SelectNativo>
          )
        }
      />
      <TabelaFuncionarios
        pagina={pagina}
        ordem={f.ordem}
        dir={f.dir}
        porPagina={paginacao.porPagina}
        linkOrdem={linkDeOrdem("/painel/pessoal/diarias", params, f.ordem, f.dir)}
        hrefFuncionario={(l) => `/painel/pessoal/diarias/funcionario/${l.usuarioId}${ano ? `?ano=${ano}` : ""}`}
        colunas={[
          {
            chave: "quantidade",
            rotulo: `Diárias ${ano ?? ""}`.trim(),
            className: "text-right tabular-nums",
            valor: (l) => resumo.get(l.usuarioId)?.quantidade || "—",
          },
          {
            chave: "valor",
            rotulo: "Recebido",
            className: "text-right tabular-nums",
            valor: (l) => {
              const v = resumo.get(l.usuarioId)?.valor
              return v ? formatarMoeda(v) : "—"
            },
          },
          {
            chave: "aguardando",
            rotulo: "Aguardando",
            className: "hidden text-right md:table-cell",
            valor: (l) => {
              const n = resumo.get(l.usuarioId)?.aguardando ?? 0
              return n ? <span className="text-warning-fg font-medium tabular-nums">{n}</span> : <span className="text-muted-foreground">—</span>
            },
          },
          {
            chave: "ultima",
            rotulo: "Última",
            className: "hidden lg:table-cell",
            valor: (l) => {
              const u = resumo.get(l.usuarioId)?.ultima
              if (!u) return <span className="text-muted-foreground">—</span>
              return (
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  <Link href={`/painel/pessoal/diarias/${u.id}`} className="hover:underline">
                    {formatarData(u.data_inicio)} · {u.tipoNome ?? "Diária"}
                  </Link>
                  {u.situacao !== "aprovada" && <SituacaoDiariaBadge situacao={u.situacao} />}
                </span>
              )
            },
          },
        ]}
      />
    </>
  )
}
