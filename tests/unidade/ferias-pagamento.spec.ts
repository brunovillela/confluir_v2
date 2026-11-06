import { expect, test } from "playwright/test"

import { dataPagamentoFerias, frasePagamento, pagamentoDoAviso, prazoPagamento } from "@/lib/ferias-pagamento"

test.describe("prazo de pagamento das férias", () => {
  test("dias úteis pulam fim de semana e feriado nacional", () => {
    // Segunda 04/01/2027: 03 domingo, 02 sábado, 01 feriado → 31/12 e 30/12.
    expect(dataPagamentoFerias("2027-01-04", 2, true)).toBe("2026-12-30")
    // Quarta 10/03/2027: 09 e 08 são úteis.
    expect(dataPagamentoFerias("2027-03-10", 2, true)).toBe("2027-03-08")
    // Segunda 09/11/2026: sexta 06 e quinta 05.
    expect(dataPagamentoFerias("2026-11-09", 2, true)).toBe("2026-11-05")
  })

  test("dias corridos só subtraem", () => {
    expect(dataPagamentoFerias("2027-01-04", 2, false)).toBe("2027-01-02")
    expect(dataPagamentoFerias("2027-01-04", 0, true)).toBe("2027-01-04")
  })

  test("sem prazo informado não há pagamento no aviso", () => {
    expect(pagamentoDoAviso("2027-01-04", { dias: null, uteis: true, descricao: "x", fundamento: null })).toBeNull()
  })

  test("frase do aviso usa só a regra da entidade", () => {
    const p = pagamentoDoAviso("2027-01-04", {
      dias: 2,
      uteis: true,
      descricao: "Gratificação de férias de 100% da remuneração",
      fundamento: "Cláusula 3ª do ACT",
    })!
    const frase = frasePagamento(p, false)
    expect(frase).toBe(
      "O pagamento das férias (gratificação de férias de 100% da remuneração) será feito até 30/12/2026, 2 dias úteis antes do início do gozo, conforme cláusula 3ª do ACT."
    )
    expect(frase).not.toMatch(/CLT|art\.|terço/)
    expect(frasePagamento({ ...p, descricao: null, fundamento: null }, true)).toBe(
      "O pagamento das férias e do abono pecuniário será feito até 30/12/2026, 2 dias úteis antes do início do gozo."
    )
    expect(prazoPagamento(1, true)).toBe("1 dia útil")
  })
})
