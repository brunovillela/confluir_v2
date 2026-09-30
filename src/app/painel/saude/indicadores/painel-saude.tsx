"use client"

import { useMemo, useState } from "react"
import { ChevronRight, FilterX, Printer } from "lucide-react"

import { Donut } from "@/components/grafico-donut"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { BaseSaude, Dimensao } from "@/lib/db/saude-painel"
import { decodificarColuna } from "@/lib/saude-painel-formato"
import { cn } from "@/lib/utils"

/**
 * Painel analítico da Saúde, no estilo Power BI: segmentações no topo e
 * FILTRO CRUZADO — clicar numa barra, fatia ou célula filtra todos os outros
 * visuais (o próprio visual continua mostrando o todo, com a seleção em
 * destaque). Clique de novo para tirar; vários cliques somam categorias.
 * Tudo roda no navegador sobre a base agregada (sem dado pessoal).
 */

type Chave = Dimensao | "ano" | "mes" | "dia" | "afastamento" | "internacao" | "obito"
const CHAVES: Chave[] = [
  "empresa", "tipo", "sexo", "faixa", "ocupacao", "parte", "natureza", "agente", "situacao", "cid", "municipio",
  "ano", "mes", "dia", "afastamento", "internacao", "obito",
]
type Selecao = Partial<Record<Chave, number[]>>

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
const MESES_LONGOS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"]
const DIAS_LONGOS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]
const CORES = ["var(--chart-marca-1)", "var(--chart-marca-2)", "var(--chart-marca-3)", "var(--chart-marca-4)", "var(--chart-2)", "var(--chart-3)"]

const NOME_CHAVE: Record<Chave, string> = {
  empresa: "Empresa", tipo: "Tipo", sexo: "Sexo", faixa: "Faixa etária", ocupacao: "Ocupação", parte: "Parte do corpo",
  natureza: "Natureza da lesão", agente: "Agente causador", situacao: "Situação geradora", cid: "CID", municipio: "Município",
  ano: "Ano", mes: "Mês", dia: "Dia da semana", afastamento: "Afastamento", internacao: "Internação", obito: "Óbito",
}

const n = (v: number) => v.toLocaleString("pt-BR")
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—")

export function PainelSaude({ base }: { base: BaseSaude }) {
  const colunas = useMemo(
    () => Object.fromEntries(CHAVES.map((c) => [c, decodificarColuna(base.colunas[c])])) as Record<Chave, Int8Array>,
    [base]
  )
  const anos = useMemo(() => {
    let max = -1
    for (const a of colunas.ano) if (a > max) max = a
    return Array.from({ length: max + 1 }, (_, i) => base.anoBase + i)
  }, [colunas, base.anoBase])

  const [sel, setSel] = useState<Selecao>({})

  const rotuloDe = (c: Chave, i: number): string => {
    if (c === "ano") return String(base.anoBase + i)
    if (c === "mes") return MESES_LONGOS[i] ?? "?"
    if (c === "dia") return DIAS_LONGOS[i] ?? "?"
    if (c === "afastamento") return "Com afastamento"
    if (c === "internacao") return "Com internação"
    if (c === "obito") return "Óbito"
    return base.rotulos[c][i] ?? "?"
  }

  function alternar(c: Chave, i: number) {
    setSel((s) => {
      const atual = s[c] ?? []
      const prox = atual.includes(i) ? atual.filter((x) => x !== i) : [...atual, i]
      const novo = { ...s, [c]: prox }
      if (prox.length === 0) delete novo[c]
      // Trocar a seleção de anos desfaz o detalhe por mês daquele ano.
      if (c === "ano" && novo.mes && (prox.length !== 1)) delete novo.mes
      return novo
    })
  }
  function definir(c: Chave, valores: number[]) {
    setSel((s) => {
      const novo = { ...s, [c]: valores }
      if (valores.length === 0) delete novo[c]
      return novo
    })
  }

  // Uma passada: quantos filtros cada CAT reprova e, se só um, qual. O visual
  // da chave k conta as CATs que passam em tudo menos (possivelmente) k.
  const { passa, unicoReprovado } = useMemo(() => {
    const ativos = (Object.entries(sel) as [Chave, number[]][]).filter(([, v]) => v.length > 0)
    const lookup = ativos.map(([c, v]) => {
      const m = new Uint8Array(128)
      for (const x of v) m[x] = 1
      return { c, col: colunas[c], m, pos: CHAVES.indexOf(c) }
    })
    const total = base.total
    const passa = new Uint8Array(total)
    const unicoReprovado = new Int8Array(total).fill(-1)
    for (let i = 0; i < total; i++) {
      let falhas = 0
      let qual = -1
      for (const f of lookup) {
        const v = f.col[i]
        if (v < 0 || !f.m[v]) {
          falhas++
          qual = f.pos
          if (falhas > 1) break
        }
      }
      if (falhas === 0) passa[i] = 1
      else if (falhas === 1) unicoReprovado[i] = qual
    }
    return { passa, unicoReprovado }
  }, [sel, colunas, base.total])

  /** Contagem por categoria para o visual da chave `c` (filtros dos outros visuais aplicados). */
  function contar(c: Chave, tamanho: number): { valores: number[]; naoInformado: number } {
    const col = colunas[c]
    const pos = CHAVES.indexOf(c)
    const valores = new Array(tamanho).fill(0)
    let naoInformado = 0
    for (let i = 0; i < base.total; i++) {
      if (!passa[i] && unicoReprovado[i] !== pos) continue
      const v = col[i]
      if (v < 0) naoInformado++
      else if (v < tamanho) valores[v]++
    }
    return { valores, naoInformado }
  }

  // Indicadores: sobre o conjunto totalmente filtrado.
  const kpi = useMemo(() => {
    let total = 0, afast = 0, intern = 0, obitos = 0, somaDias = 0, comDias = 0, doenca = 0
    const doencaIdx = base.rotulos.tipo.indexOf("Doença ocupacional")
    for (let i = 0; i < base.total; i++) {
      if (!passa[i]) continue
      total++
      if (colunas.afastamento[i] === 0) afast++
      if (colunas.internacao[i] === 0) intern++
      if (colunas.obito[i] === 0) obitos++
      if (base.dias[i] >= 0) {
        somaDias += base.dias[i]
        comDias++
      }
      if (doencaIdx >= 0 && colunas.tipo[i] === doencaIdx) doenca++
    }
    return { total, afast, intern, obitos, mediaDias: comDias ? somaDias / comDias : null, comDias, doenca }
  }, [passa, colunas, base])

  const filtrosAtivos = (Object.entries(sel) as [Chave, number[]][]).filter(([, v]) => v.length > 0)
  const umAno = sel.ano?.length === 1 ? sel.ano[0] : null

  // Série temporal: anos, ou os meses do ano escolhido (detalhamento).
  const serieAnos = contar("ano", anos.length)
  const serieMeses = contar("mes", 12)
  const heat = useMemo(() => {
    const m = Array.from({ length: 12 }, () => new Array(7).fill(0))
    let max = 0
    for (let i = 0; i < base.total; i++) {
      if (!passa[i]) continue
      const mes = colunas.mes[i]
      const dia = colunas.dia[i]
      if (mes < 0 || dia < 0) continue
      m[mes][dia]++
      if (m[mes][dia] > max) max = m[mes][dia]
    }
    return { m, max }
  }, [passa, colunas, base.total])

  return (
    <div className="grid gap-4">
      {/* Segmentações */}
      <Card className="gap-3 py-4 print:hidden">
        <CardContent className="grid gap-3 px-4">
          <div className="flex flex-wrap items-end gap-3">
            <Segmentacao
              rotulo="Ano de"
              valor={sel.ano && sel.ano.length ? String(Math.min(...sel.ano)) : ""}
              opcoes={anos.map((a, i) => ({ valor: String(i), rotulo: String(a) }))}
              aoMudar={(v) => {
                const de = v === "" ? 0 : Number(v)
                const ate = sel.ano && sel.ano.length ? Math.max(...sel.ano) : anos.length - 1
                definir("ano", v === "" && !sel.ano ? [] : range(de, Math.max(de, ate)))
              }}
              vazio="Início"
            />
            <Segmentacao
              rotulo="até"
              valor={sel.ano && sel.ano.length ? String(Math.max(...sel.ano)) : ""}
              opcoes={anos.map((a, i) => ({ valor: String(i), rotulo: String(a) }))}
              aoMudar={(v) => {
                const ate = v === "" ? anos.length - 1 : Number(v)
                const de = sel.ano && sel.ano.length ? Math.min(...sel.ano) : 0
                definir("ano", range(Math.min(de, ate), ate))
              }}
              vazio="Fim"
            />
            <Segmentacao
              rotulo="Empresa"
              largo
              valor={sel.empresa?.length === 1 ? String(sel.empresa[0]) : ""}
              opcoes={base.rotulos.empresa.map((r, i) => ({ valor: String(i), rotulo: r })).sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"))}
              aoMudar={(v) => definir("empresa", v === "" ? [] : [Number(v)])}
              vazio="Todas"
            />
            <Segmentacao
              rotulo="Tipo"
              valor={sel.tipo?.length === 1 ? String(sel.tipo[0]) : ""}
              opcoes={base.rotulos.tipo.map((r, i) => ({ valor: String(i), rotulo: r }))}
              aoMudar={(v) => definir("tipo", v === "" ? [] : [Number(v)])}
              vazio="Todos"
            />
            <Segmentacao
              rotulo="Sexo"
              valor={sel.sexo?.length === 1 ? String(sel.sexo[0]) : ""}
              opcoes={base.rotulos.sexo.map((r, i) => ({ valor: String(i), rotulo: r }))}
              aoMudar={(v) => definir("sexo", v === "" ? [] : [Number(v)])}
              vazio="Todos"
            />
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer />
                Imprimir
              </Button>
              <Button variant="outline" size="sm" onClick={() => setSel({})} disabled={filtrosAtivos.length === 0}>
                <FilterX />
                Limpar filtros
              </Button>
            </div>
          </div>
          {filtrosAtivos.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground text-xs">Filtros:</span>
              {filtrosAtivos.map(([c, v]) => (
                <Badge key={c} variant="secondary" className="gap-1 font-normal">
                  <span className="font-medium">{NOME_CHAVE[c]}:</span>
                  {v.length <= 3 ? v.map((i) => rotuloDe(c, i)).join(", ") : `${v.length} selecionados`}
                  <button type="button" onClick={() => definir(c, [])} aria-label={`Tirar filtro de ${NOME_CHAVE[c]}`} className="ml-0.5 opacity-60 hover:opacity-100">
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">
              Clique numa barra, fatia ou célula para filtrar todo o painel; clique de novo para tirar.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Indicadores */}
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Kpi titulo="CATs" valor={n(kpi.total)} detalhe={filtrosAtivos.length ? `de ${n(base.total)} no total` : "no total"} />
        <Kpi titulo="Com afastamento" valor={n(kpi.afast)} detalhe={`${pct(kpi.afast, kpi.total)} das CATs`} ativo={!!sel.afastamento} aoClicar={() => alternar("afastamento", 0)} />
        <Kpi titulo="Com internação" valor={n(kpi.intern)} detalhe={`${pct(kpi.intern, kpi.total)} das CATs`} ativo={!!sel.internacao} aoClicar={() => alternar("internacao", 0)} />
        <Kpi titulo="Óbitos" valor={n(kpi.obitos)} detalhe={kpi.obitos ? pct(kpi.obitos, kpi.total) : "nenhum no filtro"} alerta={kpi.obitos > 0} ativo={!!sel.obito} aoClicar={() => alternar("obito", 0)} />
        <Kpi titulo="Tratamento médio" valor={kpi.mediaDias === null ? "—" : `${kpi.mediaDias.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dias`} detalhe={`em ${n(kpi.comDias)} CATs com a duração informada`} />
        <Kpi titulo="Doença ocupacional" valor={n(kpi.doenca)} detalhe={`${pct(kpi.doenca, kpi.total)} das CATs`} />
      </div>

      {/* Linha do tempo com detalhamento */}
      <Visual
        titulo={umAno !== null ? `CATs por mês — ${anos[umAno]}` : "CATs por ano"}
        descricao={umAno !== null ? "Clique num mês para filtrar" : "Clique num ano para ver os meses dele (detalhamento); em vários, soma os anos"}
        extra={
          umAno !== null ? (
            <button type="button" className="text-primary inline-flex items-center gap-1 text-xs hover:underline" onClick={() => setSel((s) => { const x = { ...s }; delete x.ano; delete x.mes; return x })}>
              Todos os anos <ChevronRight className="size-3" /> {anos[umAno]}
            </button>
          ) : null
        }
      >
        {umAno !== null ? (
          <Colunas
            rotulos={MESES}
            valores={serieMeses.valores}
            selecionados={sel.mes}
            aoClicar={(i) => alternar("mes", i)}
          />
        ) : (
          <Colunas
            rotulos={anos.map(String)}
            valores={serieAnos.valores}
            selecionados={sel.ano}
            aoClicar={(i) => alternar("ano", i)}
          />
        )}
      </Visual>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <VisualDonut titulo="Tipo de acidente" c="tipo" base={base} contagem={contar("tipo", base.rotulos.tipo.length)} sel={sel.tipo} aoClicar={(i) => alternar("tipo", i)} />
        <VisualDonut titulo="Sexo" c="sexo" base={base} contagem={contar("sexo", base.rotulos.sexo.length)} sel={sel.sexo} aoClicar={(i) => alternar("sexo", i)} />
        <Visual titulo="Faixa etária" descricao="Idade na data do acidente">
          <Colunas rotulos={base.rotulos.faixa} valores={contar("faixa", base.rotulos.faixa.length).valores} selecionados={sel.faixa} aoClicar={(i) => alternar("faixa", i)} compacto />
        </Visual>
        <Visual titulo="Mês × dia da semana" descricao="Sazonalidade — clique numa célula">
          <MapaCalor dados={heat} sel={sel} aoClicar={(m, d) => { definir("mes", [m]); definir("dia", [d]) }} />
        </Visual>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <VisualBarras titulo="Empresas" descricao="CNPJ raiz: filiais e grafias juntas" c="empresa" base={base} contagem={contar("empresa", base.rotulos.empresa.length)} sel={sel.empresa} aoClicar={(i) => alternar("empresa", i)} />
        <VisualBarras titulo="Ocupação (CBO)" c="ocupacao" base={base} contagem={contar("ocupacao", base.rotulos.ocupacao.length)} sel={sel.ocupacao} aoClicar={(i) => alternar("ocupacao", i)} />
        <VisualBarras titulo="Parte do corpo atingida" c="parte" base={base} contagem={contar("parte", base.rotulos.parte.length)} sel={sel.parte} aoClicar={(i) => alternar("parte", i)} />
        <VisualBarras titulo="Natureza da lesão" c="natureza" base={base} contagem={contar("natureza", base.rotulos.natureza.length)} sel={sel.natureza} aoClicar={(i) => alternar("natureza", i)} />
        <VisualBarras titulo="Agente causador" c="agente" base={base} contagem={contar("agente", base.rotulos.agente.length)} sel={sel.agente} aoClicar={(i) => alternar("agente", i)} />
        <VisualBarras titulo="Situação geradora" c="situacao" base={base} contagem={contar("situacao", base.rotulos.situacao.length)} sel={sel.situacao} aoClicar={(i) => alternar("situacao", i)} />
        <VisualBarras titulo="Capítulo do CID-10" c="cid" base={base} contagem={contar("cid", base.rotulos.cid.length)} sel={sel.cid} aoClicar={(i) => alternar("cid", i)} />
        <VisualBarras titulo="Município do acidente" c="municipio" base={base} contagem={contar("municipio", base.rotulos.municipio.length)} sel={sel.municipio} aoClicar={(i) => alternar("municipio", i)} />
      </div>

      <p className="text-muted-foreground text-xs">
        Base: {n(base.total)} CATs (cópias descartadas fora), atualizada ao abrir a página. Categorias com
        pouca ocorrência somam em &quot;Outros&quot;. Só números agregados — nenhum dado pessoal sai do servidor.
      </p>
    </div>
  )
}

function range(de: number, ate: number): number[] {
  return Array.from({ length: ate - de + 1 }, (_, i) => de + i)
}

// ── Peças visuais ───────────────────────────────────────────────────────────

const SELECT =
  "border-input bg-background text-foreground h-9 truncate rounded-md border px-2 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

function Segmentacao({
  rotulo, valor, opcoes, aoMudar, vazio, largo,
}: {
  rotulo: string
  valor: string
  opcoes: { valor: string; rotulo: string }[]
  aoMudar: (v: string) => void
  vazio: string
  largo?: boolean
}) {
  return (
    <label className="text-muted-foreground grid gap-0.5 text-xs">
      {rotulo}
      <select value={valor} onChange={(e) => aoMudar(e.target.value)} className={cn(SELECT, largo ? "w-64" : "w-32")}>
        <option value="">{vazio}</option>
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
    </label>
  )
}

function Kpi({
  titulo, valor, detalhe, ativo, alerta, aoClicar,
}: {
  titulo: string
  valor: string
  detalhe: string
  ativo?: boolean
  alerta?: boolean
  aoClicar?: () => void
}) {
  const corpo = (
    <>
      <p className="text-muted-foreground text-xs">{titulo}</p>
      <p className={cn("text-2xl font-semibold tabular-nums", alerta && "text-destructive")}>{valor}</p>
      <p className="text-muted-foreground text-xs">{detalhe}</p>
    </>
  )
  const classe = cn(
    "bg-card rounded-xl border p-4 text-left shadow-xs",
    ativo && "border-primary ring-primary/30 ring-2",
    aoClicar && "hover:border-primary/50 transition-colors"
  )
  return aoClicar ? (
    <button type="button" onClick={aoClicar} className={classe} aria-pressed={ativo} title="Clique para filtrar o painel">
      {corpo}
    </button>
  ) : (
    <div className={classe}>{corpo}</div>
  )
}

function Visual({
  titulo, descricao, extra, children,
}: {
  titulo: string
  descricao?: string
  extra?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Card className="min-w-0 gap-3 break-inside-avoid py-4">
      <CardHeader className="px-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm">{titulo}</CardTitle>
            {descricao && <CardDescription className="text-xs">{descricao}</CardDescription>}
          </div>
          {extra}
        </div>
      </CardHeader>
      <CardContent className="px-4">{children}</CardContent>
    </Card>
  )
}

function Colunas({
  rotulos, valores, selecionados, aoClicar, compacto,
}: {
  rotulos: string[]
  valores: number[]
  selecionados?: number[]
  aoClicar: (i: number) => void
  compacto?: boolean
}) {
  const max = Math.max(1, ...valores)
  const algum = !!selecionados?.length
  return (
    <div className={cn("flex items-end gap-1", compacto ? "h-40" : "h-52")}>
      {valores.map((v, i) => {
        const ativo = selecionados?.includes(i)
        return (
          <button
            key={rotulos[i]}
            type="button"
            onClick={() => aoClicar(i)}
            title={`${rotulos[i]}: ${n(v)}`}
            aria-pressed={ativo}
            className="group flex h-full min-w-0 flex-1 flex-col items-center gap-1"
          >
            {/* A altura da barra é % da ÁREA da barra — os rótulos ficam fora. */}
            <span className="flex w-full flex-1 flex-col items-center justify-end">
              <span className="text-muted-foreground h-4 text-[10px] leading-4 tabular-nums">{v ? n(v) : ""}</span>
              <span
                className={cn(
                  "w-full rounded-t-sm transition-opacity group-hover:opacity-100",
                  algum && !ativo ? "opacity-35" : "opacity-90"
                )}
                style={{ height: `calc((100% - 1rem) * ${v / max})`, minHeight: v ? 2 : 0, background: ativo ? "var(--chart-marca-2)" : "var(--chart-marca-1)" }}
              />
            </span>
            <span className="text-muted-foreground h-4 w-full truncate text-center text-[10px] leading-4">{rotulos[i]}</span>
          </button>
        )
      })}
    </div>
  )
}

function VisualBarras({
  titulo, descricao, c, base, contagem, sel, aoClicar,
}: {
  titulo: string
  descricao?: string
  c: Dimensao
  base: BaseSaude
  contagem: { valores: number[]; naoInformado: number }
  sel?: number[]
  aoClicar: (i: number) => void
}) {
  const [todos, setTodos] = useState(false)
  const itens = contagem.valores
    .map((v, i) => ({ i, v, r: base.rotulos[c][i] }))
    .filter((x) => x.v > 0 || sel?.includes(x.i))
    // "Outros" sempre por último.
    .sort((a, b) => Number(a.r === "Outros") - Number(b.r === "Outros") || b.v - a.v)
  const visiveis = todos ? itens : itens.slice(0, 10)
  const max = Math.max(1, ...itens.filter((x) => x.r !== "Outros").map((x) => x.v))
  const algum = !!sel?.length
  return (
    <Visual
      titulo={titulo}
      descricao={[descricao, contagem.naoInformado ? `${n(contagem.naoInformado)} sem informação` : null].filter(Boolean).join(" · ") || undefined}
    >
      {itens.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nada no filtro.</p>
      ) : (
        <ul className="grid gap-1">
          {visiveis.map((x) => {
            const ativo = sel?.includes(x.i)
            return (
              <li key={x.i}>
                <button
                  type="button"
                  onClick={() => aoClicar(x.i)}
                  aria-pressed={ativo}
                  className={cn("hover:bg-muted/60 grid w-full grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-2 rounded px-1 py-0.5 text-left text-xs", algum && !ativo && "opacity-45")}
                >
                  <span className="truncate" title={x.r}>{x.r}</span>
                  <span className="bg-muted h-3 overflow-hidden rounded-sm">
                    <span
                      className="block h-full rounded-sm"
                      style={{ width: `${Math.min(100, (x.v / max) * 100)}%`, background: ativo ? "var(--chart-marca-2)" : x.r === "Outros" ? "var(--chart-marca-4)" : "var(--chart-marca-1)" }}
                    />
                  </span>
                  <span className="text-muted-foreground w-12 text-right tabular-nums">{n(x.v)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {itens.length > 10 && (
        <button type="button" className="text-primary mt-2 text-xs hover:underline print:hidden" onClick={() => setTodos(!todos)}>
          {todos ? "Mostrar só os 10 maiores" : `Mostrar todos (${itens.length})`}
        </button>
      )}
    </Visual>
  )
}

function VisualDonut({
  titulo, c, base, contagem, sel, aoClicar,
}: {
  titulo: string
  c: Dimensao
  base: BaseSaude
  contagem: { valores: number[]; naoInformado: number }
  sel?: number[]
  aoClicar: (i: number) => void
}) {
  const total = contagem.valores.reduce((a, b) => a + b, 0)
  const algum = !!sel?.length
  return (
    <Visual titulo={titulo} descricao={contagem.naoInformado ? `${n(contagem.naoInformado)} sem informação` : "Clique na legenda para filtrar"}>
      <div className="grid gap-3">
        <Donut
          className="size-32"
          fatias={contagem.valores.map((v, i) => ({ valor: algum && !sel!.includes(i) ? 0 : v, cor: CORES[i % CORES.length] }))}
          centroValor={n(algum ? contagem.valores.filter((_, i) => sel!.includes(i)).reduce((a, b) => a + b, 0) : total)}
          centroRotulo={algum ? "no filtro" : "CATs"}
        />
        <ul className="grid gap-1">
          {contagem.valores.map((v, i) => {
            const ativo = sel?.includes(i)
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => aoClicar(i)}
                  aria-pressed={ativo}
                  className={cn("hover:bg-muted/60 flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs", algum && !ativo && "opacity-45")}
                >
                  <span className="size-2.5 shrink-0 rounded-sm" style={{ background: CORES[i % CORES.length] }} />
                  <span className="min-w-0 flex-1 truncate">{base.rotulos[c][i]}</span>
                  <span className="text-muted-foreground tabular-nums">{n(v)}</span>
                  <span className="text-muted-foreground w-12 text-right tabular-nums">{pct(v, total)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </Visual>
  )
}

function MapaCalor({
  dados, sel, aoClicar,
}: {
  dados: { m: number[][]; max: number }
  sel: Selecao
  aoClicar: (mes: number, dia: number) => void
}) {
  return (
    <div className="grid grid-cols-[auto_repeat(7,minmax(0,1fr))] gap-0.5 text-[10px]">
      <span />
      {DIAS.map((d) => (
        <span key={d} className="text-muted-foreground text-center">
          {d}
        </span>
      ))}
      {dados.m.map((linha, mes) => (
        <div key={mes} className="contents">
          <span className="text-muted-foreground pr-1 text-right">{MESES[mes]}</span>
          {linha.map((v, dia) => {
            const ativo = sel.mes?.includes(mes) && sel.dia?.includes(dia)
            const intensidade = dados.max ? Math.round((v / dados.max) * 90) + 5 : 0
            return (
              <button
                key={dia}
                type="button"
                onClick={() => aoClicar(mes, dia)}
                title={`${MESES_LONGOS[mes]}, ${DIAS_LONGOS[dia]}: ${n(v)}`}
                className={cn("h-4 rounded-[2px]", ativo && "ring-foreground ring-1")}
                style={{ background: v ? `color-mix(in oklab, var(--chart-marca-1) ${intensidade}%, transparent)` : "var(--muted)" }}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}
