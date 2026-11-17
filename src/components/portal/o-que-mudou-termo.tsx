/**
 * Renovação do termo de privacidade: o que mudou na versão em vigor, em
 * destaque e antes do texto (LGPD art. 8º, § 6º) — o resumo que quem publicou
 * escreveu em Filiados › Termos legais. Sem resumo, nada. Usado nos três
 * lugares onde se aceita de novo: primeiro acesso, Privacidade e dados e a
 * oposição.
 */
export function OQueMudouNoTermo({ texto }: { texto: string | null | undefined }) {
  if (!texto) return null
  return (
    <div className="border-primary bg-primary/5 grid gap-1 rounded-lg border-l-4 px-3 py-2">
      <p className="text-sm font-medium">O que mudou nesta versão</p>
      <p className="text-sm whitespace-pre-line">{texto}</p>
    </div>
  )
}
