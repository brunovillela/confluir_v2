import type { Metadata } from "next"
import Link from "next/link"
import {
  Building2,
  ClipboardCheck,
  FileUp,
  FolderHeart,
  Plus,
  Receipt,
  ScrollText,
  UserRoundCheck,
  UserRoundMinus,
  UserRoundPlus,
  UsersRound,
} from "lucide-react"

import { CartaoArea } from "@/components/cartao-area"
import { Donut } from "@/components/grafico-donut"
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { contarSolicitacoesPendentes } from "@/lib/db/filiacao-publica"
import { resumoFiliados } from "@/lib/db/filiados"
import { podeAcessar } from "@/lib/permissoes"

import { BuscaRapida } from "./busca-rapida"

export const metadata: Metadata = { title: "Filiados — Confluir" }

/** Link da lista filtrada por sexo (rótulo do gráfico → parâmetro). */
function urlPorSexo(rotulo: string): string {
  const sexo = rotulo === "Não informado" ? "nenhum" : rotulo
  return `/painel/filiados/lista?sexo=${encodeURIComponent(sexo)}&condicao=Ativo&situacao=todas`
}

function BarraHorizontal({
  rotulo,
  total,
  maximo,
}: {
  rotulo: string
  total: number
  maximo: number
}) {
  const largura = maximo > 0 ? Math.max(1.5, (total / maximo) * 100) : 0
  return (
    <div
      className="grid grid-cols-[minmax(7rem,14rem)_1fr_auto] items-center gap-3"
      title={`${rotulo}: ${total.toLocaleString("pt-BR")}`}
    >
      <span className="truncate text-sm">{rotulo}</span>
      <div className="bg-muted/60 h-4 overflow-hidden rounded-sm">
        <div
          className="bg-primary h-full rounded-r-[4px]"
          style={{ width: `${largura}%` }}
        />
      </div>
      <span className="text-muted-foreground w-14 text-right text-sm tabular-nums">
        {total.toLocaleString("pt-BR")}
      </span>
    </div>
  )
}

/** Cores de marca (variações laranja/navy, theme-aware) por rótulo de sexo. */
const COR_SEXO: Record<string, string> = {
  Masculino: "var(--chart-marca-2)",
  Feminino: "var(--chart-marca-3)",
  Outro: "var(--chart-marca-4)",
}

const fmtNum = (n: number) => n.toLocaleString("pt-BR")
const fmtPct = (v: number, base: number) =>
  (base > 0 ? (v / base) * 100 : 0).toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  })

/** Uma linha da legenda; vira link quando há filtro na lista. */
function LinhaLegenda({
  rotulo,
  total,
  pct,
  cor,
  href,
}: {
  rotulo: string
  total: number
  pct: string
  cor: string
  href?: string
}) {
  const conteudo = (
    <>
      <span
        aria-hidden
        className="size-2.5 shrink-0 rounded-[3px]"
        style={{ background: cor }}
      />
      <span className="min-w-20">{rotulo}</span>
      <span className="text-muted-foreground tabular-nums">
        {fmtNum(total)}
      </span>
      <span className="text-muted-foreground ml-auto tabular-nums">{pct}%</span>
    </>
  )
  return href ? (
    <Link
      href={href}
      className="hover:bg-muted/60 -mx-2 flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors"
    >
      {conteudo}
    </Link>
  ) : (
    <div className="flex items-center gap-2 px-2 py-1 text-sm">{conteudo}</div>
  )
}

/**
 * Pizza composta: a 1ª pizza divide com sexo × sem sexo; a 2ª deriva da fatia
 * "com sexo", abrindo em masculino/feminino/outro.
 */
function GraficoSexoComposto({
  series,
}: {
  series: { rotulo: string; total: number }[]
}) {
  const semSexo = series.find((s) => s.rotulo === "Não informado")?.total ?? 0
  const comItens = series.filter((s) => s.rotulo !== "Não informado")
  const comSexo = comItens.reduce((a, s) => a + s.total, 0)
  const total = comSexo + semSexo

  if (total === 0) {
    return (
      <p className="text-muted-foreground py-4 text-center text-sm">
        Nenhum registro ativo encontrado.
      </p>
    )
  }

  const pizza1 = [
    { rotulo: "Com sexo", total: comSexo, cor: "var(--chart-marca-1)", href: undefined },
    {
      rotulo: "Sem sexo",
      total: semSexo,
      cor: "var(--muted-foreground)",
      href: urlPorSexo("Não informado"),
    },
  ]
  const pizza2 = comItens.map((s) => ({
    ...s,
    cor: COR_SEXO[s.rotulo] ?? "var(--chart-marca-4)",
    href: urlPorSexo(s.rotulo),
  }))

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {/* Pizza 1: com × sem sexo */}
      <div className="grid content-start gap-3">
        <Donut
          fatias={pizza1.map((p) => ({ cor: p.cor, valor: p.total }))}
          centroValor={fmtNum(total)}
          centroRotulo="ativos"
        />
        <div className="grid gap-0.5">
          {pizza1.map((p) => (
            <LinhaLegenda
              key={p.rotulo}
              rotulo={p.rotulo}
              total={p.total}
              pct={fmtPct(p.total, total)}
              cor={p.cor}
              href={p.href}
            />
          ))}
        </div>
        <p className="text-muted-foreground text-center text-xs">
          Preenchimento do campo sexo
        </p>
      </div>

      {/* Pizza 2: divisão entre os que têm sexo informado */}
      <div className="grid content-start gap-3">
        {comSexo > 0 ? (
          <>
            <Donut
              fatias={pizza2.map((p) => ({ cor: p.cor, valor: p.total }))}
              centroValor={fmtNum(comSexo)}
              centroRotulo="com sexo"
            />
            <div className="grid gap-0.5">
              {pizza2.map((p) => (
                <LinhaLegenda
                  key={p.rotulo}
                  rotulo={p.rotulo}
                  total={p.total}
                  pct={fmtPct(p.total, comSexo)}
                  cor={p.cor}
                  href={p.href}
                />
              ))}
            </div>
            <p className="text-muted-foreground text-center text-xs">
              Entre os que têm sexo informado
            </p>
          </>
        ) : (
          <p className="text-muted-foreground flex h-full items-center justify-center py-8 text-center text-sm">
            Nenhum filiado com sexo informado.
          </p>
        )}
      </div>
    </div>
  )
}

export default async function FiliadosPage() {
  const sessao = await requirePermissao("filiacao_filiados", [
    "filiacao_gestao",
    "filiacao_receitas",
  ])
  const podeRegistrar = podeAcessar(sessao.permissoes, "filiacao_gestao")

  const [resumo, pendentesFicha] = await Promise.all([
    resumoFiliados(),
    podeRegistrar ? contarSolicitacoesPendentes() : Promise.resolve(0),
  ])

  const condicao = (nome: string) =>
    resumo.porCondicao.find((c) => c.condicao === nome)?.total ?? 0

  const emAndamento = [
    {
      titulo: "Filiação em andamento",
      grupo: "andamento_filiacao",
      icone: UserRoundPlus,
      partes: [
        { rotulo: "Filiação aguarda fonte", total: condicao("Filiação aguarda fonte") },
        {
          rotulo: "Filiação não informada à fonte",
          total: condicao("Filiação não informada à fonte"),
        },
      ],
    },
    {
      titulo: "Desfiliação em andamento",
      grupo: "andamento_desfiliacao",
      icone: UserRoundMinus,
      partes: [
        {
          rotulo: "Desfiliação aguarda fonte",
          total: condicao("Desfiliação aguarda fonte"),
        },
        {
          rotulo: "Desfiliação não informada à fonte",
          total: condicao("Desfiliação não informada à fonte"),
        },
      ],
    },
  ]

  const indicadores = [
    {
      titulo: "Trabalhadores registrados",
      valor: resumo.registros,
      detalhe: "registros de filiação no cadastro",
      icone: UsersRound,
      href: "/painel/filiados/lista",
    },
    {
      titulo: "Filiações ativas",
      valor: resumo.filiacoesAtivas,
      detalhe: "registros com condição “Ativo”",
      icone: UserRoundCheck,
      href: "/painel/filiados/lista?condicao=Ativo&situacao=todas",
    },
    {
      titulo: "Fontes pagadoras com filiados",
      valor: resumo.fontesComFiliados,
      detalhe: "fontes com filiados ativos",
      icone: Building2,
      href: "/painel/representacao/empregadores",
    },
  ]

  const maxFonte = Math.max(...resumo.porFonte.map((e) => e.total), 0)
  const maxCondicao = Math.max(...resumo.porCondicao.map((c) => c.total), 0)

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Filiados</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Visão geral do quadro de filiação.
          </p>
        </div>
        {podeRegistrar && (
          <Button asChild>
            <Link href="/painel/filiados/novo">
              <Plus />
              Nova filiação
            </Link>
          </Button>
        )}
      </div>

      <BuscaRapida />

      {/* Áreas de Filiados */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CartaoArea
          titulo="Todos os filiados"
          descricao="Lista completa com filtros, busca e exportação"
          href="/painel/filiados/lista"
          icone={UsersRound}
          indicador={`${resumo.registros.toLocaleString("pt-BR")} registros`}
        />
        <CartaoArea
          titulo="Receitas"
          descricao="Remessas de recebimento de contribuições por fonte"
          href="/painel/filiados/receitas"
          icone={Receipt}
        />
        <CartaoArea
          titulo="Prontuários"
          descricao="Histórico e documentos de cada filiado"
          href="/painel/filiados/prontuarios"
          icone={FolderHeart}
        />
        {podeRegistrar && (
          <CartaoArea
            titulo="Fichas de filiação"
            descricao="Solicitações da ficha pública para avaliar"
            href="/painel/filiados/solicitacoes"
            icone={ClipboardCheck}
            indicador={
              pendentesFicha > 0
                ? `${pendentesFicha.toLocaleString("pt-BR")} aguardando avaliação`
                : "Nenhuma pendente"
            }
          />
        )}
        {podeRegistrar && (
          <CartaoArea
            titulo="Termos legais"
            descricao="Textos de LGPD e desconto aceitos na filiação"
            href="/painel/filiados/termos"
            icone={ScrollText}
          />
        )}
        {podeRegistrar && (
          <CartaoArea
            titulo="Importar filiados"
            descricao="Carga em massa a partir de uma planilha"
            href="/painel/filiados/importar"
            icone={FileUp}
          />
        )}
      </div>

      {/* Indicadores */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {indicadores.map((ind) => (
          <Link key={ind.titulo} href={ind.href} className="group">
            <Card className="group-hover:border-primary/40 h-full transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardDescription>{ind.titulo}</CardDescription>
                  <ind.icone className="text-muted-foreground size-4" />
                </div>
                <CardTitle className="text-2xl tabular-nums">
                  {ind.valor.toLocaleString("pt-BR")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-xs">{ind.detalhe}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
        {emAndamento.map((grupo) => {
          const total = grupo.partes.reduce((s, p) => s + p.total, 0)
          return (
            <Card key={grupo.titulo}>
              <CardHeader className="pb-2">
                <Link
                  href={`/painel/filiados/lista?condicao=${grupo.grupo}&situacao=todas`}
                  className="group block"
                >
                  <div className="flex items-center justify-between">
                    <CardDescription className="group-hover:text-foreground transition-colors">
                      {grupo.titulo}
                    </CardDescription>
                    <grupo.icone className="text-muted-foreground size-4" />
                  </div>
                  <CardTitle className="pt-1.5 text-2xl tabular-nums">
                    {total.toLocaleString("pt-BR")}
                  </CardTitle>
                </Link>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-xs">
                  {grupo.partes.map((p, i) => (
                    <span key={p.rotulo}>
                      {i > 0 && <span> · </span>}
                      <Link
                        href={`/painel/filiados/lista?condicao=${encodeURIComponent(p.rotulo)}&situacao=todas`}
                        className="hover:text-foreground underline-offset-2 transition-colors hover:underline"
                      >
                        {p.rotulo.replace(/^(Des)?[Ff]iliação /, "")}:{" "}
                        <span className="tabular-nums">
                          {p.total.toLocaleString("pt-BR")}
                        </span>
                      </Link>
                    </span>
                  ))}
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Aniversariantes de hoje */}
      <GrupoColapsavel
        titulo={`Aniversariantes de hoje (${resumo.aniversariantes.hoje})`}
        resumo={
          <Badge
            variant="outline"
            className="text-muted-foreground tabular-nums"
          >
            {resumo.aniversariantes.total.toLocaleString("pt-BR")}
          </Badge>
        }
      >
        {resumo.aniversariantes.nomes.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Ninguém faz aniversário hoje.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {resumo.aniversariantes.nomes.map((a) => (
              <Link
                key={a.id}
                href={`/painel/filiados/${a.id}`}
                className="hover:bg-muted rounded-full border px-3 py-1 text-sm transition-colors"
              >
                {a.nome_completo ?? "(sem nome)"}
              </Link>
            ))}
            {resumo.aniversariantes.total >
              resumo.aniversariantes.nomes.length && (
              <span className="text-muted-foreground self-center text-sm">
                e mais{" "}
                {resumo.aniversariantes.total -
                  resumo.aniversariantes.nomes.length}
                …
              </span>
            )}
          </div>
        )}
      </GrupoColapsavel>

      {/* Gráficos */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Divisão por sexo</CardTitle>
            <CardDescription>
              Filiados ativos, conforme o cadastro
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GraficoSexoComposto series={resumo.porSexo} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Filiados por fonte pagadora
            </CardTitle>
            <CardDescription>
              Filiados ativos — 10 maiores fontes
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-1">
            {resumo.porFonte.map((e) => (
              <Link
                key={e.id}
                href={`/painel/filiados/lista?fonte=${e.id}&condicao=Ativo&situacao=todas`}
                className="hover:bg-muted/60 -mx-2 rounded-md px-2 py-1 transition-colors"
              >
                <BarraHorizontal
                  rotulo={e.fonte}
                  total={e.total}
                  maximo={maxFonte}
                />
              </Link>
            ))}
            {resumo.porFonte.length === 0 && (
              <p className="text-muted-foreground py-4 text-center text-sm">
                Nenhum vínculo ativo encontrado.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Registros por condição de filiação
          </CardTitle>
          <CardDescription>
            Todos os registros — clique numa condição para abrir a lista
            filtrada
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-1">
          {resumo.porCondicao.map((c) => {
            const rotulo = c.condicao ?? "Sem condição"
            const filtro = c.condicao ?? "nenhuma"
            return (
              <Link
                key={rotulo}
                href={`/painel/filiados/lista?condicao=${encodeURIComponent(filtro)}&situacao=todas`}
                className="hover:bg-muted/60 -mx-2 rounded-md px-2 py-1 transition-colors"
              >
                <BarraHorizontal
                  rotulo={rotulo}
                  total={c.total}
                  maximo={maxCondicao}
                />
              </Link>
            )
          })}
        </CardContent>
      </Card>
    </>
  )
}
