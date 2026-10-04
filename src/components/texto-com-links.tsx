import { Fragment } from "react"

const URL_RE = /(https?:\/\/[^\s<>"']+)/g

/**
 * Texto livre com as URLs clicáveis (mesma aba para links do próprio sistema,
 * nova aba para os de fora). Para descrições gravadas como texto puro, como
 * as demandas abertas pelo canal de feedback, que trazem a tela e o print.
 */
export function TextoComLinks({ texto }: { texto: string }) {
  const partes = texto.split(URL_RE)
  return (
    <>
      {partes.map((parte, i) =>
        i % 2 === 1 ? (
          <a
            key={i}
            href={parte}
            className="text-primary underline underline-offset-4 break-all"
            target={parte.startsWith("http") && !parte.includes(".confluir.") && !parte.includes("localhost") ? "_blank" : undefined}
            rel="noreferrer"
          >
            {parte}
          </a>
        ) : (
          <Fragment key={i}>{parte}</Fragment>
        )
      )}
    </>
  )
}
