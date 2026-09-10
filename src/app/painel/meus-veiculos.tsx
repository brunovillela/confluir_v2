import { Car } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { SituacaoAgendamentoBadge } from "@/components/veiculos"
import { nomesDasSedes } from "@/lib/db/organizacao"
import {
  buscarCondutorDoUsuario,
  listarAgendamentos,
} from "@/lib/db/veiculos"
import { formatarData } from "@/lib/formato"

import {
  CancelarAgendamentoForm,
  EditarAgendamentoForm,
  SolicitarVeiculoForm,
} from "./veiculos/agendamentos/agendamento-forms"

/**
 * Painel inicial: todo CONDUTOR solicita veículo aqui e acompanha as
 * solicitações em aberto (editar, cancelar) — sem precisar de permissão ao
 * módulo Veículos. Quem não é condutor não vê o bloco.
 */
export async function MeusVeiculos({ usuarioId }: { usuarioId: string }) {
  const condutor = await buscarCondutorDoUsuario(usuarioId)
  if (!condutor) return null

  const [meus, sedes] = await Promise.all([
    listarAgendamentos({ condutorId: usuarioId, limite: 30 }),
    nomesDasSedes(),
  ])
  const abertas = meus.agendamentos.filter(
    (a) =>
      a.situacao === "solicitada" ||
      a.situacao === "atendida" ||
      a.situacao === "retirada"
  )

  return (
    <Card id="meus-veiculos">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Veículos</CardTitle>
            <CardDescription>
              Solicite um veículo e acompanhe suas solicitações em aberto
            </CardDescription>
          </div>
          <Car className="text-muted-foreground size-4" />
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        {abertas.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nenhuma solicitação em aberto.
          </p>
        ) : (
          <ul className="grid gap-3">
            {abertas.map((a) => (
              <li key={a.id} className="grid gap-2 rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {formatarData(a.data_retirada)}
                    {a.data_retorno ? ` a ${formatarData(a.data_retorno)}` : ""}
                    {a.sede_retirada ? ` · ${a.sede_retirada}` : ""}
                  </span>
                  <SituacaoAgendamentoBadge situacao={a.situacao} />
                </div>
                <p className="text-muted-foreground">
                  {a.motivo ?? "—"}
                  {a.destino ? ` · destino: ${a.destino}` : ""}
                  {a.veiculoPlaca
                    ? ` · veículo: ${a.veiculoPlaca} ${a.veiculoModelo ?? ""}`
                    : ""}
                </p>
                {(a.situacao === "solicitada" || a.situacao === "atendida") && (
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <EditarAgendamentoForm
                      agendamentoId={a.id}
                      sedes={sedes}
                      valores={{
                        motivo: a.motivo,
                        destino: a.destino,
                        data_retirada: a.data_retirada,
                        data_retorno: a.data_retorno,
                        sede_retirada: a.sede_retirada,
                      }}
                    />
                    <CancelarAgendamentoForm agendamentoId={a.id} />
                  </div>
                )}
                {a.situacao === "retirada" && (
                  <p className="text-muted-foreground text-xs">
                    Veículo com você — a entrada é registrada pela recepção na
                    devolução.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        {condutor.apto ? (
          <GrupoColapsavel
            titulo="Solicitar veículo"
            descricao="Motivo, destino, datas e sede de retirada"
          >
            <SolicitarVeiculoForm sedes={sedes} voltar="/painel" />
          </GrupoColapsavel>
        ) : (
          <Alert variant="info">
            <AlertDescription>
              {condutor.cnhVencida
                ? "Sua CNH está vencida — atualize o cadastro com a gestão da frota para voltar a solicitar veículos."
                : "Seu cadastro de condutor ainda não está autorizado a dirigir os veículos do sindicato."}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
