import Link from "next/link"
import { Plus } from "lucide-react"

import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { hojeSP } from "@/lib/db/comum"
import { competenciasComAcerto, configAcerto, type listarAcertos } from "@/lib/db/ponto-acertos"
import type { FaixasHE } from "@/lib/faixas-he"
import { hhmm } from "@/lib/horas"
import { acertosRecorrentesPendentes, motivoAcerto, ROTULO_ALCANCE, ROTULO_FAIXAS_ACERTO, rotuloMesAcerto } from "@/lib/ponto-acertos"

import { ConfigAcertoForm } from "./forms"

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]

/**
 * Aba "Acertos do banco" do Controle de ponto (27/11/2026): os marcos de
 * acerto lançados, o lembrete do acerto recorrente e a configuração dele.
 */
export async function AbaAcertos({
  sp,
  lista,
  faixas,
}: {
  sp: Record<string, string | undefined>
  lista: Awaited<ReturnType<typeof listarAcertos>>
  faixas: FaixasHE
}) {
  const [config, lancados] = await Promise.all([configAcerto(), competenciasComAcerto()])
  const pendentes = acertosRecorrentesPendentes(config.meses, lancados, hojeSP())
  const rotulos = { f1: faixas["70"], f2: faixas["100"] }

  if (!lista.disponivel) {
    return (
      <Alert>
        <AlertDescription>Os acertos do banco de horas ainda não estão ligados nesta entidade (falta aplicar a atualização do banco de dados).</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="grid gap-4">
      {sp.desfeito === "1" && (
        <Alert variant="success">
          <AlertDescription>Acerto desfeito. As remessas seguintes foram recalculadas.</AlertDescription>
        </Alert>
      )}
      {pendentes.map((c) => (
        <Alert key={c} variant="warning">
          <AlertDescription>
            Acerto recorrente de {rotuloMesAcerto(c)} ainda não lançado.{" "}
            <Link href={`/painel/pessoal/ponto/acertos/novo?competencia=${c}`} className="underline">
              Lançar agora
            </Link>
          </AlertDescription>
        </Alert>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          Meses em que o banco de horas foi zerado, de uma pessoa, de algumas ou de todas. A remessa seguinte começa do zero.
        </p>
        <Button asChild>
          <Link href="/painel/pessoal/ponto/acertos/novo">
            <Plus />
            Novo acerto
          </Link>
        </Button>
      </div>

      {lista.acertos.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhum acerto lançado.</p>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground text-left text-xs">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">Mês</th>
                  <th className="py-1.5 pr-3 font-medium">Alcance</th>
                  <th className="py-1.5 pr-3 font-medium">Motivo</th>
                  <th className="py-1.5 pr-3 font-medium">Zera</th>
                  <th className="py-1.5 pr-3 text-right font-medium">A favor</th>
                  <th className="py-1.5 text-right font-medium">A descontar</th>
                </tr>
              </thead>
              <tbody>
                {lista.acertos.map((a) => (
                  <tr key={a.id} className="border-t">
                    <td className="py-1.5 pr-3">
                      <Link href={`/painel/pessoal/ponto/acertos/${a.id}`} className="font-medium hover:underline">
                        {MESES[Number(a.competencia.slice(5, 7)) - 1]}/{a.competencia.slice(0, 4)}
                      </Link>
                    </td>
                    <td className="py-1.5 pr-3">
                      {ROTULO_ALCANCE[a.alcance]} · {a.pessoas} pessoa(s)
                    </td>
                    <td className="py-1.5 pr-3">{motivoAcerto(a.motivo)?.rotulo}</td>
                    <td className="py-1.5 pr-3">{ROTULO_FAIXAS_ACERTO[a.faixas]}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{hhmm(a.positivo)}</td>
                    <td className="py-1.5 text-right tabular-nums">{a.negativo < 0 ? hhmm(-a.negativo) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <GrupoColapsavel
        titulo="Acerto recorrente"
        descricao="Se o acordo coletivo fixa meses de zeramento do banco, marque-os: a caixa de entrada lembra de lançar."
        resumo={
          <span className="text-muted-foreground text-sm">
            {config.meses.length ? config.meses.map((m) => MESES[m - 1]).join(", ") : "nenhum"}
          </span>
        }
        aberto={sp.recorrente === "1"}
      >
        <ConfigAcertoForm meses={config.meses} faixas={config.faixas} motivo={config.motivo} rotulos={rotulos} />
      </GrupoColapsavel>
    </div>
  )
}
