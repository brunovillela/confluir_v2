import Link from "next/link"

/**
 * Abas por link (o estado fica na URL, ?aba=): voltar e recarregar mantêm a
 * aba. Padrão das áreas do Pessoal.
 */
export function AbasLink({
  abas,
  rotulo,
}: {
  abas: { href: string; rotulo: string; ativo: boolean; contador?: number | null }[]
  /** Nome do conjunto para leitores de tela. */
  rotulo: string
}) {
  return (
    <nav className="flex gap-1 overflow-x-auto border-b text-sm" aria-label={rotulo}>
      {abas.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          aria-current={a.ativo ? "page" : undefined}
          className={`-mb-px shrink-0 border-b-2 px-3 py-2 ${
            a.ativo ? "border-primary font-medium" : "text-muted-foreground hover:text-foreground border-transparent"
          }`}
        >
          {a.rotulo}
          {a.contador !== undefined && a.contador !== null && (
            <span className="text-muted-foreground ml-1.5 text-xs tabular-nums">{a.contador}</span>
          )}
        </Link>
      ))}
    </nav>
  )
}
