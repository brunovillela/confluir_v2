import Link from "next/link"
import { IdCard } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { usoCarreira } from "@/lib/db/carreira-area"
import { formatarData } from "@/lib/formato"
import { areasDoFuncionario, type AreaFuncionario } from "@/lib/pessoal-area"
import type { Permissoes } from "@/lib/permissoes"

/**
 * Cabeçalho do nível 2 (o funcionário numa área): quem é a pessoa e os
 * atalhos para as outras áreas dela — troca de assunto sem perder a pessoa.
 */
export async function CabecalhoFuncionario({
  funcionario,
  area,
  permissoes,
  titulo,
}: {
  funcionario: {
    usuarioId: string
    nome: string
    matricula: string | null
    cargo: string | null
    departamento: string | null
    ativo: boolean
    admissao?: string | null
    demissao?: string | null
  }
  area: AreaFuncionario
  permissoes: Permissoes | null
  /** Sobrescreve o título (padrão: o nome). */
  titulo?: string
}) {
  const f = funcionario
  // Multitenant: a Carreira só aparece para quem usa anuênio ou níveis salariais.
  const uso = await usoCarreira()
  const areas = areasDoFuncionario(permissoes).filter((a) => a.chave !== "carreira" || uso.anuenios || uso.niveis)
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{titulo ?? f.nome}</h1>
            {!f.ativo && (
              <Badge variant="outline" className="text-muted-foreground">
                Desligado{f.demissao ? ` em ${formatarData(f.demissao)}` : ""}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            {[
              f.matricula && `Matrícula ${f.matricula}`,
              f.cargo,
              f.departamento,
              f.admissao && `admissão ${formatarData(f.admissao)}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/painel/pessoal/${f.usuarioId}`}>
            <IdCard />
            Ficha completa
          </Link>
        </Button>
      </div>
      {areas.length > 1 && (
        <nav className="flex flex-wrap gap-1.5 text-xs" aria-label="Áreas do funcionário">
          {areas.map((a) => (
            <Link
              key={a.chave}
              href={a.href(f.usuarioId)}
              aria-current={a.chave === area ? "page" : undefined}
              className={`rounded-full border px-3 py-1 ${
                a.chave === area ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted"
              }`}
            >
              {a.rotulo}
            </Link>
          ))}
        </nav>
      )}
    </div>
  )
}
