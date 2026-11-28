import Link from "next/link"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { FaixasHE } from "@/lib/faixas-he"
import { hhmm } from "@/lib/horas"
import { destinoDoZerado, motivoAcerto, rotuloMesAcerto, type FaixasAcerto, type MotivoAcerto } from "@/lib/ponto-acertos"

export type AcertoDoFuncionario = {
  id: string
  competencia: string
  faixas: FaixasAcerto
  motivo: MotivoAcerto
  observacao: string | null
  saldo70: number | null
  saldo100: number | null
}

/**
 * Os acertos do banco de horas de uma pessoa (27/11/2026): em que mês o banco
 * foi zerado, quanto, por quê e o que foi à folha. Na página do funcionário
 * (com link ao acerto) e no Meu perfil → Ponto (sem link).
 */
export function AcertosBancoCard({ acertos, faixas, comLink }: { acertos: AcertoDoFuncionario[]; faixas: FaixasHE; comLink?: boolean }) {
  if (!acertos.length) return null
  const parte = (v: number | null, rotulo: string, motivo: MotivoAcerto) => {
    if (v === null || v === 0) return null
    const destino = destinoDoZerado(v, motivo)
    return `${hhmm(Math.abs(v))} ${v < 0 ? "negativas" : ""} a ${rotulo}${destino === "pagar" ? " (pagas em folha)" : destino === "descontar" ? " (descontadas em folha)" : ""}`
      .replace(/\s+/g, " ")
      .trim()
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Acertos do banco de horas</CardTitle>
        <CardDescription>Meses em que o saldo do banco foi zerado: a remessa seguinte começou do zero.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2 text-sm">
          {acertos.map((a) => {
            const partes = [parte(a.saldo70, faixas["70"], a.motivo), parte(a.saldo100, faixas["100"], a.motivo)].filter(Boolean)
            return (
              <li key={a.id} className="border-b pb-2 last:border-0 last:pb-0">
                <span className="font-medium">
                  {comLink ? (
                    <Link href={`/painel/pessoal/ponto/acertos/${a.id}`} className="hover:underline">
                      Acerto de {rotuloMesAcerto(a.competencia)}
                    </Link>
                  ) : (
                    <>Acerto de {rotuloMesAcerto(a.competencia)}</>
                  )}
                </span>
                <span className="text-muted-foreground"> · {motivoAcerto(a.motivo)?.rotulo}</span>
                <div>{partes.length ? `Zerado: ${partes.join("; ")}.` : "Saldo já estava zerado."}</div>
                {a.observacao && <div className="text-muted-foreground text-xs">{a.observacao}</div>}
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
