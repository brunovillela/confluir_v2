import { LifeBuoy } from "lucide-react"

/**
 * "Precisa de ajuda?" — em toda tela da ficha, com o contato da entidade. Quem
 * tem dificuldade com a tecnologia não pode ficar sem saída.
 */
export function AjudaFicha({ emailContato, site }: { emailContato: string | null; site: string | null }) {
  if (!emailContato && !site) return null
  return (
    <div className="bg-muted/50 text-muted-foreground mt-2 flex items-start gap-2 rounded-lg p-3 text-left text-sm">
      <LifeBuoy className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>
        <strong className="text-foreground">Precisa de ajuda?</strong> Fale com o sindicato
        {emailContato && (
          <>
            {" "}pelo e-mail{" "}
            <a href={`mailto:${emailContato}`} className="text-foreground underline underline-offset-4">
              {emailContato}
            </a>
          </>
        )}
        {emailContato && site ? " ou" : ""}
        {site && (
          <>
            {" "}pelo{" "}
            <a href={site} target="_blank" rel="noreferrer" className="text-foreground underline underline-offset-4">
              site
            </a>
          </>
        )}
        .
      </p>
    </div>
  )
}
