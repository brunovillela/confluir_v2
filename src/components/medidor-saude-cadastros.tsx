/**
 * Medidor em meio círculo da saúde dos cadastros: barras arredondadas que
 * acendem até o valor, na cor da faixa, e um ponteiro. SVG puro (server-safe),
 * cores por token theme-aware.
 *
 * Faixas (Bruno, 15/09/2026): até 50% crítico · até 70% regular · até 85%
 * confiável · acima de 85% excelente. O limite pertence à faixa de baixo.
 */

export type FaixaSaude = {
  rotulo: "Crítico" | "Regular" | "Confiável" | "Excelente"
  cor: string
  classeBadge: string
}

const FAIXAS: { ate: number; faixa: FaixaSaude }[] = [
  { ate: 50, faixa: { rotulo: "Crítico", cor: "var(--destructive)", classeBadge: "border-destructive/40 text-destructive" } },
  { ate: 70, faixa: { rotulo: "Regular", cor: "var(--warning)", classeBadge: "border-warning/40 text-warning-fg" } },
  { ate: 85, faixa: { rotulo: "Confiável", cor: "var(--success)", classeBadge: "border-success/40 text-success-fg" } },
  { ate: Infinity, faixa: { rotulo: "Excelente", cor: "var(--info)", classeBadge: "border-info/40 text-info-fg" } },
]

/** Faixa do percentual já arredondado como é exibido (uma casa). */
export function faixaDaSaude(percentual: number): FaixaSaude {
  return FAIXAS.find((f) => percentual <= f.ate)!.faixa
}

/** Percentual com uma casa, do jeito que aparece e decide a faixa. */
export function percentualSaude(completos: number, total: number): number {
  return total > 0 ? Math.round((completos / total) * 1000) / 10 : 0
}

const BARRAS = 17
const MARCAS = [0, 50, 70, 85, 100]
const [LARGURA, ALTURA, CX, CY] = [260, 150, 130, 128]
const [R_DENTRO, R_FORA, R_MARCA, R_PONTEIRO] = [62, 94, 110, 50]

function ponto(valor: number, raio: number) {
  const angulo = Math.PI * (1 - valor / 100)
  return { x: CX + raio * Math.cos(angulo), y: CY - raio * Math.sin(angulo) }
}

export function MedidorSaudeCadastros({ percentual }: { percentual: number }) {
  const { cor, rotulo } = faixaDaSaude(percentual)
  const passo = 100 / BARRAS
  // Espessura da barra: ~55% do arco médio de cada fatia.
  const espessura = ((Math.PI * ((R_DENTRO + R_FORA) / 2)) / BARRAS) * 0.55
  const ponteiro = ponto(percentual, R_PONTEIRO)

  return (
    <svg
      viewBox={`0 0 ${LARGURA} ${ALTURA}`}
      className="mx-auto w-full max-w-72"
      role="img"
      aria-label={`${percentual.toLocaleString("pt-BR")}% dos cadastros completos — ${rotulo}`}
    >
      {Array.from({ length: BARRAS }, (_, i) => {
        const centro = passo * (i + 0.5)
        const a = ponto(centro, R_DENTRO + espessura / 2)
        const b = ponto(centro, R_FORA - espessura / 2)
        const acesa = centro <= percentual
        return (
          <line
            key={i}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={acesa ? cor : "var(--muted)"}
            strokeWidth={espessura}
            strokeLinecap="round"
          />
        )
      })}
      {MARCAS.map((m) => {
        const p = ponto(m, R_MARCA)
        return (
          <text
            key={m}
            x={p.x}
            y={Math.min(p.y + 4, CY + 4)}
            textAnchor="middle"
            className="fill-muted-foreground text-[11px] tabular-nums"
          >
            {m}
          </text>
        )
      })}
      <line
        x1={CX}
        y1={CY}
        x2={ponteiro.x}
        y2={ponteiro.y}
        stroke="var(--foreground)"
        strokeWidth={3}
        strokeLinecap="round"
      />
      <circle cx={CX} cy={CY} r={6} fill="var(--foreground)" />
    </svg>
  )
}
