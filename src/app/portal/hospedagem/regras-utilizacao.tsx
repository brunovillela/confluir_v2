import { GrupoColapsavel } from "@/components/grupo-colapsavel"

/**
 * Regras de utilização da hospedagem, para o associado: as que valem para
 * todos (fixas no sistema), as definidas pelo sindicato em Configurações de
 * filiação (src/lib/db/hospedagem-condicoes.ts), as de cada hotel de reserva
 * na hora e o valor de cada hotel.
 *
 * Fica no FIM da página e RECOLHIDA (achado A37): o associado não precisa
 * atravessar a parede de regras para chegar ao pedido. O que é preciso ler
 * antes de agir já está no formulário — o aviso do sindicato, a regra de
 * falta perto do "Reservar" e o valor do hotel escolhido — com o link "Ver
 * todas as regras", que abre esta seção (id `regras-hospedagem`).
 */
const REGRAS_GERAIS = [
  "Ter a filiação ativa.",
  "Escolher um hotel conveniado com convênio em vigor. O check-in vai de hoje até o fim da vigência do convênio.",
  "Quarto coletivo só reúne hóspedes do mesmo sexo.",
  "Nos hotéis de pagamento por uso, retirar o cupom não garante a reserva: quem confirma é o hotel. Vale um cupom aguardando reserva por hotel e data.",
]

export function RegrasUtilizacao({
  configuradas,
  porHotel = [],
  naoComparecimento = null,
  valores = [],
}: {
  configuradas: string[]
  /** Regras de cada hotel de demanda garantida. */
  porHotel?: { nome: string; regras: string[] }[]
  /** Punição por reserva sem comparecimento, quando ligada. */
  naoComparecimento?: string | null
  /** Parte do associado em cada hotel (null = sem tarifa cadastrada). */
  valores?: { nome: string; linha: string | null }[]
}) {
  return (
    <section id="regras-hospedagem" aria-label="Regras de utilização" className="scroll-mt-20">
      <GrupoColapsavel
        titulo="Regras de utilização"
        descricao="O que vale para pedir hospedagem: regras do sindicato, de cada hotel e para todos."
      >
        <div className="grid gap-4 text-sm">
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
          {valores.length > 0 && (
            <div className="grid gap-1.5">
              <p className="font-medium">Sua parte em cada hotel</p>
              <ul className="text-muted-foreground list-disc space-y-1 pl-5">
                {valores.map((v) => (
                  <li key={v.nome}>
                    <span className="text-foreground">{v.nome}</span> —{" "}
                    {v.linha ?? "valor: confirme com o sindicato"}
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground text-xs">
                Paga no hotel, na entrada. Vale a tarifa da quantidade de pessoas que
                ficarem no quarto, conforme a reserva confirmada pelo hotel. Os valores já
                incluem os impostos.
              </p>
            </div>
          )}
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
        </div>
      </GrupoColapsavel>
    </section>
  )
}
