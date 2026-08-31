import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, GraduationCap } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { matrizTreinamento, type StatusTreino } from "@/lib/db/pessoal-sst"

export const metadata: Metadata = { title: "Matriz de treinamento — Confluir" }

const STATUS: Record<StatusTreino, { rotulo: string; cor: string }> = {
  valido: { rotulo: "Em dia", cor: "#15803d" },
  vencido: { rotulo: "Vencido", cor: "#b91c1c" },
  falta: { rotulo: "Faltando", cor: "#ea580c" },
  sem_vinculo: { rotulo: "Sem vínculo ao catálogo", cor: "#64748b" },
}

function Selo({ status }: { status: StatusTreino }) {
  const s = STATUS[status]
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
      style={{ backgroundColor: s.cor }}
    >
      {s.rotulo}
    </span>
  )
}

export default async function MatrizPage() {
  await requirePermissao("pessoal_gestao")
  const linhas = await matrizTreinamento()

  const totalPendentes = linhas.reduce((s, l) => s + l.pendentes, 0)

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
          Matriz de treinamento
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Treinamentos exigidos por funcionário (a partir das medidas das tarefas
          que ele executa) e o status de cada um.{" "}
          {totalPendentes > 0
            ? `${totalPendentes} pendência${totalPendentes === 1 ? "" : "s"}.`
            : "Tudo em dia."}
        </p>
      </div>

      {linhas.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-muted-foreground flex flex-col items-center gap-2 text-center">
              <GraduationCap className="size-6" />
              <p className="text-sm">
                Nenhuma exigência de treinamento ainda. Vincule treinamentos (e
                seu catálogo) nas medidas das tarefas e atribua executores.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {linhas.map((l) => (
            <Card key={l.funcionarioId}>
              <CardHeader>
                <CardTitle className="text-base">
                  {l.nome ?? "(sem nome)"}
                </CardTitle>
                <CardDescription>
                  {l.funcaoNome ? `${l.funcaoNome} · ` : ""}
                  {l.itens.length} treinamento{l.itens.length === 1 ? "" : "s"}{" "}
                  exigido{l.itens.length === 1 ? "" : "s"}
                  {l.pendentes > 0 ? ` · ${l.pendentes} pendente(s)` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y rounded-lg border">
                  {l.itens.map((i) => (
                    <li
                      key={i.chave}
                      className="flex flex-wrap items-center gap-2 px-3 py-2"
                    >
                      <span className="flex-1 text-sm">
                        {i.descricao}
                        <span className="text-muted-foreground text-xs">
                          {" "}
                          · {i.atividades.join(", ")}
                        </span>
                        {i.validoAte && (
                          <span className="text-muted-foreground text-xs">
                            {" "}
                            · válido até {i.validoAte}
                          </span>
                        )}
                      </span>
                      <Selo status={i.status} />
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        Para o status refletir o que a pessoa já fez, o treinamento da medida
        precisa estar <strong>vinculado ao catálogo</strong> (Pessoal →
        Treinamentos). Itens sem vínculo aparecem como “sem vínculo ao catálogo”.
      </p>
    </>
  )
}
