import { expect, test } from "playwright/test"

import {
  competenciaAplica,
  dentroDoPeriodo,
  diasDeAtraso,
  janelaCompetencias,
  lerMeses,
  prazoDaCompetencia,
  regraEfetiva,
  situacaoEnvio,
  somarMeses,
  type DadosCelula,
} from "@/lib/repasse"

test.describe("competências", () => {
  test("somar meses atravessa o ano", () => {
    expect(somarMeses(202612, 1)).toBe(202701)
    expect(somarMeses(202601, -1)).toBe(202512)
    expect(somarMeses(202610, -12)).toBe(202510)
  })

  test("janela termina na competência pedida, da mais antiga para a mais nova", () => {
    expect(janelaCompetencias(202603, 4)).toEqual([202512, 202601, 202602, 202603])
  })

  test("prazo é no mês seguinte e respeita o fim do mês", () => {
    expect(prazoDaCompetencia(202610, 10)).toBe("2026-11-10")
    expect(prazoDaCompetencia(202612, 5)).toBe("2027-01-05")
    expect(prazoDaCompetencia(202601, 31)).toBe("2026-02-28")
    expect(prazoDaCompetencia(202701, 31)).toBe("2027-02-28")
    expect(prazoDaCompetencia(202801, 30)).toBe("2028-02-29")
  })

  test("dias de atraso", () => {
    expect(diasDeAtraso("2026-11-15", "2026-11-10")).toBe(5)
    expect(diasDeAtraso("2026-11-10", "2026-11-10")).toBe(0)
    expect(diasDeAtraso("2026-11-01", "2026-11-10")).toBe(0)
  })

  test("meses aceitam número e nome", () => {
    expect(lerMeses("3")).toEqual([3])
    expect(lerMeses("mar, set")).toEqual([3, 9])
    expect(lerMeses("9 3 3")).toEqual([3, 9])
    expect(lerMeses("")).toBeNull()
    expect(lerMeses("13")).toHaveProperty("erro")
  })
})

test.describe("regra efetiva", () => {
  test("sem nada configurado: associativa controlada, sindical em março desligada", () => {
    const a = regraEfetiva("Associativa", null)
    expect(a).toMatchObject({ controla: true, diaEnvio: 10, excecao: false })
    const s = regraEfetiva("Sindical", null)
    expect(s).toMatchObject({ controla: false, meses: [3] })
  })

  test("exceção da empresa herda o que deixar em branco", () => {
    const geral = { controla: true, meses: null, diaEnvio: 10, diaDeposito: 15 }
    const r = regraEfetiva("Associativa", geral, { controla: null, meses: null, diaEnvio: 20, diaDeposito: null })
    expect(r).toMatchObject({ controla: true, diaEnvio: 20, diaDeposito: 15, excecao: true })
  })

  test("empresa que não desconta sai do controle", () => {
    const r = regraEfetiva("Associativa", null, { controla: false, meses: null, diaEnvio: null, diaDeposito: null })
    expect(r.controla).toBe(false)
    expect(competenciaAplica(r, 202610)).toBe(false)
  })

  test("empresa liga a assistencial que a entidade não controla de modo geral", () => {
    const r = regraEfetiva("Assistencial", null, { controla: true, meses: [9], diaEnvio: null, diaDeposito: null })
    expect(competenciaAplica(r, 202609)).toBe(true)
    expect(competenciaAplica(r, 202610)).toBe(false)
  })
})

test.describe("situação da célula", () => {
  const base: DadosCelula = {
    aplica: true,
    antesDoControle: false,
    lancamentos: 0,
    valor: 0,
    deposito: null,
    recebidaFora: false,
    semDesconto: false,
    hoje: "2026-11-08",
    prazoEnvio: "2026-11-10",
    prazoDeposito: "2026-11-10",
  }

  test("no prazo, sem nada: aguardando", () => {
    expect(situacaoEnvio(base)).toBe("aguardando")
  })

  test("prazo vencido: atrasada; antes do controle: só sem relação", () => {
    expect(situacaoEnvio({ ...base, hoje: "2026-11-11" })).toBe("atrasada")
    expect(situacaoEnvio({ ...base, hoje: "2026-11-11", antesDoControle: true })).toBe("sem_relacao")
  })

  test("relação lançada e depósito igual: paga; diferente: divergente", () => {
    const lancada = { ...base, lancamentos: 10, valor: 500 }
    expect(situacaoEnvio({ ...lancada, deposito: 500 })).toBe("paga")
    expect(situacaoEnvio({ ...lancada, deposito: 500.004 })).toBe("paga")
    expect(situacaoEnvio({ ...lancada, deposito: 480 })).toBe("divergente")
  })

  test("relação sem depósito: recebida no prazo, falta o depósito depois", () => {
    const lancada = { ...base, lancamentos: 10, valor: 500 }
    expect(situacaoEnvio(lancada)).toBe("recebida")
    expect(situacaoEnvio({ ...lancada, hoje: "2026-11-20" })).toBe("falta_deposito")
  })

  test("registros manuais: chegou fora do sistema e sem desconto não atrasam", () => {
    const vencida = { ...base, hoje: "2026-11-20" }
    expect(situacaoEnvio({ ...vencida, recebidaFora: true })).toBe("recebida_fora")
    expect(situacaoEnvio({ ...vencida, semDesconto: true })).toBe("sem_desconto")
  })

  test("depósito sem relação aparece mesmo fora do controle", () => {
    expect(situacaoEnvio({ ...base, aplica: false, deposito: 100 })).toBe("deposito_sem_relacao")
    expect(situacaoEnvio({ ...base, aplica: false })).toBe("nao_se_aplica")
  })

  test("sem valores a repassar: não cobra, mas relação ou depósito que chegar aparece", () => {
    const vencida = { ...base, hoje: "2026-11-20", semRepasse: true }
    expect(situacaoEnvio(vencida)).toBe("sem_repasse")
    expect(situacaoEnvio({ ...vencida, aplica: false })).toBe("sem_repasse")
    expect(situacaoEnvio({ ...vencida, lancamentos: 2, valor: 90, deposito: 90 })).toBe("paga")
    expect(situacaoEnvio({ ...vencida, deposito: 50 })).toBe("deposito_sem_relacao")
  })

  test("período sem valores: aberto e encerrado", () => {
    const periodos = [{ desde: 202610, ate: null }, { desde: 202601, ate: 202603 }]
    expect(dentroDoPeriodo(202610, periodos)).toBe(true)
    expect(dentroDoPeriodo(202712, periodos)).toBe(true)
    expect(dentroDoPeriodo(202609, periodos)).toBe(false)
    expect(dentroDoPeriodo(202602, periodos)).toBe(true)
    expect(dentroDoPeriodo(202604, periodos)).toBe(false)
  })
})
