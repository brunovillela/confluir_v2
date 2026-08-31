import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, FileText, HardHat } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { executoresParaDocumentos } from "@/lib/db/pessoal-sst"

export const metadata: Metadata = { title: "Documentos SST — Confluir" }

/**
 * Ordem de Serviço (NR-01) por funcionário e Comunicado de SST por prestador —
 * PDFs prontos para baixar, colher assinatura e arquivar.
 */
export default async function DocumentosSstPage() {
  await requirePermissao("pessoal_gestao")
  const { funcionarios, prestadores } = await executoresParaDocumentos()

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/pessoal/atribuicoes">
            <ArrowLeft />
            Atribuições
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Documentos SST
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          A Ordem de Serviço (NR-01) de cada funcionário e o Comunicado de SST
          de cada prestador — gerados a partir das tarefas, riscos e medidas
          cadastrados. Baixe, colha a assinatura e arquive.
        </p>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              <FileText className="mr-1 inline size-4 align-[-3px]" />
              Ordens de Serviço — funcionários
            </CardTitle>
            <CardDescription>
              NR-01, item 1.4.1: ciência dos riscos ocupacionais e das medidas
              de prevenção, por trabalhador.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {funcionarios.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nenhum funcionário com tarefas atribuídas ainda.
              </p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {funcionarios.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center gap-2 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {f.nome ?? "(sem nome)"}
                      <span className="text-muted-foreground">
                        {" "}
                        · {f.tarefas} tarefa{f.tarefas === 1 ? "" : "s"}
                      </span>
                    </span>
                    <Button asChild variant="outline" size="sm">
                      <a
                        href={`/painel/pessoal/atribuicoes/documentos/os/${f.id}`}
                      >
                        Baixar OS
                      </a>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              <HardHat className="mr-1 inline size-4 align-[-3px]" />
              Comunicados de SST — prestadores
            </CardTitle>
            <CardDescription>
              Riscos das atividades contratadas e exigências de treinamento e
              EPI, por prestador de serviço.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {prestadores.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nenhum prestador com tarefas atribuídas ainda — vincule
                prestadores como executores nas tarefas.
              </p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {prestadores.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-2 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {p.nome ?? "(sem nome)"}
                      <span className="text-muted-foreground">
                        {" "}
                        · {p.tarefas} tarefa{p.tarefas === 1 ? "" : "s"}
                      </span>
                    </span>
                    <Button asChild variant="outline" size="sm">
                      <a
                        href={`/painel/pessoal/atribuicoes/documentos/comunicado/${p.id}`}
                      >
                        Baixar comunicado
                      </a>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-muted-foreground text-xs">
        Os documentos refletem o cadastro atual — antes de emitir, confira as
        tarefas, os riscos por executor e as medidas (treinamentos e EPI) de
        cada um.
      </p>
    </>
  )
}
