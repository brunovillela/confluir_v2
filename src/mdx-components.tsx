import type { MDXComponents } from "mdx/types"
import Link from "next/link"

import { Aviso } from "@/components/ajuda/aviso"
import { Passo, PassoAPasso } from "@/components/ajuda/passo"
import { Print } from "@/components/ajuda/print"
import { RequerPermissao } from "@/components/ajuda/requer-permissao"
import { VejaTambem } from "@/components/ajuda/veja-tambem"

/**
 * Componentes globais dos arquivos MDX (manual da Ajuda). Os elementos de
 * markdown são estilizados aqui — não usamos o plugin @tailwindcss/typography.
 * Os componentes do manual (Passo, Print, Aviso...) ficam disponíveis em
 * qualquer .mdx sem precisar de import.
 */
const components: MDXComponents = {
  h1: (props) => (
    <h1 className="mt-2 text-2xl font-semibold tracking-tight" {...props} />
  ),
  h2: (props) => (
    <h2
      className="mt-8 mb-2 border-b pb-1 text-lg font-semibold tracking-tight"
      {...props}
    />
  ),
  h3: (props) => <h3 className="mt-6 mb-1 font-semibold" {...props} />,
  p: (props) => <p className="my-3 text-sm leading-relaxed" {...props} />,
  ul: (props) => (
    <ul className="my-3 list-disc space-y-1 pl-5 text-sm" {...props} />
  ),
  ol: (props) => (
    <ol className="my-3 list-decimal space-y-1 pl-5 text-sm" {...props} />
  ),
  li: (props) => <li className="leading-relaxed" {...props} />,
  strong: (props) => <strong className="font-semibold" {...props} />,
  hr: (props) => <hr className="my-6" {...props} />,
  blockquote: (props) => (
    <blockquote
      className="text-muted-foreground my-4 border-l-2 pl-4 text-sm italic"
      {...props}
    />
  ),
  code: (props) => (
    <code
      className="bg-muted rounded px-1.5 py-0.5 font-mono text-[0.85em]"
      {...props}
    />
  ),
  // Tabelas (GFM, habilitado por remark-gfm no next.config). O wrapper rola
  // na horizontal para a tabela não estourar a leitura no celular.
  table: (props) => (
    <div className="my-4 overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  ),
  thead: (props) => <thead className="bg-muted/50" {...props} />,
  tr: (props) => <tr className="border-b last:border-0" {...props} />,
  th: (props) => (
    <th
      className="px-3 py-2 text-left align-top font-semibold"
      {...props}
    />
  ),
  td: (props) => (
    <td className="px-3 py-2 align-top leading-relaxed" {...props} />
  ),
  a: ({ href = "", ...props }: React.ComponentProps<"a">) => {
    const interno = href.startsWith("/") || href.startsWith("#")
    return interno ? (
      <Link
        href={href}
        className="text-primary underline-offset-2 hover:underline"
        {...props}
      />
    ) : (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-primary underline-offset-2 hover:underline"
        {...props}
      />
    )
  },
  // Componentes do manual, disponíveis sem import nos .mdx
  Aviso,
  Passo,
  PassoAPasso,
  Print,
  RequerPermissao,
  VejaTambem,
}

export function useMDXComponents(): MDXComponents {
  return components
}
