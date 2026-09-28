import { Download } from "lucide-react"

/**
 * PDF na própria página pelo leitor do navegador (<object>). Onde não há
 * leitor embutido — Chrome do Android, navegadores embutidos em apps —, o
 * <object> mostra o conteúdo de reserva: o TEXTO integral do documento, com
 * títulos em negrito, e o botão para baixar o PDF.
 *
 * (Desenhar o PDF em <canvas> com PDF.js exigiria o pacote pdfjs-dist; o
 * PDF.js que vem no `unpdf` quebra a hidratação da página no navegador.)
 */
export function VisualizadorPdf({
  src,
  titulo,
  texto,
}: {
  src: string
  titulo: string
  /** Texto do documento, para o conteúdo de reserva. */
  texto: string
}) {
  return (
    <object
      data={src}
      type="application/pdf"
      aria-label={titulo}
      className="bg-muted h-[80vh] w-full rounded-md border"
    >
      <div className="grid gap-3 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted-foreground text-xs">
            Este navegador não mostra PDF dentro da página. Abaixo, o texto integral do documento.
          </p>
          <a
            href={`${src}${src.includes("?") ? "&" : "?"}baixar=1`}
            className="border-input hover:bg-muted inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs"
          >
            <Download className="size-3.5" />
            Baixar o PDF
          </a>
        </div>
        <div className="bg-background max-h-[70vh] overflow-auto rounded-md border p-4 text-sm leading-relaxed">
          {texto.split("\n").map((linha, i) =>
            linha.trim() === "" ? (
              <div key={i} className="h-2" />
            ) : ehTitulo(linha) ? (
              <p key={i} className="mt-2 font-semibold">
                {linha}
              </p>
            ) : (
              <p key={i} className="text-justify">
                {linha}
              </p>
            )
          )}
        </div>
      </div>
    </object>
  )
}

/** Mesma regra do PDF: linha curta em CAIXA ALTA = título. */
function ehTitulo(linha: string): boolean {
  const t = linha.trim()
  if (t.length === 0 || t.length > 90) return false
  return t === t.toUpperCase() && /[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(t)
}
