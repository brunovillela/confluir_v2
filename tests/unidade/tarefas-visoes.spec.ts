import { expect, test } from "playwright/test"

import { cargaPorPessoa, colunaDaTarefa, deslocarMes, segundaDaSemana, semanasDoMes } from "../../src/lib/nucleo-constantes"

test("coluna do quadro", () => {
  expect(colunaDaTarefa({ concluido: false, emAndamento: false })).toBe("a_fazer")
  expect(colunaDaTarefa({ concluido: false, emAndamento: true })).toBe("em_andamento")
  expect(colunaDaTarefa({ concluido: true, emAndamento: true })).toBe("feito")
})

test("segunda-feira da semana", () => {
  expect(segundaDaSemana("2026-11-19")).toBe("2026-11-16") // quinta
  expect(segundaDaSemana("2026-11-16")).toBe("2026-11-16") // segunda
  expect(segundaDaSemana("2026-11-22")).toBe("2026-11-16") // domingo
})

test("carga por pessoa: atrasadas, esta semana, próxima, sem prazo", () => {
  const t = (id: string | null, prazo: string | null, concluido = false) => ({ demandadoId: id, demandadoNome: id ? id.toUpperCase() : null, concluido, prazo })
  const r = cargaPorPessoa(
    [t("a", "2026-11-18"), t("a", "2026-11-22"), t("a", "2026-11-23"), t("a", null), t("a", "2026-12-30"), t("a", "2026-11-10", true), t("b", "2026-11-20"), t(null, null)],
    "2026-11-19"
  )
  expect(r[0]).toEqual({ id: "a", nome: "A", abertas: 5, atrasadas: 1, estaSemana: 1, proximaSemana: 1, semPrazo: 1 })
  expect(r.map((c) => c.nome)).toEqual(["A", "B", "Sem responsável"])
})

test("semanas do mês cobrem o mês inteiro, de segunda a domingo", () => {
  const s = semanasDoMes("2026-11")
  expect(s[0][0]).toBe("2026-10-26")
  expect(s.at(-1)?.[0]).toBe("2026-11-30") // segunda-feira
  expect(s.at(-1)?.at(-1)).toBe("2026-12-06")
  expect(s.every((w) => w.length === 7)).toBe(true)
  expect(semanasDoMes("2026-02").at(-1)?.at(-1)).toBe("2026-03-01")
})

test("deslocar mês atravessa o ano", () => {
  expect(deslocarMes("2026-12", 1)).toBe("2027-01")
  expect(deslocarMes("2026-01", -1)).toBe("2025-12")
})
