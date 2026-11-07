import { expect, test } from "playwright/test"

import { tipoPelaJustificativa } from "../../src/lib/reembolsos-tipos"

test.describe("tipo do reembolso pela justificativa", () => {
  test("greve, cobrança indevida e despesa em atividade, como no histórico", () => {
    expect(tipoPelaJustificativa("25% do desconto salarial da greve de março")).toBe("desconto_greve")
    expect(tipoPelaJustificativa("Mensalidade cobrada em duplicidade")).toBe("cobranca_indevida")
    expect(tipoPelaJustificativa("Diária, para participação no CONFUP DNS 032/2026")).toBe("despesa_atividade")
  })

  test("assistência pelo serviço social", () => {
    expect(tipoPelaJustificativa("Atendimento pelo Serviço Social e o Médico do Trabalho.")).toBe("assistencia_social")
    expect(tipoPelaJustificativa("Avaliado pelo serviço social - Não consta no confluir.")).toBe("assistencia_social")
  })

  test("equipamento para a entidade, antes de despesa", () => {
    expect(tipoPelaJustificativa("COMPRA DE NOTBOOK PARA O DIRETOR APROVADO PELO COLEGIADO")).toBe("equipamento")
    expect(tipoPelaJustificativa("Reembolso de compra de celular para o diretor")).toBe("equipamento")
    expect(tipoPelaJustificativa("Notebook para uso na reunião do departamento")).toBe("equipamento")
  })

  test("sem pista fica outro", () => {
    expect(tipoPelaJustificativa("22 99833-2207")).toBe("outro")
    expect(tipoPelaJustificativa("")).toBe("outro")
    expect(tipoPelaJustificativa(null)).toBe("outro")
  })
})
