import Link from "next/link"
import { CircleAlert, CircleCheck } from "lucide-react"

import { relatorioFonteRemessa, type RelatorioFonte } from "@/lib/db/receitas"
import { cn } from "@/lib/utils"

/**
 * Conferência do conteúdo da relação lançada (15/11/2026): quem é filiado
 * ativo com vínculo na empresa e não veio, quem foi descontado sem ser
 * encontrado no cadastro e quem foi descontado sem estar Ativo. É o mesmo
 * relatório da fonte em Receitas, resumido aqui; no grupo centralizado, soma
 * as empresas do grupo.
 */
export async function ConferenciaRelacao({
  remessaId,
  fontes,
  hrefReceitas,
  alerta,
}: {
  remessaId: string
  fontes: string[]
  hrefReceitas: string
  alerta: string | null
}) {
  let relatorios: RelatorioFonte[]
  try {
    relatorios = await Promise.all(fontes.map((f) => relatorioFonteRemessa(remessaId, f)))
  } catch {
    return <p className="text-muted-foreground text-sm">Não foi possível conferir a relação agora. Abra em Receitas.</p>
  }
  const ativosFora = relatorios.flatMap((r) => r.ativosNaoPagantes)
  const naoEncontrados = relatorios.flatMap((r) => r.naoEncontrados)
  const naoAtivos = relatorios.flatMap((r) => r.pagantesNaoAtivos)
  const itens = [
    {
      rotulo: "Filiados ativos que não vieram na relação",
      n: ativosFora.length,
      nomes: ativosFora.map((a) => a.nome ?? "(sem nome)"),
      explicacao: "Com vínculo em aberto na empresa e condição Ativo: confirme com o RH se o desconto foi feito.",
    },
    {
      rotulo: "Descontados não encontrados no cadastro",
      n: naoEncontrados.length,
      nomes: naoEncontrados.map((a) => a.nome ?? a.cpf ?? a.matriculaFonte ?? "(sem identificação)"),
      explicacao: "Podem ser filiações que ainda não estão no Confluir, ou CPF/matrícula diferentes do cadastro.",
    },
    {
      rotulo: "Descontados que não estão como Ativo",
      n: naoAtivos.length,
      nomes: naoAtivos.map((a) => `${a.nome ?? "(sem nome)"}${a.condicao ? ` (${a.condicao})` : ""}`),
      explicacao: "Desfiliados que continuam com desconto, ou cadastros a atualizar.",
    },
  ]
  const tudoCerto = itens.every((i) => i.n === 0) && !alerta

  return (
    <div className="grid gap-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Conferência da relação</p>
        <Link href={hrefReceitas} className="text-primary text-xs font-medium hover:underline">
          Ver as listas em Receitas
        </Link>
      </div>
      {alerta && (
        <p className="text-warning-fg flex items-center gap-1.5 text-sm">
          <CircleAlert className="size-4 shrink-0" />
          {alerta}.
        </p>
      )}
      {tudoCerto ? (
        <p className="text-success-fg flex items-center gap-1.5 text-sm">
          <CircleCheck className="size-4" />
          Todos os filiados ativos da empresa vieram, e todos os descontados são filiados ativos.
        </p>
      ) : (
        <ul className="grid gap-1.5">
          {itens.map((i) => (
            <li key={i.rotulo} className="text-sm">
              <details>
                <summary className={cn("cursor-pointer", i.n > 0 ? "text-warning-fg" : "text-muted-foreground")}>
                  <span className="font-medium tabular-nums">{i.n}</span> {i.rotulo.toLowerCase()}
                </summary>
                {i.n > 0 && (
                  <div className="mt-1 ml-4 grid gap-1">
                    <p className="text-muted-foreground text-xs">{i.explicacao}</p>
                    <p className="text-xs">
                      {i.nomes.slice(0, 15).join(" · ")}
                      {i.n > 15 && ` · e mais ${i.n - 15}`}
                    </p>
                  </div>
                )}
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
