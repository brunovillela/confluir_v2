import { areaUtil, FOLHAS, MM, type ModeloEtiqueta } from "@/lib/etiquetas-pimaco"
import type { LinhaEncaixada } from "@/lib/etiquetas-texto"

/**
 * A folha em escala (SVG em milímetros), com as mesmas posições e linhas
 * encaixadas que vão para o PDF. Papel branco em qualquer tema.
 */
export function PreviaFolha({
  modelo,
  posicoes,
  ajusteX = 0,
  ajusteY = 0,
  className,
}: {
  modelo: ModeloEtiqueta
  posicoes: (LinhaEncaixada[] | null)[]
  ajusteX?: number
  ajusteY?: number
  className?: string
}) {
  const folha = FOLHAS[modelo.folha]
  const area = areaUtil(modelo)
  const pt = (v: number) => v / MM

  return (
    <svg
      viewBox={`0 0 ${folha.largura} ${folha.altura}`}
      className={className}
      role="img"
      aria-label={`Prévia da folha Pimaco ${modelo.codigo}`}
      style={{ background: "#fff" }}
    >
      {posicoes.map((linhas, i) => {
        const x = modelo.margemEsquerda + (i % modelo.colunas) * modelo.passoHorizontal + ajusteX
        const y = modelo.margemSuperior + Math.floor(i / modelo.colunas) * modelo.passoVertical + ajusteY
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={modelo.largura}
              height={modelo.altura}
              rx={2}
              fill={linhas ? "#fff7f3" : "#f8fafc"}
              stroke={linhas ? "#ff5722" : "#cbd5e1"}
              strokeWidth={0.3}
              strokeDasharray={linhas ? undefined : "1 1"}
            />
            {linhas?.map((l, j) => (
              <text
                key={j}
                x={x + pt(area.margemX) + (l.alinhamento === "direita" ? pt(area.largura) : 0)}
                y={y + pt(area.margemY + l.topo + l.corpo * 0.8)}
                fontSize={pt(l.corpo)}
                fontFamily="Helvetica, Arial, sans-serif"
                fontWeight={l.negrito ? 700 : 400}
                textAnchor={l.alinhamento === "direita" ? "end" : "start"}
                fill="#0f172a"
              >
                {l.texto}
              </text>
            ))}
          </g>
        )
      })}
    </svg>
  )
}
