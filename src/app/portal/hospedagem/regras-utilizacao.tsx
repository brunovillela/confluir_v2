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
  "Ter no máximo um cupom aguardando reserva para o mesmo hotel e a mesma data.",
  "Quarto coletivo só reúne hóspedes do mesmo sexo que aceitaram dividir o quarto.",
  "Retirar o cupom não garante a reserva: quem confirma é o hotel.",
]

export function RegrasUtilizacao({
  configuradas,
  observacao,
}: {
  configuradas: string[]
  observacao: string | null
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
        <div className="grid gap-1.5">
          <p className="font-medium">
            {configuradas.length > 0 ? "Para todos" : "Regras"}
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
