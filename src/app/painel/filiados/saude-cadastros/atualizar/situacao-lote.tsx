import { Badge } from "@/components/ui/badge"
import type { Lote } from "@/lib/db/filiacao-atualizacao-lista"

export function SituacaoLote({ situacao }: { situacao: Lote["situacao"] }) {
  if (situacao === "aplicado") return <Badge variant="success">Aplicado</Badge>
  if (situacao === "desfeito") return <Badge variant="outline">Desfeito</Badge>
  if (situacao === "lendo") return <Badge variant="outline">Lendo…</Badge>
  if (situacao === "erro") return <Badge variant="destructive">Falhou</Badge>
  return <Badge variant="warning">Prévia</Badge>
}
