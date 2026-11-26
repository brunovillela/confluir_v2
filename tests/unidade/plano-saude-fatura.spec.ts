import { expect, test } from "playwright/test"

import { calcularMes, type Beneficiario, type RegraCusteio } from "../../src/lib/plano-saude"
import { casarLinhas, compararFatura, valorDaIA, type LinhaLida } from "../../src/lib/plano-saude-fatura"

const lida = (l: Partial<LinhaLida>): LinhaLida => ({
  nome: "",
  carteirinha: null,
  cpf: null,
  mensalidade: 0,
  coparticipacao: 0,
  outros: 0,
  outrosDescricao: null,
  ...l,
})

const ben = (b: Partial<Beneficiario>): Beneficiario => ({
  id: "b",
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

const regra: RegraCusteio = {
  id: "r",
  nome: "Todos 50%",
  prioridade: 1,
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
  entidadePercentual: 50,
  entidadeValor: null,
  entidadeTeto: null,
  copartFuncionarioPercentual: null,
  copartLimiteMensal: null,
  ativo: true,
}

test.describe("plano de saúde: fatura", () => {
  test("casa por carteirinha, CPF, nome e primeiro + último nome", () => {
    const candidatos = [
      { id: "a", nome: "Ana Beatriz Nogueira", carteirinha: "0001234", cpf: null },
      { id: "b", nome: "Bruno Costa", carteirinha: null, cpf: "123.456.789-01" },
      { id: "c", nome: "Célia Maria Ramos", carteirinha: null, cpf: null },
      { id: "d", nome: "Davi Souza Lima", carteirinha: null, cpf: null },
    ]
    const r = casarLinhas(
      [
        lida({ nome: "ANA B NOGUEIRA", carteirinha: "1234" }),
        lida({ nome: "B COSTA", cpf: "12345678901" }),
        lida({ nome: "CELIA MARIA RAMOS" }),
        lida({ nome: "DAVI L. LIMA" }),
        lida({ nome: "Fulano de Tal" }),
      ],
      candidatos
    )
    expect(r.map((l) => [l.beneficiarioId, l.casou])).toEqual([
      ["a", "carteirinha"],
      ["b", "cpf"],
      ["c", "nome"],
      ["d", "nome_parcial"],
      [null, null],
    ])
    expect(Object.keys(r[1])).not.toContain("cpf")
  })

  test("nome parcial ambíguo não casa", () => {
    const r = casarLinhas([lida({ nome: "José Silva" })], [
      { id: "1", nome: "José Carlos Silva", carteirinha: null, cpf: null },
      { id: "2", nome: "José Pedro Silva", carteirinha: null, cpf: null },
    ])
    expect(r[0].beneficiarioId).toBeNull()
  })

  test("compara cobrado com o calculado e separa as situações", () => {
    const precos = [100, 120, 140, 160, 180, 200, 250, 300, 400, 600]
    const grupos = calcularMes({
      competencia: "2026-11",
      faixaMuda: "mes_seguinte",
      beneficiarios: [
        ben({ id: "t", nome: "Ana", nascimento: "1990-05-10" }), // 36 anos: 34 a 38 (180)
        ben({ id: "f", nome: "Bia", tipo: "agregado", grau: "Agregado", nascimento: "2010-01-01" }), // 16: faixa 1 (100)
        ben({ id: "x", nome: "Caio", tipo: "agregado", grau: "Agregado", nascimento: "2000-01-01" }), // 26: faixa 3 (140)
      ],
      titulares: new Map([["t1", { id: "t1", nome: "Ana", cargo: null, departamento: null }]]),
      tabelas: [{ produtoId: "p1", inicio: "2026-01-01", fim: null, precos }],
      regras: [regra],
      regrasDependentes: [],
      coparticipacoes: new Map(),
    })
    const linhas = [
      { nome: "ANA", carteirinha: null, mensalidade: 180, coparticipacao: 30, outros: 0, outrosDescricao: null, beneficiarioId: "t", casou: "nome" as const },
      { nome: "BIA", carteirinha: null, mensalidade: 110, coparticipacao: 10, outros: 0, outrosDescricao: null, beneficiarioId: "f", casou: "nome" as const },
      { nome: "ZÉ", carteirinha: null, mensalidade: 90, coparticipacao: 0, outros: 5, outrosDescricao: "Taxa", beneficiarioId: null, casou: null },
    ]
    const c = compararFatura(linhas, grupos, 425)
    const por = new Map(c.itens.map((i) => [i.nome, i]))
    expect(por.get("Ana")?.situacao).toBe("confere")
    expect(por.get("Bia")).toMatchObject({ situacao: "diferente", esperado: 100, cobrado: 110, diferenca: 10 })
    expect(por.get("Caio")).toMatchObject({ situacao: "so_no_sistema", esperado: 140, cobrado: null })
    expect(por.get("ZÉ")?.situacao).toBe("so_na_fatura")
    expect(c.itens[0].situacao).toBe("so_na_fatura")
    expect(c.totais).toEqual({ esperado: 420, cobradoMensalidades: 380, coparticipacao: 40, outros: 5, somaLinhas: 425, totalFatura: 425 })
    expect(c.copartPorTitular.get("t1")).toBe(40)
    expect(c.contagem).toEqual({ confere: 1, diferente: 1, so_na_fatura: 1, so_no_sistema: 1, entidade: 0 })
    const comTaxa = compararFatura([...linhas, { nome: "Entidade", carteirinha: null, mensalidade: 0, coparticipacao: 0, outros: 15, outrosDescricao: "Taxa", beneficiarioId: null, casou: null }], grupos, null)
    expect(comTaxa.itens.find((i) => i.nome === "Entidade")).toMatchObject({ situacao: "entidade", diferenca: 0 })
  })

  test("linhas separadas do mesmo beneficiário somam", () => {
    const grupos = calcularMes({
      competencia: "2026-11",
      faixaMuda: "mes_seguinte",
      beneficiarios: [ben({ id: "t", nome: "Ana" })],
      titulares: new Map([["t1", { id: "t1", nome: "Ana", cargo: null, departamento: null }]]),
      tabelas: [{ produtoId: "p1", inicio: "2026-01-01", fim: null, precos: [100, 120, 140, 160, 180, 200, 250, 300, 400, 600] }],
      regras: [regra],
      regrasDependentes: [],
      coparticipacoes: new Map(),
    })
    const base = { nome: "ANA", carteirinha: null, outros: 0, outrosDescricao: null, beneficiarioId: "t", casou: "nome" as const }
    const c = compararFatura([{ ...base, mensalidade: 180, coparticipacao: 0 }, { ...base, mensalidade: 0, coparticipacao: 25.5 }], grupos, null)
    expect(c.itens).toHaveLength(1)
    expect(c.itens[0]).toMatchObject({ situacao: "confere", coparticipacao: 25.5 })
  })

  test("valores vindos da IA", () => {
    expect(valorDaIA(12.345)).toBe(12.35)
    expect(valorDaIA("1.234,56")).toBe(1234.56)
    expect(valorDaIA("R$ 99.90")).toBe(99.9)
    expect(valorDaIA(null)).toBe(0)
    expect(valorDaIA("-15,00")).toBe(-15)
  })
})
