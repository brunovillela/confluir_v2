import { Star } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { rotuloEtiqueta, ROTULO_NOTA, type Indicadores } from "@/lib/hospedagem-avaliacoes-constantes"
import { cn } from "@/lib/utils"

/**
 * Indicadores da avaliação da hospedagem — os MESMOS visuais no painel do
 * sindicato e na área do hotel (o que muda é o que entra: o hotel recebe os
 * indicadores sem a etiqueta "só do sindicato"). Server component, sem
 * JavaScript: o tooltip das colunas é CSS (hover/foco) e cada gráfico tem a
 * tabela equivalente num <details>, para leitor de tela e impressão.
 *
 * Cor: tudo aqui é UMA série por gráfico (magnitude), então um só tom da
 * marca por gráfico — elogio × melhorar ficam em cartões com título próprio,
 * a cor só reforça.
 */

const COR_NOTA = "var(--chart-marca-1)"
const COR_MELHORAR = "var(--chart-marca-2)"

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
const MESES_LONGOS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]

const num = (v: number, casas = 0) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })
const pct = (v: number | null) => (v === null ? "—" : `${num(v * 100)}%`)

/** "2026-10" → "out/26" (curto) ou "outubro de 2026" (longo). */
export function rotuloMes(mes: string, longo = false): string {
  const [a, m] = mes.split("-").map(Number)
  if (!a || !m) return mes
  return longo ? `${MESES_LONGOS[m - 1]} de ${a}` : `${MESES[m - 1]}/${String(a).slice(2)}`
}

// ── Período (De/Até pelo check-out) ─────────────────────────────────────────

const ISO = /^\d{4}-\d{2}-\d{2}$/
export const DIAS_PERIODO_PADRAO = 90

export function diasAntesDe(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - dias)
  return d.toISOString().slice(0, 10)
}

/**
 * Lê De/Até da URL; sem eles, os últimos 90 dias até hoje. Datas trocadas
 * (De depois do Até) são desviradas em vez de devolver uma lista vazia.
 */
export function lerPeriodo(
  sp: Record<string, string | undefined>,
  hoje: string
): { de: string; ate: string; padrao: boolean } {
  const de = sp.de && ISO.test(sp.de) ? sp.de : null
  const ate = sp.ate && ISO.test(sp.ate) ? sp.ate : null
  const a = ate ?? hoje
  const d = de ?? diasAntesDe(a, DIAS_PERIODO_PADRAO)
  return d <= a ? { de: d, ate: a, padrao: !de && !ate } : { de: a, ate: d, padrao: false }
}

// ── Estrelas ────────────────────────────────────────────────────────────────

/**
 * Cinco estrelas com o preenchimento proporcional à nota (4,3 pinta quatro
 * inteiras e 30% da quinta) — a média lida de relance, como nas lojas de app.
 */
export function Estrelas({
  nota,
  tamanho = "sm",
  className,
}: {
  nota: number | null
  tamanho?: "xs" | "sm" | "md"
  className?: string
}) {
  const classe = tamanho === "xs" ? "size-3" : tamanho === "md" ? "size-5" : "size-4"
  const valor = nota ?? 0
  return (
    <span
      className={cn("inline-flex items-center gap-0.5", className)}
      role="img"
      aria-label={nota === null ? "Sem nota" : `${num(nota, Number.isInteger(nota) ? 0 : 1)} de 5 estrelas`}
    >
      {[0, 1, 2, 3, 4].map((i) => {
        const fracao = Math.max(0, Math.min(1, valor - i))
        return (
          <span key={i} className={cn("relative inline-block shrink-0", classe)} aria-hidden>
            <Star className={cn("text-muted-foreground/35 absolute inset-0 fill-current", classe)} />
            {fracao > 0 && (
              <span className="absolute inset-0 overflow-hidden" style={{ width: `${fracao * 100}%` }}>
                <Star className={cn("text-primary fill-current", classe)} />
              </span>
            )}
          </span>
        )
      })}
    </span>
  )
}

// ── O painel ────────────────────────────────────────────────────────────────

export function AvaliacoesIndicadores({ ind }: { ind: Indicadores }) {
  const total = ind.respondidas + ind.pendentes

  const kpis = [
    {
      titulo: "Nota média",
      valor: ind.media === null ? "—" : num(ind.media, 2),
      extra: <Estrelas nota={ind.media} />,
      detalhe: ind.media === null ? "nenhuma avaliação no período" : ROTULO_NOTA[Math.round(ind.media)].toLowerCase(),
    },
    {
      titulo: "Avaliações respondidas",
      valor: num(ind.respondidas),
      detalhe: `${num(ind.comComentario)} com comentário`,
    },
    {
      titulo: "Taxa de resposta",
      valor: pct(ind.taxaResposta),
      detalhe: `de ${num(total)} estadia${total === 1 ? "" : "s"} concluída${total === 1 ? "" : "s"}`,
    },
    {
      titulo: "5 estrelas",
      valor: pct(ind.percentual5),
      detalhe: `${num(ind.distribuicao[5])} avaliaç${ind.distribuicao[5] === 1 ? "ão" : "ões"} excelente${ind.distribuicao[5] === 1 ? "" : "s"}`,
    },
    {
      titulo: "Pendentes",
      valor: num(ind.pendentes),
      detalhe: "hóspedes que ainda não avaliaram",
    },
  ]

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {kpis.map((k) => (
          <div key={k.titulo} className="bg-card rounded-xl border p-4 shadow-xs">
            <p className="text-muted-foreground text-xs">{k.titulo}</p>
            <p className="text-2xl font-semibold tabular-nums">{k.valor}</p>
            {k.extra}
            <p className="text-muted-foreground text-xs">{k.detalhe}</p>
          </div>
        ))}
      </div>

      {ind.respondidas === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
          Nenhuma avaliação respondida no período — os gráficos aparecem com a primeira.
        </p>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <Visual titulo="Distribuição das notas" descricao="Quantas avaliações de cada nota, no período">
              <Distribuicao ind={ind} />
            </Visual>
            <Visual titulo="Nota média por mês" descricao="Pelo mês do check-out · escala de 0 a 5">
              <MediaMensal porMes={ind.porMes} />
            </Visual>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Visual titulo="Elogios" descricao="O que mais se destacou nas avaliações de 5 estrelas">
              <ListaEtiquetas itens={ind.elogios} cor={COR_NOTA} vazio="Nenhuma etiqueta nas notas 5." />
            </Visual>
            <Visual titulo="O que pode melhorar" descricao="O que foi marcado nas avaliações de 1 a 4 estrelas">
              <ListaEtiquetas itens={ind.melhorar} cor={COR_MELHORAR} vazio="Nenhuma etiqueta nas notas de 1 a 4." />
            </Visual>
          </div>
        </>
      )}
    </div>
  )
}

function Visual({ titulo, descricao, children }: { titulo: string; descricao?: string; children: React.ReactNode }) {
  return (
    <Card className="min-w-0 gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm">{titulo}</CardTitle>
        {descricao && <CardDescription className="text-xs">{descricao}</CardDescription>}
      </CardHeader>
      <CardContent className="px-4">{children}</CardContent>
    </Card>
  )
}

/** "5★ ████ 62%" — barras horizontais, da nota 5 para a 1, como nas lojas de app. */
function Distribuicao({ ind }: { ind: Indicadores }) {
  const notas = [5, 4, 3, 2, 1] as const
  const max = Math.max(1, ...notas.map((n) => ind.distribuicao[n]))
  return (
    <div className="grid gap-3">
      <ul className="grid gap-1.5" aria-label="Distribuição das notas">
        {notas.map((n) => {
          const q = ind.distribuicao[n]
          const p = ind.respondidas ? q / ind.respondidas : 0
          return (
            <li
              key={n}
              className="grid grid-cols-[2.25rem_1fr_3rem] items-center gap-2 text-xs"
              title={`${n} estrela${n === 1 ? "" : "s"} (${ROTULO_NOTA[n].toLowerCase()}): ${num(q)} — ${pct(p)}`}
            >
              <span className="flex items-center gap-0.5 tabular-nums">
                {n}
                <Star className="text-muted-foreground size-3 fill-current" aria-hidden />
              </span>
              <span className="bg-muted h-3 overflow-hidden rounded-sm">
                <span
                  className="block h-full rounded-r-[4px]"
                  style={{ width: `${(q / max) * 100}%`, minWidth: q ? 2 : 0, background: COR_NOTA }}
                />
              </span>
              <span className="text-muted-foreground text-right tabular-nums">{pct(p)}</span>
            </li>
          )
        })}
      </ul>
      <details className="text-xs">
        <summary className="text-muted-foreground hover:text-foreground cursor-pointer">Ver em tabela</summary>
        <table className="mt-2 w-full text-left tabular-nums">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 font-normal">Nota</th>
              <th className="py-1 text-right font-normal">Avaliações</th>
              <th className="py-1 text-right font-normal">%</th>
            </tr>
          </thead>
          <tbody>
            {notas.map((n) => (
              <tr key={n} className="border-t">
                <td className="py-1">
                  {n} — {ROTULO_NOTA[n]}
                </td>
                <td className="py-1 text-right">{num(ind.distribuicao[n])}</td>
                <td className="py-1 text-right">
                  {pct(ind.respondidas ? ind.distribuicao[n] / ind.respondidas : 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}

/**
 * Colunas da média mês a mês. A escala vai de 0 a 5 FIXA (não do menor ao
 * maior valor): com eixo cortado, 4,6 × 4,8 pareceria um tombo.
 */
function MediaMensal({ porMes }: { porMes: Indicadores["porMes"] }) {
  const n = porMes.length
  return (
    <div className="grid gap-3">
      <div className="relative">
        {/* Linhas-guia discretas em 1–5 (só desenho; os valores estão nas colunas). */}
        <div className="pointer-events-none absolute inset-x-0 top-4 bottom-5" aria-hidden>
          {[5, 4, 3, 2, 1].map((g) => (
            <div
              key={g}
              className="border-border/60 absolute inset-x-0 border-t border-dashed"
              style={{ bottom: `${(g / 5) * 100}%` }}
            />
          ))}
        </div>
        <div className="relative flex h-48 items-end gap-1 sm:gap-2" role="img" aria-label="Nota média por mês">
          {porMes.map((m, i) => (
            <div
              key={m.mes}
              tabIndex={0}
              className="group relative flex h-full min-w-0 flex-1 flex-col items-center gap-1 outline-none"
            >
              {/* A altura é % da área das colunas — os rótulos ficam fora. */}
              <div className="flex w-full flex-1 flex-col items-center justify-end">
                <span className="text-muted-foreground h-4 text-[10px] leading-4 tabular-nums">{num(m.media, 1)}</span>
                <div
                  className="w-full max-w-10 rounded-t-[4px] opacity-90 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                  style={{ height: `calc((100% - 1rem) * ${m.media / 5})`, minHeight: 2, background: COR_NOTA }}
                />
              </div>
              <span className="text-muted-foreground h-4 w-full truncate text-center text-[10px] leading-4">
                {rotuloMes(m.mes)}
              </span>

              <div
                className={cn(
                  "bg-popover text-popover-foreground pointer-events-none absolute bottom-full z-10 mb-1 hidden w-max max-w-52 rounded-md border px-2.5 py-1.5 text-xs shadow-md group-hover:block group-focus-visible:block",
                  // Nas pontas o balão encosta na borda em vez de centrar e vazar.
                  i < 2 && n > 3 ? "left-0" : i > n - 3 && n > 3 ? "right-0" : "left-1/2 -translate-x-1/2"
                )}
              >
                <p className="font-medium first-letter:uppercase">{rotuloMes(m.mes, true)}</p>
                <p className="tabular-nums">Média {num(m.media, 2)}</p>
                <p className="text-muted-foreground tabular-nums">
                  {num(m.quantidade)} {m.quantidade === 1 ? "avaliação" : "avaliações"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <details className="text-xs">
        <summary className="text-muted-foreground hover:text-foreground cursor-pointer">Ver em tabela</summary>
        <table className="mt-2 w-full max-w-md text-left tabular-nums">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 font-normal">Mês</th>
              <th className="py-1 text-right font-normal">Média</th>
              <th className="py-1 text-right font-normal">Avaliações</th>
            </tr>
          </thead>
          <tbody>
            {porMes.map((m) => (
              <tr key={m.mes} className="border-t">
                <td className="py-1 first-letter:uppercase">{rotuloMes(m.mes, true)}</td>
                <td className="py-1 text-right">{num(m.media, 2)}</td>
                <td className="py-1 text-right">{num(m.quantidade)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}

/** As etiquetas mais citadas (até 6), com a contagem — lista curta, sem tabela à parte. */
function ListaEtiquetas({
  itens,
  cor,
  vazio,
}: {
  itens: { chave: string; quantidade: number }[]
  cor: string
  vazio: string
}) {
  if (!itens.length) return <p className="text-muted-foreground text-sm">{vazio}</p>
  const visiveis = itens.slice(0, 6)
  const max = Math.max(1, ...visiveis.map((x) => x.quantidade))
  return (
    <ul className="grid gap-1.5">
      {visiveis.map((x) => (
        <li key={x.chave} className="grid grid-cols-[minmax(0,10rem)_1fr_2.5rem] items-center gap-2 text-xs">
          <span className="truncate" title={rotuloEtiqueta(x.chave)}>
            {rotuloEtiqueta(x.chave)}
          </span>
          <span className="bg-muted h-3 overflow-hidden rounded-sm">
            <span
              className="block h-full rounded-r-[4px]"
              style={{ width: `${(x.quantidade / max) * 100}%`, minWidth: 2, background: cor }}
            />
          </span>
          <span className="text-muted-foreground text-right tabular-nums">{num(x.quantidade)}</span>
        </li>
      ))}
    </ul>
  )
}
