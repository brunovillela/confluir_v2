import { expect, test } from "playwright/test"

import {
  avisosTabelaANS,
  calcularMes,
  descontoCoparticipacao,
  direitoDoDependente,
  faixaDaIdade,
  idadeDaFaixa,
  idadeEm,
  lerValor,
  mudancasEntreMeses,
  parteDaEntidade,
  regraQueCasa,
  reajustePendente,
  type Beneficiario,
  type DadosMes,
  type RegraCusteio,
} from "../../src/lib/plano-saude"

const precos = [100, 120, 140, 160, 180, 200, 250, 300, 400, 600]

const regra = (r: Partial<RegraCusteio>): RegraCusteio => ({
  id: r.nome ?? "r",
  nome: "r",
  prioridade: 100,
  inicio: null,
  fim: null,
  beneficiarios: null,
  condicoes: null,
  produtos: null,
  cargos: null,
  departamentos: null,
  funcionarios: null,
  idadeMin: null,
  idadeMax: null,
  modo: "percentual",
  entidadePercentual: 0,
  entidadeValor: null,
  entidadeTeto: null,
  copartFuncionarioPercentual: null,
  copartLimiteMensal: null,
  ativo: true,
  ...r,
})

const ben = (b: Partial<Beneficiario>): Beneficiario => ({
  id: b.nome ?? "b",
  produtoId: "p1",
  titularId: "t1",
  tipo: "titular",
  grau: "titular",
  nome: "Ana",
  nascimento: "1990-05-10",
  condicao: "ativo",
  inclusao: "2025-01-01",
  exclusao: null,
  estudanteAte: null,
  ...b,
})

test.describe("plano de saúde", () => {
  test("faixas da ANS e idade", () => {
    expect([0, 18, 19, 23, 24, 58, 59, 80].map(faixaDaIdade)).toEqual([0, 0, 1, 1, 2, 8, 9, 9])
    expect(idadeEm("1990-05-10", "2026-05-09")).toBe(35)
    expect(idadeEm("1990-05-10", "2026-05-10")).toBe(36)
    // Aniversário de 24 anos em maio: muda em junho (mês seguinte) ou já em maio.
    expect(idadeDaFaixa("2002-05-20", "2026-05", "mes_seguinte")).toBe(23)
    expect(idadeDaFaixa("2002-05-20", "2026-06", "mes_seguinte")).toBe(24)
    expect(idadeDaFaixa("2002-05-20", "2026-05", "mes_aniversario")).toBe(24)
  })

  test("tabela conferida com a RN 63", () => {
    expect(avisosTabelaANS(precos)).toEqual([])
    expect(avisosTabelaANS([100, 120, 140, 160, 180, 200, 250, 300, 400, 700])[0]).toMatch(/6 vezes/)
    // 1ª→7ª = +50%; 7ª→10ª = +100%: quebra a segunda regra.
    expect(avisosTabelaANS([100, 100, 100, 100, 100, 100, 150, 200, 250, 300]).some((a) => /7ª para a 10ª/.test(a))).toBe(true)
    expect(avisosTabelaANS([1, 2])).toEqual(["Informe os 10 preços."])
  })

  test("custeio: percentual, valor fixo, teto e prioridade", () => {
    expect(parteDaEntidade(regra({ entidadePercentual: 50 }), 301)).toBe(150.5)
    expect(parteDaEntidade(regra({ modo: "valor_fixo", entidadeValor: 400 }), 300)).toBe(300)
    expect(parteDaEntidade(regra({ entidadePercentual: 100, entidadeTeto: 250 }), 300)).toBe(250)
    const regras = [
      regra({ nome: "geral", prioridade: 100, entidadePercentual: 50 }),
      regra({ nome: "titular ativo", prioridade: 10, beneficiarios: ["titular"], condicoes: ["ativo"], entidadePercentual: 100 }),
      regra({ nome: "diretoria", prioridade: 5, cargos: ["Diretor"], entidadePercentual: 100 }),
      regra({ nome: "aposentado", prioridade: 1, condicoes: ["aposentado"], entidadePercentual: 0 }),
    ]
    const titular = { id: "t1", nome: "Ana", cargo: "Analista", departamento: "Adm" }
    const data = "2026-11-01"
    expect(regraQueCasa(regras, { beneficiario: ben({}), titular, idade: 36, data })?.nome).toBe("titular ativo")
    expect(regraQueCasa(regras, { beneficiario: ben({ tipo: "dependente", grau: "Cônjuge" }), titular, idade: 36, data })?.nome).toBe("geral")
    expect(regraQueCasa(regras, { beneficiario: ben({}), titular: { ...titular, cargo: "Diretor" }, idade: 36, data })?.nome).toBe("diretoria")
    expect(regraQueCasa(regras, { beneficiario: ben({ condicao: "aposentado" }), titular, idade: 70, data })?.nome).toBe("aposentado")
  })

  test("dependente perde o direito pela idade (com a de estudante)", () => {
    const regras = [{ grau: "Filho ou enteado", permitido: true, idadeLimite: 21, idadeLimiteEstudante: 24 }]
    const filho = ben({ tipo: "dependente", grau: "Filho ou enteado", nascimento: "2005-03-01" })
    expect(direitoDoDependente(filho, regras, "2026-02-28")?.ok).toBe(true)
    expect(direitoDoDependente(filho, regras, "2026-03-01")?.ok).toBe(false)
    expect(direitoDoDependente({ ...filho, estudanteAte: "2026-12-31" }, regras, "2026-03-01")?.ok).toBe(true)
    expect(direitoDoDependente(ben({ tipo: "dependente", grau: "Pais, avós ou bisavós" }), regras, "2026-03-01")).toBeNull()
  })

  test("coparticipação: percentual do funcionário e limite", () => {
    expect(descontoCoparticipacao(null, 80)).toBe(80)
    expect(descontoCoparticipacao(regra({ copartFuncionarioPercentual: 50, copartLimiteMensal: 30 }), 80)).toBe(30)
  })

  test("o mês por titular, com alertas e mudanças", () => {
    const dados = (competencia: string): DadosMes => ({
      competencia,
      faixaMuda: "mes_seguinte",
      beneficiarios: [
        ben({ id: "t", nome: "Ana", nascimento: "1967-11-15" }), // faz 59 em nov/2026: 10ª faixa em dez
        ben({ id: "f", nome: "Bia", tipo: "dependente", grau: "Filho ou enteado", nascimento: "2010-01-01" }),
        ben({ id: "x", nome: "Caio", tipo: "dependente", grau: "Filho ou enteado", nascimento: "2010-01-01", exclusao: "2026-10-31" }),
      ],
      titulares: new Map([["t1", { id: "t1", nome: "Ana", cargo: null, departamento: null }]]),
      tabelas: [{ produtoId: "p1", inicio: "2026-01-01", fim: null, precos }],
      regras: [
        regra({ nome: "titular", prioridade: 1, beneficiarios: ["titular"], entidadePercentual: 100 }),
        regra({ nome: "dependentes", prioridade: 2, entidadePercentual: 50, copartFuncionarioPercentual: 100 }),
      ],
      regrasDependentes: [{ grau: "Filho ou enteado", permitido: true, idadeLimite: 21, idadeLimiteEstudante: null }],
      coparticipacoes: new Map([["t1", 25]]),
    })
    const [nov] = calcularMes(dados("2026-11"))
    expect(nov.linhas.map((l) => [l.beneficiario.nome, l.mensalidade, l.funcionario])).toEqual([
      ["Ana", 400, 0],
      ["Bia", 100, 50],
    ])
    expect(nov.desconto).toBe(75)
    expect(nov.entidade).toBe(450)
    // A parte da coparticipação que não é descontada fica com a entidade (e fecha com a fatura).
    const comCopart = dados("2026-11")
    comCopart.regras[0] = { ...comCopart.regras[0], copartFuncionarioPercentual: 40 }
    const [g] = calcularMes(comCopart)
    expect([g.descontoCopart, g.entidadeCopart, g.entidade, g.desconto]).toEqual([10, 15, 465, 60])
    expect(g.entidade + g.desconto).toBe(g.mensalidade + g.coparticipacao)
    const [dez] = calcularMes(dados("2026-12"))
    expect(dez.linhas[0].mensalidade).toBe(600)
    const [out] = calcularMes(dados("2026-10"))
    const m = mudancasEntreMeses([out], [nov]).get("t1")!.map((x) => `${x.nome}: ${x.texto}`)
    expect(m).toContain("Caio: saiu do plano")
    expect(mudancasEntreMeses([nov], [dez]).get("t1")!.map((x) => x.texto)).toContain("mudou de faixa (54 a 58 → 59 ou mais)")
  })

  test("sem tabela ou sem regra vira alerta", () => {
    const [g] = calcularMes({
      competencia: "2026-11",
      faixaMuda: "mes_seguinte",
      beneficiarios: [ben({})],
      titulares: new Map(),
      tabelas: [],
      regras: [],
      regrasDependentes: [],
      coparticipacoes: new Map(),
    })
    expect(g.alertas).toEqual(["Sem tabela de preço vigente para o produto neste mês.", "Nenhuma regra de custeio casa com este beneficiário."])
  })

  test("valores digitados", () => {
    expect(lerValor("1.234,56")).toBe(1234.56)
    expect(lerValor("R$ 99,9")).toBe(99.9)
    expect(lerValor("12.5")).toBe(12.5)
    expect(lerValor("")).toBeNull()
  })

  test("reajuste anual pendente a partir do mês de aniversário", () => {
    const produtos = [
      { id: "p1", nome: "Básico", ativo: true },
      { id: "p2", nome: "Executivo", ativo: true },
      { id: "p3", nome: "Antigo", ativo: false },
    ]
    const tabs = [
      { produtoId: "p1", inicio: "2025-07-01", fim: null, precos },
      { produtoId: "p2", inicio: "2025-07-01", fim: null, precos },
      { produtoId: "p3", inicio: "2025-07-01", fim: null, precos },
    ]
    const c = { mesAniversario: 7, inicio: "2024-01-01" }
    // Antes do aniversário deste ano: o de 2025 está em dia.
    expect(reajustePendente(c, produtos, tabs, "2026-06-30")).toBeNull()
    // Chegou julho/2026 sem tabela nova: os dois produtos ativos.
    expect(reajustePendente(c, produtos, tabs, "2026-07-01")).toEqual({ aniversario: "2026-07-01", produtos: ["Básico", "Executivo"] })
    // Cadastrada a do Básico, falta a do Executivo.
    const comBasico = [...tabs, { produtoId: "p1", inicio: "2026-07-01", fim: null, precos }]
    expect(reajustePendente(c, produtos, comBasico, "2026-11-25")?.produtos).toEqual(["Executivo"])
    // Contrato que começou depois do aniversário, ou sem mês de aniversário: nada.
    expect(reajustePendente({ mesAniversario: 7, inicio: "2026-08-01" }, produtos, tabs, "2026-11-25")).toBeNull()
    expect(reajustePendente({ mesAniversario: null, inicio: null }, produtos, tabs, "2026-11-25")).toBeNull()
  })

  test("desligado e dependente inativo ainda no plano viram alerta", () => {
    const [g] = calcularMes({
      competencia: "2026-11",
      faixaMuda: "mes_seguinte",
      beneficiarios: [
        ben({ id: "t", nome: "Ana" }),
        ben({ id: "d", nome: "Bia", tipo: "dependente", grau: "Cônjuge", dependenteInativo: true }),
      ],
      titulares: new Map([["t1", { id: "t1", nome: "Ana", cargo: null, departamento: null, demissao: "2026-11-10" }]]),
      tabelas: [{ produtoId: "p1", inicio: "2026-01-01", fim: null, precos }],
      regras: [regra({ entidadePercentual: 100 })],
      regrasDependentes: [{ grau: "Cônjuge", permitido: true, idadeLimite: null, idadeLimiteEstudante: null }],
      coparticipacoes: new Map(),
    })
    expect(g.alertas.some((a) => a.startsWith("Desligado em 10/11/2026"))).toBe(true)
    expect(g.alertas).toContain("Dependente desativado no cadastro do Pessoal e ainda no plano.")
    // Demitido que manteve o plano (art. 30): sem alerta de desligamento.
    const [h] = calcularMes({
      competencia: "2026-11",
      faixaMuda: "mes_seguinte",
      beneficiarios: [ben({ id: "t", nome: "Ana", condicao: "demitido" })],
      titulares: new Map([["t1", { id: "t1", nome: "Ana", cargo: null, departamento: null, demissao: "2026-11-10" }]]),
      tabelas: [{ produtoId: "p1", inicio: "2026-01-01", fim: null, precos }],
      regras: [regra({ entidadePercentual: 0 })],
      regrasDependentes: [],
      coparticipacoes: new Map(),
    })
    expect(h.alertas).toEqual([])
  })
})
