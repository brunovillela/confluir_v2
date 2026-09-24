import type { Metadata } from "next"
import Link from "next/link"
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, Vote } from "lucide-react"

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
import { requirePermissao } from "@/lib/auth"
import {
  empresasDasCampanhas,
  listarCampanhas,
  ORDENS_CAMPANHA,
  POR_PAGINA_OPCOES,
  resumoAssembleias,
  type AtividadeCampanha,
  type OrdemCampanha,
} from "@/lib/db/assembleias"
import { formatarData, formatarDataHora } from "@/lib/formato"

export const metadata: Metadata = { title: "Votações — Confluir" }

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type Params = {
  busca?: string
  situacao?: string
  empresa?: string
  pagina?: string
  porPagina?: string
  ordem?: string
  dir?: string
}

export default async function VotacoesPage({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  await requirePermissao("assembleias")

  const brutos = await searchParams
  const situacao =
    brutos.situacao === "abertas" || brutos.situacao === "finalizadas"
      ? brutos.situacao
      : "todas"
  const busca = (brutos.busca ?? "").trim()
  const empresaId = (brutos.empresa ?? "").trim()
  const pagina = Number(brutos.pagina) > 0 ? Number(brutos.pagina) : 1
  const porPaginaPedido = Number(brutos.porPagina) || undefined
  const ordemPedida = ORDENS_CAMPANHA.includes(brutos.ordem as OrdemCampanha)
    ? (brutos.ordem as OrdemCampanha)
    : undefined
  const ascPedido =
    brutos.dir === "asc" ? true : brutos.dir === "desc" ? false : undefined

  const [resumo, lista, empresas] = await Promise.all([
    resumoAssembleias(),
    listarCampanhas({
      busca,
      situacao,
      empresaId: empresaId || undefined,
      pagina,
      porPagina: porPaginaPedido,
      ordem: ordemPedida,
      asc: ascPedido,
    }),
    empresasDasCampanhas(),
  ])

  const filtrosQuery = (mudancas: Record<string, string>) => {
    const q = new URLSearchParams()
    const estado: Record<string, string> = {
      busca,
      situacao,
      empresa: empresaId,
      porPagina: brutos.porPagina ?? "",
      ordem: ordemPedida ?? "",
      dir: brutos.dir ?? "",
      ...mudancas,
    }
    for (const [chave, valor] of Object.entries(estado)) {
      if (valor && valor !== "todas") q.set(chave, valor)
    }
    const s = q.toString()
    return s ? `?${s}` : ""
  }

  /** Link do cabeçalho: clicar ordena; clicar de novo inverte. */
  const linkOrdem = (coluna: OrdemCampanha) => {
    const ativa = lista.ordem === coluna
    return filtrosQuery({
      ordem: coluna,
      dir: ativa && !lista.asc ? "asc" : ativa && lista.asc ? "desc" : "",
      pagina: "",
    })
  }

  const emCurso = lista.linhas.filter((c) => c.atividade?.tipo === "em_curso").length
  const emBreve = lista.linhas.filter((c) => c.atividade?.tipo === "em_breve").length

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Votações</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Campanhas, rodadas de assembleias e apuração
          </p>
        </div>
        <Button asChild>
          <Link href="/painel/representacao/votacoes/campanhas/nova">
            <Plus />
            Nova campanha
          </Link>
        </Button>
      </div>

      {!resumo.esquemaPronto && (
        <Alert variant="warning">
          <AlertDescription>
            Votações ainda não configuradas por completo — rode{" "}
            <code>supabase/assembleias.sql</code> no SQL Editor do Supabase
            para habilitar o vínculo com fontes pagadoras, o vínculo
            assembleia→rodada e os índices de votação.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CardResumo rotulo="Campanhas" valor={resumo.campanhas} />
        <CardResumo
          rotulo="Campanhas abertas"
          valor={resumo.campanhasAbertas}
          href={filtrosQuery({ situacao: "abertas", pagina: "" })}
        />
        <CardResumo rotulo="Rodadas em andamento" valor={resumo.rodadasAbertas} />
        <CardResumo rotulo="Votos online (total)" valor={resumo.votosOnline} />
      </div>

      {(emCurso > 0 || emBreve > 0) && (
        <Alert variant="info">
          <AlertDescription>
            {emCurso > 0 && (
              <>
                <strong>
                  {emCurso} {emCurso === 1 ? "campanha" : "campanhas"} em votação
                </strong>{" "}
                agora
              </>
            )}
            {emCurso > 0 && emBreve > 0 && " · "}
            {emBreve > 0 && (
              <>
                {emBreve} {emBreve === 1 ? "abre" : "abrem"} nos próximos 7 dias
              </>
            )}
            . As linhas destacadas mostram qual assembleia e até quando.
          </AlertDescription>
        </Alert>
      )}

      <form
        className="flex flex-wrap items-center gap-2"
        action="/painel/representacao/votacoes"
      >
        <input
          type="search"
          name="busca"
          defaultValue={busca}
          placeholder="Tema da campanha"
          className={`${SELECT_FILTRO} w-64 max-w-full`}
        />
        <select name="situacao" defaultValue={situacao} className={SELECT_FILTRO}>
          <option value="todas">Abertas e finalizadas</option>
          <option value="abertas">Abertas</option>
          <option value="finalizadas">Finalizadas</option>
        </select>
        {empresas.length > 0 && (
          <select
            name="empresa"
            defaultValue={empresaId}
            className={`${SELECT_FILTRO} max-w-64`}
            aria-label="Empresa (fonte pagadora)"
          >
            <option value="">Todas as empresas</option>
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </select>
        )}
        <select
          name="porPagina"
          defaultValue={String(lista.porPagina)}
          className={SELECT_FILTRO}
          aria-label="Campanhas por página"
        >
          {POR_PAGINA_OPCOES.map((n) => (
            <option key={n} value={n}>
              {n} por página
            </option>
          ))}
        </select>
        {/* A ordem escolhida sobrevive ao Filtrar. */}
        {ordemPedida && <input type="hidden" name="ordem" value={ordemPedida} />}
        {brutos.dir && <input type="hidden" name="dir" value={brutos.dir} />}
        <Button type="submit" variant="outline" size="sm">
          Filtrar
        </Button>
      </form>

      <Card>
        <CardContent>
          {lista.linhas.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              <Vote className="mx-auto mb-2 size-5" />
              Nenhuma campanha encontrada com estes filtros.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Ordenavel
                      rotulo="Tema"
                      coluna="tema"
                      ordem={lista.ordem}
                      asc={lista.asc}
                      href={linkOrdem("tema")}
                    />
                  </TableHead>
                  <TableHead>Fontes pagadoras</TableHead>
                  <TableHead>
                    <Ordenavel
                      rotulo="Votação"
                      coluna="atividade"
                      ordem={lista.ordem}
                      asc={lista.asc}
                      href={linkOrdem("atividade")}
                    />
                  </TableHead>
                  <TableHead className="text-right">
                    <Ordenavel
                      rotulo="Rodadas"
                      coluna="rodadas"
                      ordem={lista.ordem}
                      asc={lista.asc}
                      href={linkOrdem("rodadas")}
                      alinhamento="justify-end"
                    />
                  </TableHead>
                  <TableHead>
                    <Ordenavel
                      rotulo="Situação"
                      coluna="situacao"
                      ordem={lista.ordem}
                      asc={lista.asc}
                      href={linkOrdem("situacao")}
                    />
                  </TableHead>
                  <TableHead>
                    <Ordenavel
                      rotulo="Registro"
                      coluna="registro"
                      ordem={lista.ordem}
                      asc={lista.asc}
                      href={linkOrdem("registro")}
                    />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.linhas.map((c) => (
                  <TableRow
                    key={c.id}
                    className={
                      c.atividade?.tipo === "em_curso"
                        ? "bg-success/5 border-l-success border-l-2"
                        : c.atividade?.tipo === "em_breve"
                          ? "bg-info/5 border-l-info border-l-2"
                          : undefined
                    }
                  >
                    <TableCell className="max-w-96">
                      <Link
                        href={`/painel/representacao/votacoes/campanhas/${c.id}`}
                        className="text-primary line-clamp-2 font-medium hover:underline"
                      >
                        {c.tema ?? "(sem tema)"}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-72">
                      {c.fontes.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className="line-clamp-2">
                          {c.fontes.join(", ")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-64">
                      <Atividade atividade={c.atividade} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.rodadas}
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.finalizado ? "secondary" : "info"}>
                        {c.finalizado ? "Finalizada" : "Aberta"}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatarData(c.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {lista.total > 0 && (
            <div className="text-muted-foreground mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="tabular-nums">
                Página {lista.pagina} de {lista.totalPaginas} ·{" "}
                {lista.total.toLocaleString("pt-BR")} campanhas
              </span>
              {lista.totalPaginas > 1 && (
                <div className="flex gap-2">
                  {lista.pagina > 1 && (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={filtrosQuery({ pagina: String(lista.pagina - 1) })}>
                        Anterior
                      </Link>
                    </Button>
                  )}
                  {lista.pagina < lista.totalPaginas && (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={filtrosQuery({ pagina: String(lista.pagina + 1) })}>
                        Próxima
                      </Link>
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}

/** Cabeçalho que ordena: seta para cima/baixo na coluna ativa. */
function Ordenavel({
  rotulo,
  coluna,
  ordem,
  asc,
  href,
  alinhamento = "justify-start",
}: {
  rotulo: string
  coluna: OrdemCampanha
  ordem: OrdemCampanha
  asc: boolean
  href: string
  alinhamento?: string
}) {
  const ativa = ordem === coluna
  const Icone = !ativa ? ArrowUpDown : asc ? ArrowUp : ArrowDown
  return (
    <Link
      href={href}
      className={`hover:text-foreground flex items-center gap-1 ${alinhamento} ${
        ativa ? "text-foreground font-medium" : ""
      }`}
      aria-label={`Ordenar por ${rotulo}`}
    >
      {rotulo}
      <Icone className={`size-3 ${ativa ? "" : "opacity-40"}`} />
    </Link>
  )
}

/** "Em votação até 24/09 18:00" / "Abre em 3 dias". */
function Atividade({ atividade }: { atividade: AtividadeCampanha | null }) {
  if (!atividade) return <span className="text-muted-foreground">—</span>
  const emCurso = atividade.tipo === "em_curso"
  const momento = emCurso ? atividade.termino : atividade.inicio
  return (
    <span className="grid gap-0.5">
      <Badge
        variant="outline"
        className={
          emCurso
            ? "border-success/40 text-success-fg w-fit"
            : "border-info/40 text-info-fg w-fit"
        }
      >
        {emCurso ? "Em votação" : `Abre ${quando(atividade.inicio)}`}
      </Badge>
      <span className="text-muted-foreground truncate text-xs">
        {emCurso ? `até ${formatarDataHora(momento)}` : formatarDataHora(momento)}
        {atividade.assembleia ? ` · ${atividade.assembleia}` : ""}
      </span>
    </span>
  )
}

/** "hoje", "amanhã" ou "em 4 dias" — conta pelos dias no fuso de São Paulo. */
function quando(iso: string | null): string {
  if (!iso) return ""
  const dia = (d: Date) =>
    d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
  const hoje = dia(new Date())
  const alvo = dia(new Date(iso))
  if (alvo === hoje) return "hoje"
  const dias = Math.round(
    (new Date(`${alvo}T12:00:00-03:00`).getTime() -
      new Date(`${hoje}T12:00:00-03:00`).getTime()) /
      86400000
  )
  if (dias === 1) return "amanhã"
  return `em ${dias} dias`
}

function CardResumo({
  rotulo,
  valor,
  href,
}: {
  rotulo: string
  valor: number
  href?: string
}) {
  const conteudo = (
    <CardContent>
      <p className="text-muted-foreground text-xs">{rotulo}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        {valor.toLocaleString("pt-BR")}
      </p>
    </CardContent>
  )
  if (!href) return <Card>{conteudo}</Card>
  return (
    <Link href={href} className="group">
      <Card className="group-hover:border-primary/40 transition-colors">
        {conteudo}
      </Card>
    </Link>
  )
}
