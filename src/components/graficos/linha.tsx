"use client"

import { useId, useState } from "react"

import { compacto, CORES_SERIES, moeda, ticks } from "@/components/graficos/base"

/**
 * Linha de uma série (2px, marcadores de 8px com anel da superfície, área a
 * 10%), mira vertical que gruda no ponto mais próximo e tooltip. Sem legenda:
 * o título diz o que é. Tabela escondida por baixo.
 */
export function GraficoLinha({
  categorias,
  valores,
  nome,
  emMoeda = false,
  altura = 220,
  titulo,
}: {
  categorias: string[]
  valores: number[]
  nome: string
  emMoeda?: boolean
  altura?: number
  titulo: string
}) {
  const [ativo, setAtivo] = useState<number | null>(null)
  const id = useId()
  const n = categorias.length
  const largura = 640
  const margem = { topo: 12, dir: 16, base: 28, esq: 44 }
  const plotL = largura - margem.esq - margem.dir
  const plotA = altura - margem.topo - margem.base
  // Série de NÍVEL (ex.: ativos por mês) que nunca chega perto de zero: o
  // eixo começa num tick redondo abaixo do mínimo, senão a linha vira uma
  // reta colada no topo e a variação some. O eixo mostra onde começa.
  const maior = Math.max(...valores, 0)
  const menor = Math.min(...valores, maior)
  const nivel = menor > maior * 0.5 && maior > menor
  // Passo tirado da AMPLITUDE (não do máximo): base redonda logo abaixo do mínimo.
  const passosAmplitude = ticks(maior - menor)
  const passo = passosAmplitude.length > 1 ? passosAmplitude[1] - passosAmplitude[0] : 1
  const base = nivel ? Math.max(0, Math.floor(menor / passo) * passo) : 0
  const escalaY = ticks(maior - base).map((t) => t + base)
  const max = escalaY[escalaY.length - 1] || 1
  const x = (i: number) => margem.esq + (n > 1 ? (i / (n - 1)) * plotL : plotL / 2)
  const y = (v: number) => margem.topo + plotA - ((v - base) / (max - base || 1)) * plotA
  const pontos = valores.map((v, i) => `${x(i)},${y(v)}`)
  const caminho = pontos.length ? `M${pontos.join(" L")}` : ""
  const area = pontos.length ? `${caminho} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z` : ""
  const fmt = (v: number) => (emMoeda ? moeda(v) : v.toLocaleString("pt-BR"))
  const cor = CORES_SERIES[0]

  const aoMover = (e: React.PointerEvent<SVGRectElement>) => {
    const caixa = e.currentTarget.getBoundingClientRect()
    const rel = ((e.clientX - caixa.left) / caixa.width) * plotL
    const i = n > 1 ? Math.round((rel / plotL) * (n - 1)) : 0
    setAtivo(Math.max(0, Math.min(n - 1, i)))
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
        {area && base === 0 && <path d={area} fill={cor} opacity={0.1} />}
        {caminho && <path d={caminho} fill="none" stroke={cor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {ativo !== null && <line x1={x(ativo)} x2={x(ativo)} y1={margem.topo} y2={margem.topo + plotA} className="graf-mira" />}
        {valores.map((v, i) =>
          i === n - 1 || i === ativo ? (
            <circle key={i} cx={x(i)} cy={y(v)} r={4} fill={cor} stroke="var(--card)" strokeWidth={2} />
          ) : null
        )}
        {n > 0 && (
          <text x={x(n - 1)} y={y(valores[n - 1]) - 8} textAnchor="end" className="graf-rotulo">
            {compacto(valores[n - 1], emMoeda)}
          </text>
        )}
        {categorias.map((c, i) =>
          n <= 12 || i % Math.ceil(n / 12) === 0 ? (
            <text key={c} x={x(i)} y={altura - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="graf-eixo">
              {c}
            </text>
          ) : null
        )}
        <rect
          x={margem.esq}
          y={margem.topo}
          width={plotL}
          height={plotA}
          fill="transparent"
          onPointerMove={aoMover}
          onPointerLeave={() => setAtivo(null)}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") setAtivo((a) => Math.min(n - 1, (a ?? -1) + 1))
            if (e.key === "ArrowLeft") setAtivo((a) => Math.max(0, (a ?? n) - 1))
          }}
          aria-label={`${nome}: ${categorias.map((c, i) => `${c} ${fmt(valores[i] ?? 0)}`).join(", ")}`}
        />
      </svg>

      {ativo !== null && (
        <div className="graf-tooltip" style={{ left: `${(x(ativo) / largura) * 100}%` }} role="status">
          <div className="graf-tooltip-titulo">{categorias[ativo]}</div>
          <div className="graf-tooltip-linha">
            <span className="graf-chave graf-chave-linha" style={{ background: cor }} />
            <strong>{fmt(valores[ativo] ?? 0)}</strong>
            <span>{nome}</span>
          </div>
        </div>
      )}

      <details className="graf-tabela">
        <summary>Ver tabela</summary>
        <table>
          <thead>
            <tr>
              <th>Período</th>
              <th>{nome}</th>
            </tr>
          </thead>
          <tbody>
            {categorias.map((c, i) => (
              <tr key={c}>
                <td>{c}</td>
                <td>{fmt(valores[i] ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
