import Link from "next/link"
import { Car, Pencil } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { SituacaoAgendamentoBadge } from "@/components/veiculos"
import { listarAgendamentos, type Condutor } from "@/lib/db/veiculos"
import { formatarData } from "@/lib/formato"

import { CancelarAgendamentoForm } from "./veiculos/agendamentos/agendamento-forms"

/**
 * Painel inicial, coluna da esquerda: as solicitações de veículo EM ABERTO do
 * condutor, com editar (na página de solicitação) e cancelar. A nova
 * solicitação é o botão do topo do painel → /painel/solicitar-veiculo. Quem
 * não é condutor não vê o bloco; sem nada em aberto, ele também some.
 */
export async function MeusVeiculos({
  usuarioId,
  condutor,
}: {
  usuarioId: string
  condutor: Condutor | null
}) {
  if (!condutor) return null

  const meus = await listarAgendamentos({
    condutorId: usuarioId,
    situacoes: ["solicitada", "atendida", "retirada"],
    limite: 30,
  })
  const abertas = meus.agendamentos
  if (abertas.length === 0) return null

  return (
    <Card id="meus-veiculos">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Minhas solicitações de veículo</CardTitle>
            <CardDescription>Em aberto</CardDescription>
          </div>
          <Car className="text-muted-foreground size-4" />
        </div>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-3">
          {abertas.map((a) => (
            <li key={a.id} className="grid gap-1.5 rounded-md border p-2.5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="font-medium">
                  {formatarData(a.data_retirada)}
                  {a.data_retorno ? ` a ${formatarData(a.data_retorno)}` : ""}
                </span>
                <SituacaoAgendamentoBadge situacao={a.situacao} />
              </div>
              <p className="text-muted-foreground text-xs">
                {[
                  a.motivo,
                  a.destino && `destino: ${a.destino}`,
                  a.sede_retirada && `retirada em ${a.sede_retirada}`,
                  a.veiculoPlaca && `veículo: ${a.veiculoPlaca} ${a.veiculoModelo ?? ""}`.trim(),
                ]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </p>
              {(a.situacao === "solicitada" || a.situacao === "atendida") && (
                <div className="flex flex-wrap items-start justify-between gap-1">
                  <Button variant="ghost" size="sm" asChild className="-ml-2">
                    <Link href={`/painel/solicitar-veiculo?editar=${a.id}`}>
                      <Pencil />
                      Editar
                    </Link>
                  </Button>
                  <CancelarAgendamentoForm agendamentoId={a.id} />
                </div>
              )}
              {a.situacao === "retirada" && (
                <p className="text-muted-foreground text-xs">
                  Veículo com você — a entrada é registrada pela recepção na devolução.
                </p>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
