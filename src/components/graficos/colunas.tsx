"use client"

import { useId, useState } from "react"

import { compacto, COR_OUTROS, CORES_SERIES, moeda, ticks } from "@/components/graficos/base"

export type SerieColunas = { nome: string; valores: number[]; outros?: boolean }

/**
 * Colunas por período, agrupadas ou empilhadas, com tooltip por coluna,
 * legenda (≥ 2 séries) e tabela escondida por baixo. `categorias` são os
 * rótulos do eixo X (um por posição de `valores`).
 */
export function GraficoColunas({
  categorias,
  series,
  empilhado = false,
  emMoeda = false,
  altura = 220,
  titulo,
}: {
  categorias: string[]
  series: SerieColunas[]
  empilhado?: boolean
  emMoeda?: boolean
  altura?: number
  titulo: string
}) {
  const [ativo, setAtivo] = useState<number | null>(null)
  const id = useId()
  const n = categorias.length
  const largura = 640
  const margem = { topo: 12, dir: 8, base: 28, esq: 44 }
  const plotL = largura - margem.esq - margem.dir
  const plotA = altura - margem.topo - margem.base

  const totais = categorias.map((_, i) =>
    empilhado ? series.reduce((s, sr) => s + (sr.valores[i] ?? 0), 0) : Math.max(...series.map((sr) => sr.valores[i] ?? 0), 0)
  )
  const escalaY = ticks(Math.max(...totais, 0))
  const max = escalaY[escalaY.length - 1] || 1
  const y = (v: number) => margem.topo + plotA - (v / max) * plotA
  const banda = plotL / Math.max(n, 1)
  const porGrupo = empilhado ? 1 : series.length
  const vao = 2
  const larguraCol = Math.min(24, (banda * 0.7 - vao * (porGrupo - 1)) / porGrupo)
  const inicioGrupo = (i: number) => margem.esq + banda * i + (banda - (larguraCol * porGrupo + vao * (porGrupo - 1))) / 2
  const cor = (sr: SerieColunas, k: number) => (sr.outros ? COR_OUTROS : CORES_SERIES[k % CORES_SERIES.length])
  const fmt = (v: number) => (emMoeda ? moeda(v) : v.toLocaleString("pt-BR"))

  // Para empilhado, cantos arredondados só na última fatia (a ponta).
  const topoDaPilha = (i: number) => {
    for (let k = series.length - 1; k >= 0; k--) if ((series[k].valores[i] ?? 0) > 0) return k
    return -1
  }

  return (
    <figure className="graf relative" aria-label={titulo}>
      <svg viewBox={`0 0 ${largura} ${altura}`} className="h-auto w-full" role="img" aria-labelledby={`${id}-t`}>
        <title id={`${id}-t`}>{titulo}</title>
        {escalaY.map((t) => (
          <g key={t}>
            <line x1={margem.esq} x2={largura - margem.dir} y1={y(t)} y2={y(t)} className="graf-grade" />
            <text x={margem.esq - 6} y={y(t) + 3.5} textAnchor="end" className="graf-eixo">
              {compacto(t)}
            </text>
          </g>
        ))}
        {categorias.map((c, i) => {
          const base = inicioGrupo(i)
          let acumulado = 0
          const ponta = topoDaPilha(i)
          return (
            <g key={c}>
              {series.map((sr, k) => {
                const v = sr.valores[i] ?? 0
                if (v <= 0) return null
                const x = empilhado ? base : base + k * (larguraCol + vao)
                const yTopo = empilhado ? y(acumulado + v) : y(v)
                const yBase = empilhado ? y(acumulado) - (acumulado > 0 ? vao : 0) : y(0)
                if (empilhado) acumulado += v
                const h = Math.max(yBase - yTopo, 0)
                const arredonda = !empilhado || k === ponta
                const r = Math.min(4, h / 2, larguraCol / 2)
                const d = arredonda
                  ? `M${x},${yBase} V${yTopo + r} a${r},${r} 0 0 1 ${r},-${r} h${larguraCol - 2 * r} a${r},${r} 0 0 1 ${r},${r} V${yBase} Z`
                  : `M${x},${yBase} V${yTopo} h${larguraCol} V${yBase} Z`
                return <path key={sr.nome} d={d} fill={cor(sr, k)} opacity={ativo === null || ativo === i ? 1 : 0.45} />
              })}
              <rect
                x={margem.esq + banda * i}
                y={margem.topo}
                width={banda}
                height={plotA}
                fill="transparent"
                onPointerEnter={() => setAtivo(i)}
                onPointerLeave={() => setAtivo(null)}
                onFocus={() => setAtivo(i)}
                onBlur={() => setAtivo(null)}
                tabIndex={0}
                aria-label={`${c}: ${series.map((sr) => `${sr.nome} ${fmt(sr.valores[i] ?? 0)}`).join(", ")}`}
              />
              {(n <= 12 || i % Math.ceil(n / 12) === 0) && (
                <text x={margem.esq + banda * i + banda / 2} y={altura - 8} textAnchor="middle" className="graf-eixo">
                  {c}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {ativo !== null && (
        <div
          className="graf-tooltip"
          style={{ left: `${((margem.esq + banda * ativo + banda / 2) / largura) * 100}%` }}
          role="status"
        >
          <div className="graf-tooltip-titulo">{categorias[ativo]}</div>
          {series.map((sr, k) => (
            <div key={sr.nome} className="graf-tooltip-linha">
              <span className="graf-chave" style={{ background: cor(sr, k) }} />
              <strong>{fmt(sr.valores[ativo] ?? 0)}</strong>
              <span>{sr.nome}</span>
            </div>
          ))}
          {empilhado && series.length > 1 && (
            <div className="graf-tooltip-linha graf-tooltip-total">
              <span className="graf-chave" style={{ background: "transparent" }} />
              <strong>{fmt(totais[ativo])}</strong>
              <span>total</span>
            </div>
          )}
        </div>
      )}

      {series.length > 1 && (
        <ul className="graf-legenda">
          {series.map((sr, k) => (
            <li key={sr.nome}>
              <span className="graf-chave" style={{ background: cor(sr, k) }} />
              {sr.nome}
            </li>
          ))}
        </ul>
      )}

      <details className="graf-tabela">
        <summary>Ver tabela</summary>
        <table>
          <thead>
            <tr>
              <th>Período</th>
              {series.map((sr) => (
                <th key={sr.nome}>{sr.nome}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categorias.map((c, i) => (
              <tr key={c}>
                <td>{c}</td>
                {series.map((sr) => (
                  <td key={sr.nome}>{fmt(sr.valores[i] ?? 0)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
