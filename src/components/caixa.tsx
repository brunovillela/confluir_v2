import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { MovimentacaoCaixa, SituacaoConta } from "@/lib/db/caixa"
import { formatarDataHora, formatarMoeda } from "@/lib/formato"
import { cn } from "@/lib/utils"

/** Badge da situação da conta de caixa. */
export function SituacaoContaBadge({
  situacao,
  ativa = true,
}: {
  situacao: SituacaoConta
  ativa?: boolean
}) {
  if (!ativa) {
    return (
      <Badge variant="outline" className="text-destructive border-destructive/40">
        Desativada
      </Badge>
    )
  }
  if (situacao === "aberta") {
    return (
      <Badge
        variant="outline"
        className="border-success/40 text-success-fg"
      >
        Aberta
      </Badge>
    )
  }
  if (situacao === "prestacao_pendente") {
    return (
      <Badge
        variant="outline"
        className="border-warning/40 text-warning-fg"
      >
        Em prestação de contas
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Fechada
    </Badge>
  )
}

const ROTULO_TIPO: Record<string, string> = {
  aporte: "Aporte",
  compra: "Compra",
  perda: "Perda",
  acerto: "Acerto de conta",
}

/** Crédito soma; débitos subtraem (acerto negativo vira crédito). */
function valorAssinado(m: MovimentacaoCaixa): number {
  return m.tipo === "aporte" ? m.valor : -m.valor
}

/** Extrato bancário da conta: data e hora, tipo, descrição e valor. */
export function ExtratoCaixa({ extrato }: { extrato: MovimentacaoCaixa[] }) {
  if (extrato.length === 0) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">
        Nenhuma movimentação ainda.
      </p>
    )
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Data e hora</TableHead>
          <TableHead>Movimentação</TableHead>
          <TableHead className="hidden md:table-cell">Descrição</TableHead>
          <TableHead className="text-right">Valor</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {extrato.map((m) => {
          const assinado = valorAssinado(m)
          const pendente = m.situacao === "pendente"
          const cancelada = m.situacao === "cancelada"
          return (
            <TableRow key={m.id} className={cancelada ? "opacity-50" : ""}>
              <TableCell className="whitespace-nowrap tabular-nums">
                {formatarDataHora(m.created_at)}
              </TableCell>
              <TableCell>
                <span className="flex flex-wrap items-center gap-1.5">
                  {ROTULO_TIPO[m.tipo] ?? m.tipo}
                  {pendente && (
                    <Badge
                      variant="outline"
                      className="border-warning/40 text-warning-fg"
                    >
                      Aguardando confirmação
                    </Badge>
                  )}
                  {cancelada && (
                    <Badge variant="outline" className="text-muted-foreground">
                      Cancelada
                    </Badge>
                  )}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground hidden max-w-72 truncate md:table-cell">
                {m.descricao ?? "—"}
                {m.criadaPor && (
                  <span className="text-xs"> · por {m.criadaPor}</span>
                )}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right whitespace-nowrap tabular-nums",
                  !pendente &&
                    !cancelada &&
                    (assinado >= 0
                      ? "text-success-fg"
                      : "text-destructive")
                )}
              >
                {assinado >= 0 ? "+" : "−"}
                {formatarMoeda(Math.abs(assinado))}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
