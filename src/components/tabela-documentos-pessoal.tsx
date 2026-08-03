import { ExternalLink } from "lucide-react"

import { Paginacao } from "@/components/paginacao"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  urlArquivoPessoal,
  type MeuDocumentoPessoal,
} from "@/lib/db/pessoal"
import { paginar, type Paginacao as Pag } from "@/lib/paginacao"

/**
 * Tabela paginada de documentos liberados do funcionário (contracheques ou
 * espelhos de ponto — mesma forma `MeuDocumentoPessoal`). Server component:
 * resolve as URLs assinadas da página atual. Compartilhada entre as áreas
 * "Contracheques" e "Controle de ponto" do perfil.
 */
export async function TabelaDocumentosPessoal({
  documentos,
  vazio,
  paginacao,
  prefixo,
}: {
  documentos: MeuDocumentoPessoal[]
  vazio: string
  paginacao: Pag
  prefixo: string
}) {
  const paginaAtual = paginar(documentos, paginacao)
  const urls = new Map<string, string | null>()
  for (const d of paginaAtual.linhas) {
    urls.set(d.id, await urlArquivoPessoal(d.arquivo))
  }
  return (
    <div className="grid gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Remessa</TableHead>
            <TableHead className="w-28">Arquivo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginaAtual.total === 0 && (
            <TableRow>
              <TableCell
                colSpan={2}
                className="text-muted-foreground h-20 text-center text-sm"
              >
                {vazio}
              </TableCell>
            </TableRow>
          )}
          {paginaAtual.linhas.map((d) => (
            <TableRow key={d.id}>
              <TableCell className="font-medium">
                {d.remessaNome ?? "(sem remessa)"}
              </TableCell>
              <TableCell>
                {urls.get(d.id) ? (
                  <a
                    href={urls.get(d.id)!}
                    target="_blank"
                    rel="noreferrer"
                    className="text-foreground inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline"
                  >
                    Abrir <ExternalLink className="size-3" />
                  </a>
                ) : (
                  <span className="text-muted-foreground text-xs">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Paginacao
        total={paginaAtual.total}
        pagina={paginaAtual.pagina}
        totalPaginas={paginaAtual.totalPaginas}
        porPagina={paginacao.porPagina}
        padrao={10}
        prefixo={prefixo}
      />
    </div>
  )
}
