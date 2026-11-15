import { CARTA_PADRAO, montarCarta, montarTitulo, valoresDaCarta, type DadosParaCarta } from "@/lib/oposicao-carta"

/**
 * O texto da carta de oposição na tela — o mesmo do PDF, montado do mesmo
 * modelo (lib/oposicao-carta). Usado no comprovante do trabalhador, na ficha
 * da oposição no painel e na prévia "Ver como o trabalhador" (15/11/2026).
 */
export function CartaTexto({
  dados,
  modelo,
  formatarCpf,
}: {
  dados: DadosParaCarta
  /** O modelo do texto; null = o padrão do sistema. */
  modelo: string | null
  formatarCpf: (cpf: string) => string
}) {
  const valores = valoresDaCarta(dados, formatarCpf)
  const corpo = montarCarta(modelo ?? CARTA_PADRAO, valores)
  const titulo = montarTitulo(modelo ?? CARTA_PADRAO, valores)
  return (
    <div className="bg-muted/40 grid gap-3 rounded-md border p-4 text-sm">
      <p className="text-center text-xs font-semibold tracking-wide">
        {titulo}
      </p>
      {corpo.map((p, i) => (
        <p
          key={i}
          className={p.destaque ? "bg-background rounded border p-3 text-xs whitespace-pre-wrap" : "whitespace-pre-line"}
        >
          {p.trechos.map((t, j) => (t.negrito ? <strong key={j}>{t.texto}</strong> : <span key={j}>{t.texto}</span>))}
        </p>
      ))}
      {dados.protocolo != null && <p className="text-muted-foreground text-xs">Protocolo: {dados.protocolo}</p>}
    </div>
  )
}
