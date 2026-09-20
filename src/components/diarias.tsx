import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import type { SituacaoDiaria } from "@/lib/db/diarias"
import { formatarMoeda } from "@/lib/formato"

/** Badge de situação da solicitação de diária (gestão e funcionário). */
export function SituacaoDiariaBadge({
  situacao,
}: {
  situacao: SituacaoDiaria
}) {
  if (situacao === "aprovada") {
    return (
      <Badge variant="outline" className="border-success/40 text-success-fg">
        Aprovada
      </Badge>
    )
  }
  if (situacao === "aguardando") {
    return (
      <Badge variant="outline" className="border-warning/40 text-warning-fg">
        Aguardando
      </Badge>
    )
  }
  if (situacao === "reprovada") {
    return (
      <Badge
        variant="outline"
        className="border-destructive/40 text-destructive"
      >
        Reprovada
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Cancelada
    </Badge>
  )
}

/**
 * Grandes números das diárias — os mesmos nas duas portas (Pessoal e
 * Diretoria). "No ano" é o ano corrente pela data de início da atividade
 * (ou, sem ela, pela data da solicitação).
 */
export function GrandesNumerosDiarias({
  solicitacoes,
  aoLado,
}: {
  solicitacoes: {
    situacao: SituacaoDiaria
    valor_total: number | null
    valorDespesas: number
    data_inicio: string | null
    created_at: string | null
  }[]
  /** Conteúdo extra na faixa (ex.: gasto por departamento). */
  aoLado?: React.ReactNode
}) {
  const ano = new Date().getFullYear()
  const doAno = solicitacoes.filter((s) => {
    const referencia = s.data_inicio ?? s.created_at
    return referencia ? Number(referencia.slice(0, 4)) === ano : false
  })
  const aguardando = solicitacoes.filter((s) => s.situacao === "aguardando")
  const aprovadasAno = doAno.filter((s) => s.situacao === "aprovada")
  const soma = (lista: typeof solicitacoes, comDespesas: boolean) =>
    lista.reduce(
      (t, s) => t + (s.valor_total ?? 0) + (comDespesas ? s.valorDespesas : 0),
      0
    )

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <NumeroDiaria
        rotulo="Aguardando avaliação"
        valor={aguardando.length.toLocaleString("pt-BR")}
        detalhe={formatarMoeda(soma(aguardando, true))}
      />
      <NumeroDiaria
        rotulo={`Aprovadas em ${ano}`}
        valor={aprovadasAno.length.toLocaleString("pt-BR")}
        detalhe={`de ${doAno.length.toLocaleString("pt-BR")} solicitada(s)`}
      />
      <NumeroDiaria
        rotulo={`Diárias aprovadas em ${ano}`}
        valor={formatarMoeda(soma(aprovadasAno, false))}
        detalhe="sem as despesas extras"
      />
      <NumeroDiaria
        rotulo={`Despesas extras em ${ano}`}
        valor={formatarMoeda(
          aprovadasAno.reduce((t, s) => t + s.valorDespesas, 0)
        )}
        detalhe="hospedagem, alimentação, passagem"
      />
      {aoLado}
    </div>
  )
}

function NumeroDiaria({
  rotulo,
  valor,
  detalhe,
}: {
  rotulo: string
  valor: string
  detalhe?: string
}) {
  return (
    <Card>
      <CardContent>
        <p className="text-muted-foreground text-xs">{rotulo}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{valor}</p>
        {detalhe && <p className="text-muted-foreground mt-1 text-xs">{detalhe}</p>}
      </CardContent>
    </Card>
  )
}
