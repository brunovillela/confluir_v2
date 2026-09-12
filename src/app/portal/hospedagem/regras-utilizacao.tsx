import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

/**
 * Regras de utilização da hospedagem, para o associado: as que valem para
 * todos (fixas no sistema) e as definidas pelo sindicato em Configurações de
 * filiação (src/lib/db/hospedagem-condicoes.ts).
 */
const REGRAS_GERAIS = [
  "Ter a filiação ativa.",
  "Escolher um hotel conveniado com convênio em vigor. O check-in vai de hoje até o fim da vigência do convênio.",
  "Quarto coletivo só reúne hóspedes do mesmo sexo.",
  "Nos hotéis de pagamento por uso, retirar o cupom não garante a reserva: quem confirma é o hotel. Vale um cupom aguardando reserva por hotel e data.",
]

export function RegrasUtilizacao({
  configuradas,
  observacao,
  porHotel = [],
  naoComparecimento = null,
}: {
  configuradas: string[]
  observacao: string | null
  /** Regras de cada hotel de demanda garantida. */
  porHotel?: { nome: string; regras: string[] }[]
  /** Punição por reserva sem comparecimento, quando ligada. */
  naoComparecimento?: string | null
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Regras de utilização</CardTitle>
        <CardDescription className="text-xs">
          O que vale para solicitar um cupom de hospedagem.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm">
        {configuradas.length > 0 && (
          <div className="grid gap-1.5">
            <p className="font-medium">Definidas pelo sindicato</p>
            <ul className="text-muted-foreground list-disc space-y-1 pl-5">
              {configuradas.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        )}
        {naoComparecimento && (
          <div className="grid gap-1.5">
            <p className="font-medium">Não comparecimento</p>
            <p className="text-muted-foreground">{naoComparecimento}</p>
          </div>
        )}
        {porHotel.map((h) => (
          <div key={h.nome} className="grid gap-1.5">
            <p className="font-medium">{h.nome} · reserva na hora</p>
            <ul className="text-muted-foreground list-disc space-y-1 pl-5">
              {h.regras.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        ))}
        <div className="grid gap-1.5">
          <p className="font-medium">
            {configuradas.length > 0 || porHotel.length > 0 ? "Para todos" : "Regras"}
          </p>
          <ul className="text-muted-foreground list-disc space-y-1 pl-5">
            {REGRAS_GERAIS.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
        {observacao && (
          <p className="text-muted-foreground border-primary border-l-2 pl-3 text-xs whitespace-pre-line">
            {observacao}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
