"use client"

import Link from "next/link"
import { useActionState } from "react"
import { Link2, Loader2, Wrench } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

import { vincularManutencaoAction } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-8 max-w-72 min-w-0 flex-1 truncate rounded-md border px-2 text-xs shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

/** Apontamento pronto para a tela (datas e tempo já formatados no servidor). */
export type ApontamentoTela = {
  id: string
  veiculo_id: string
  veiculoRotulo?: string | null
  categoria: string
  descricao: string | null
  situacao: "aberto" | "resolvido"
  /** "aberto há 12 dias" / "ficou 12 dias aberto". */
  tempo: string
  abertoEm: string
  resolvidoEm: string | null
  confirmacoes: number
  ultima_observacao: string | null
  manutencao: { id: string; rotulo: string } | null
}

function VincularManutencao({
  apontamento,
  manutencoes,
}: {
  apontamento: ApontamentoTela
  manutencoes: { id: string; rotulo: string }[]
}) {
  const [estado, formAction, pendente] = useActionState(
    vincularManutencaoAction,
    {},
  )
  const envio = useEnvioFormulario(formAction, estado)
  return (
    <form action={formAction} {...envio} className="grid gap-1">
      <input type="hidden" name="apontamento_id" value={apontamento.id} />
      <div className="flex flex-wrap items-center gap-2">
        <select
          name="manutencao_id"
          defaultValue={apontamento.manutencao?.id ?? ""}
          aria-label="Manutenção vinculada"
          className={SELECT}
        >
          <option value="">
            {apontamento.manutencao
              ? "(desvincular)"
              : "Vincular a uma manutenção…"}
          </option>
          {manutencoes.map((m) => (
            <option key={m.id} value={m.id}>
              {m.rotulo}
            </option>
          ))}
        </select>
        <Button
          type="submit"
          size="sm"
          variant="outline"
          className="h-8"
          disabled={pendente}
        >
          {pendente ? <Loader2 className="animate-spin" /> : <Link2 />}
          Salvar vínculo
        </Button>
        <Link
          href={`/painel/veiculos/manutencoes/nova?veiculo=${apontamento.veiculo_id}&tipo=corretiva&apontamento=${apontamento.id}`}
          className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
        >
          <Wrench className="size-3.5" />
          Registrar corretiva
        </Link>
      </div>
      {estado.erro && <p className="text-destructive text-xs">{estado.erro}</p>}
      {estado.ok && <p className="text-success-fg text-xs">{estado.ok}</p>}
    </form>
  )
}

/**
 * Lista de apontamentos do checklist. Aberto mostra há quanto tempo e quantas
 * vezes foi confirmado; o vínculo com a manutenção não o encerra — só um
 * checklist que o declare sanado.
 */
export function ListaApontamentos({
  apontamentos,
  manutencoesPorVeiculo,
  podeVincular,
  mostrarVeiculo = false,
}: {
  apontamentos: ApontamentoTela[]
  manutencoesPorVeiculo?: Record<string, { id: string; rotulo: string }[]>
  podeVincular: boolean
  mostrarVeiculo?: boolean
}) {
  if (apontamentos.length === 0) {
    return <p className="text-muted-foreground text-sm">Nenhum apontamento.</p>
  }
  return (
    <ul className="grid gap-3">
      {apontamentos.map((a) => (
        <li
          key={a.id}
          className={`grid gap-1.5 rounded-md border p-3 text-sm ${
            a.situacao === "aberto" ? "border-warning/40" : "opacity-80"
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            {a.situacao === "aberto" ? (
              <Badge
                variant="outline"
                className="border-warning/40 text-warning-fg"
              >
                Em aberto
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-success/40 text-success-fg"
              >
                Sanado
              </Badge>
            )}
            <span className="font-medium">{a.categoria}</span>
            {mostrarVeiculo && a.veiculoRotulo && (
              <Link
                href={`/painel/veiculos/${a.veiculo_id}`}
                className="text-primary text-xs hover:underline"
              >
                {a.veiculoRotulo}
              </Link>
            )}
            <span className="text-muted-foreground text-xs">
              {a.tempo} · desde {a.abertoEm}
              {a.confirmacoes > 0
                ? ` · confirmado ${a.confirmacoes} vez${a.confirmacoes === 1 ? "" : "es"}`
                : ""}
              {a.resolvidoEm ? ` · sanado em ${a.resolvidoEm}` : ""}
            </span>
          </div>
          {a.descricao && <p>{a.descricao}</p>}
          {a.ultima_observacao && a.ultima_observacao !== a.descricao && (
            <p className="text-muted-foreground text-xs">
              Última verificação: {a.ultima_observacao}
            </p>
          )}
          {a.situacao === "aberto" && podeVincular ? (
            <VincularManutencao
              apontamento={a}
              manutencoes={manutencoesPorVeiculo?.[a.veiculo_id] ?? []}
            />
          ) : a.manutencao ? (
            <p className="text-muted-foreground text-xs">
              Manutenção vinculada:{" "}
              <Link
                href={`/painel/veiculos/manutencoes/${a.manutencao.id}`}
                className="text-primary hover:underline"
              >
                {a.manutencao.rotulo}
              </Link>
            </p>
          ) : null}
          {a.situacao === "aberto" && a.manutencao && (
            <p className="text-xs">
              Manutenção feita? O apontamento se encerra quando o próximo
              checklist o der como sanado.
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}
