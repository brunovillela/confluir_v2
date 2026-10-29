import type { RegrasApuracao } from "@/lib/ponto-apuracao"

/** As regras de apuração da entidade, em frases curtas. */
export function ResumoRegras({ regras }: { regras: RegrasApuracao }) {
  const faixa2 = [regras.faixa2Sabado && "sábado", regras.faixa2Domingo && "domingo", regras.faixa2Feriado && "feriado"].filter(
    Boolean
  )
  return (
    <ul className="text-muted-foreground grid gap-1 text-sm">
      <li>
        Saldo do dia = batidas trabalhadas − jornada prevista no cartão; diferença de até{" "}
        <strong className="text-foreground">{regras.toleranciaDiariaMin} min</strong> no dia não conta.
      </li>
      <li>
        Faixa 2: horas a mais em <strong className="text-foreground">{faixa2.length ? faixa2.join(", ") : "nenhum dia"}</strong>; nos
        demais dias, faixa 1.
      </li>
      <li>
        Horas negativas descontam{" "}
        <strong className="text-foreground">
          {regras.negativas === "faixa1" ? "só da faixa 1 (que pode ficar negativa)" : "da faixa 1 até zerar e o resto da faixa 2"}
        </strong>
        .
      </li>
      <li>
        Abonam o dia: <strong className="text-foreground">{regras.ocorrenciasAbonam.join(", ") || "nenhuma ocorrência"}</strong>.
      </li>
      <li>
        Mês sem nenhuma batida:{" "}
        <strong className="text-foreground">{regras.mesSemBatidas === "alertar" ? "só alerta, não é lançado" : "é lançado"}</strong>.
      </li>
    </ul>
  )
}
