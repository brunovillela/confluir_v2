import { CheckCircle2, ShieldAlert } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { IntegridadeApuracao } from "@/lib/db/votacao-livro-apuracao"
import { formatarDataHora } from "@/lib/formato"
import { hashLegivel } from "@/lib/votacao-integridade"

/**
 * Integridade da apuração (dossiê de auditoria C-2, C-3 e C-5): o hash
 * publicado no encerramento, a conferência automática e o livro de
 * encerramentos e reaberturas. Tudo gravado pelo banco; aqui só se mostra.
 */
export function IntegridadeCard({
  integridade,
  encerrada,
}: {
  integridade: IntegridadeApuracao
  encerrada: boolean
}) {
  const ultimoEncerramento = integridade.eventos.find((e) => e.tipo === "encerramento")
  const conferencia = encerrada ? (ultimoEncerramento?.conferencia ?? null) : null
  const temHash = encerrada && Boolean(integridade.resultadoHash)
  if (!temHash && !conferencia && integridade.eventos.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Integridade do resultado</CardTitle>
        <CardDescription>
          No encerramento o banco congela o resultado, calcula o SHA-256 dele e
          confere a votação. Qualquer pessoa pode recalcular o hash a partir do
          texto abaixo (por exemplo, com <code>sha256sum</code>) e comparar com
          o publicado no relatório e no portal.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {encerrada && integridade.resultadoHash && (
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">Hash do resultado (SHA-256)</p>
              {integridade.confere ? (
                <Badge variant="success">confere com o resultado congelado</Badge>
              ) : (
                <Badge variant="destructive">não confere com o resultado congelado</Badge>
              )}
            </div>
            <p className="bg-muted rounded-md px-3 py-2 font-mono text-xs break-all">
              {hashLegivel(integridade.resultadoHash)}
            </p>
            <details className="text-sm">
              <summary className="text-muted-foreground cursor-pointer text-xs">
                Ver o texto que o hash cobre
              </summary>
              <p className="text-muted-foreground mt-2 text-xs">
                Uma linha por registro do resultado: assembleia; pergunta;
                opção (ou branco/nulo); quantidade. Linhas em ordem de bytes,
                separadas por quebra de linha, sem quebra no fim.
              </p>
              <pre className="bg-muted mt-2 max-h-60 overflow-auto rounded-md px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre">
                {integridade.textoCanonico || "(resultado vazio)"}
              </pre>
            </details>
          </div>
        )}

        {conferencia && (
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">Conferência no encerramento</p>
              {conferencia.ok ? (
                <Badge variant="success">
                  <CheckCircle2 /> tudo OK
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <ShieldAlert /> há falha
                </Badge>
              )}
            </div>
            {conferencia.erro ? (
              <p className="text-destructive text-sm">
                A conferência não rodou: {conferencia.erro}
              </p>
            ) : (
              <ul className="grid gap-1 text-sm">
                {conferencia.verificacoes.map((v) => (
                  <li key={v.id} className="flex flex-wrap gap-x-2">
                    <span
                      className={
                        v.ok
                          ? "text-success-fg w-14 shrink-0 font-medium"
                          : "text-destructive w-14 shrink-0 font-medium"
                      }
                    >
                      {v.id} {v.ok ? "OK" : "FALHA"}
                    </span>
                    <span>{v.nome}</span>
                    <span className="text-muted-foreground text-xs">— {v.detalhe}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-muted-foreground text-xs">
              As mesmas verificações de <code>npm run votacao:auditar</code>, na
              rodada inteira. Só números: nenhum nome, CPF ou voto.
            </p>
          </div>
        )}

        {integridade.eventos.length > 0 && (
          <div className="grid gap-2">
            <p className="text-sm font-medium">Livro da apuração</p>
            <ul className="grid gap-2 text-sm">
              {integridade.eventos.map((e) => (
                <li key={e.id} className="border-l-2 pl-3">
                  <p>
                    <strong>{e.tipo === "encerramento" ? "Encerrada" : "Reaberta"}</strong>{" "}
                    em {formatarDataHora(e.quando)}
                    {e.usuario ? <> por {e.usuario}</> : null}
                  </p>
                  {e.motivo && <p className="text-muted-foreground">Motivo: {e.motivo}</p>}
                  <p className="text-muted-foreground font-mono text-xs">
                    {e.tipo === "encerramento" ? "hash" : "hash do resultado anterior"}{" "}
                    {e.resultadoHash.slice(0, 16)}…
                  </p>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground text-xs">
              O banco só acrescenta linhas a este livro: não há como alterar
              nem apagar.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
