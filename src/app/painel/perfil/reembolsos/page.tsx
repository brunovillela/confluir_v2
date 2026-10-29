import type { Metadata } from "next"
import { TileIndicador } from "@/components/graficos/tile"
import { ExternalLink, ReceiptText } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { ColunaOrdenavel, linkDeOrdem } from "@/components/coluna-ordenavel"
import { Paginacao } from "@/components/paginacao"
import { SituacaoReembolsoBadge } from "@/components/reembolsos"
import { VoltarPerfil } from "@/components/voltar-perfil"
import { requireSessaoPainel } from "@/lib/auth"
import { exigirFuncionario } from "@/lib/db/perfil"
import { urlArquivoPessoal } from "@/lib/db/pessoal"
import {
  listarTiposReembolso,
  meusReembolsos,
} from "@/lib/db/reembolsos"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { MESES } from "@/lib/faltas-constantes"

import { CancelarReembolsoBotao, SolicitarReembolsoForm } from "./solicitacao-form"

export const metadata: Metadata = { title: "Meus reembolsos — Confluir" }

/** Autosserviço: cada funcionário solicita e acompanha os PRÓPRIOS reembolsos. */
export default async function MeusReembolsosPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string; ordem?: string; dir?: string; pagina?: string; porPagina?: string }>
}) {
  const sessao = await requireSessaoPainel()
  // Área de funcionário: diretor e demais usuários sem vínculo com o sindicato voltam ao perfil.
  await exigirFuncionario(sessao.usuario.id as string, { ativo: true })
  const sp = await searchParams
  const { salvo } = sp
  const [{ disponivel, reembolsos }, { tipos }] = await Promise.all([
    meusReembolsos(sessao.usuario.id as string),
    listarTiposReembolso(),
  ])

  const ativos = tipos.filter((t) => t.ativa)
  // Minhas solicitações: ordenação e paginação pela URL (padrão: mais recentes primeiro).
  const ordem = ["data", "tipo", "solicitado", "aprovado", "contracheque", "situacao"].includes(sp.ordem ?? "") ? sp.ordem! : "data"
  const dir: "asc" | "desc" = sp.dir === "asc" || sp.dir === "desc" ? sp.dir : ordem === "data" ? "desc" : "asc"
  const chave = (r: (typeof reembolsos)[number]): string | number | null => {
    switch (ordem) {
      case "tipo": return r.tipoNome?.toLocaleLowerCase("pt-BR") ?? null
      case "solicitado": return r.valor_solicitado
      case "aprovado": return r.valor_aprovado
      case "contracheque":
        // Mês gravado pelo nome ("Junho") ou pelo número ("06").
        return r.pagamento_ano ? Number(r.pagamento_ano) * 100 + (Number(r.pagamento_mes) || MESES.indexOf(r.pagamento_mes ?? "") + 1) : null
      case "situacao": return r.situacao
      default: return r.created_at
    }
  }
  const ordenados = [...reembolsos].sort((a, b) => {
    const x = chave(a)
    const y = chave(b)
    if (x === y) return 0
    if (x === null) return 1 // vazios no fim, nos dois sentidos
    if (y === null) return -1
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR")
    return dir === "asc" ? c : -c
  })
  const PADRAO_POR_PAGINA = 10
  const pag = paginar(ordenados, lerPaginacao(sp, PADRAO_POR_PAGINA))
  const hrefOrdem = linkDeOrdem("/painel/perfil/reembolsos", { porPagina: sp.porPagina }, ordem, dir)

  const urls = new Map<string, string | null>()
  for (const r of pag.linhas) {
    urls.set(r.id, await urlArquivoPessoal(r.comprovante_url))
  }

  // Indicadores (padrão de 3 níveis): os números do ano, como a gestão vê.
  const anoReemb = new Date().getFullYear().toString()
  const doAnoReemb = reembolsos.filter((r) => (r.created_at ?? "").startsWith(anoReemb))
  const somaAprovado = (lista: typeof reembolsos) => lista.reduce((t, r) => t + (r.valor_aprovado ?? 0), 0)
  return (
    <>
      <VoltarPerfil />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Meus reembolsos do ACT
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Solicite os reembolsos previstos no acordo coletivo — aprovados, eles
          são pagos no seu contracheque.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TileIndicador rotulo={`Pedidos em ${anoReemb}`} valor={String(doAnoReemb.length)} />
        <TileIndicador rotulo="Reembolsado no ano" valor={formatarMoeda(somaAprovado(doAnoReemb.filter((r) => r.situacao === "aprovado" || r.situacao === "pago")))} />
        <TileIndicador rotulo="A receber no contracheque" valor={formatarMoeda(somaAprovado(reembolsos.filter((r) => r.situacao === "aprovado")))} />
        <TileIndicador rotulo="Aguardando avaliação" valor={String(reembolsos.filter((r) => r.situacao === "aguardando").length)} />
      </section>

      {!disponivel && (
        <Alert>
          <AlertDescription>
            Os reembolsos ainda não estão configurados no sistema — procure o
            departamento de pessoal.
          </AlertDescription>
        </Alert>
      )}

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            Solicitação enviada — você será avisado quando for avaliada.
          </AlertDescription>
        </Alert>
      )}

      {disponivel && (
        <SolicitarReembolsoForm
          // Nova solicitação gravada → o formulário volta a ficar fechado.
          key={reembolsos.length}
          tipos={ativos.map((t) => ({
            id: t.id,
            rotulo: `${t.nome}${t.proporcao < 1 ? ` — ${Math.round(t.proporcao * 100)}%` : ""}${t.valor_limite !== null ? ` — teto ${formatarMoeda(t.valor_limite)}` : ""}`,
            proporcao: t.proporcao,
            valor_limite: t.valor_limite,
          }))}
        />
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Minhas solicitações</CardTitle>
            <ReceiptText className="text-muted-foreground size-4" />
          </div>
          <CardDescription>
            {reembolsos.length} solicitaç
            {reembolsos.length === 1 ? "ão" : "ões"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reembolsos.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Você ainda não solicitou nenhum reembolso.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <ColunaOrdenavel chave="data" rotulo="Data" ordem={ordem} dir={dir} href={hrefOrdem} />
                    <ColunaOrdenavel chave="tipo" rotulo="Tipo" ordem={ordem} dir={dir} href={hrefOrdem} />
                    <ColunaOrdenavel chave="solicitado" rotulo="Solicitado" ordem={ordem} dir={dir} href={hrefOrdem} className="text-right" />
                    <ColunaOrdenavel chave="aprovado" rotulo="Aprovado" ordem={ordem} dir={dir} href={hrefOrdem} className="text-right" />
                    <ColunaOrdenavel
                      chave="contracheque"
                      rotulo="Contracheque"
                      ordem={ordem}
                      dir={dir}
                      href={hrefOrdem}
                      className="hidden sm:table-cell"
                    />
                    <ColunaOrdenavel chave="situacao" rotulo="Situação" ordem={ordem} dir={dir} href={hrefOrdem} />
                    <TableHead className="hidden md:table-cell">
                      Comprovante
                    </TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pag.linhas.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-muted-foreground whitespace-nowrap tabular-nums">
                        {r.created_at ? formatarData(r.created_at) : "—"}
                      </TableCell>
                      <TableCell className="max-w-44 truncate font-medium">
                        {r.tipoNome ?? "—"}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {formatarMoeda(r.valor_solicitado)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {formatarMoeda(r.valor_aprovado)}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden whitespace-nowrap sm:table-cell">
                        {[r.pagamento_mes, r.pagamento_ano]
                          .filter(Boolean)
                          .join("/") || "—"}
                      </TableCell>
                      <TableCell>
                        <SituacaoReembolsoBadge situacao={r.situacao} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {urls.get(r.id) ? (
                          <a
                            href={urls.get(r.id)!}
                            target="_blank"
                            rel="noreferrer"
                            className="text-foreground inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline"
                          >
                            Abrir <ExternalLink className="size-3" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground text-xs">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.situacao === "aguardando" ? (
                          <CancelarReembolsoBotao id={r.id} />
                        ) : (
                          <span className="text-muted-foreground text-xs">
                            —
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-3">
                <Paginacao
                  total={pag.total}
                  pagina={pag.pagina}
                  totalPaginas={pag.totalPaginas}
                  porPagina={lerPaginacao(sp, PADRAO_POR_PAGINA).porPagina}
                  padrao={PADRAO_POR_PAGINA}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
