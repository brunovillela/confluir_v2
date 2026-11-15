import { expect, test } from "playwright/test"

import { palavrasDistintivas, pontuar, sugerirDepositos, temCnpj, temNome, type RelacaoSemDeposito } from "@/lib/repasse-extrato"

const petrobras: RelacaoSemDeposito = {
  chave: "p|202610|Associativa",
  empresaId: "p",
  nome: "Petrobras",
  cnpjs: ["33.000.167/0001-01"],
  nomes: ["Petróleo Brasileiro S.A."],
  competencia: 202610,
  valorRelacao: 1175174.44,
  inicio: "2026-10-01",
  fim: "2027-02-10",
}
const halli: RelacaoSemDeposito = {
  chave: "h|202610|Associativa",
  empresaId: "h",
  nome: "Halliburton",
  cnpjs: ["16.328.932/0001-06"],
  nomes: ["Halliburton Serviços Ltda"],
  competencia: 202610,
  valorRelacao: 13676.62,
  inicio: "2026-10-01",
  fim: "2027-02-10",
}
const cred = (id: string, data: string, valor: number, descricao: string) => ({ id, data, valor, descricao, documento: null })

test("CNPJ completo ou raiz no histórico", () => {
  expect(temCnpj("TED RECEBIDA 33000167000101 PETROBRAS", ["33.000.167/0001-01"])).toBe(true)
  expect(temCnpj("TED 33.000.167/0099-11", ["33.000.167/0001-01"])).toBe(true)
  expect(temCnpj("TED 12345678", ["33.000.167/0001-01"])).toBe(false)
})

test("nome: só palavras que distinguem a empresa", () => {
  expect(palavrasDistintivas("Cetco Serviços de Petróleo Ltda")).toEqual(["cetco"])
  expect(temNome("PIX REC HALLIBURTON SERV", ["Halliburton"])).toBe(true)
  expect(temNome("PIX REC SERVICOS DE PETROLEO", ["Cetco Serviços de Petróleo"])).toBe(false)
})

test("pontuação e confiança", () => {
  expect(pontuar(cred("a", "2026-11-05", 1175174.44, "TED 33000167000101"), petrobras)?.confianca).toBe("alta")
  expect(pontuar(cred("b", "2026-11-05", 1175174.44, "TED RECEBIDA"), petrobras)?.confianca).toBe("media")
  expect(pontuar(cred("c", "2026-11-05", 1100000, "TED PETROBRAS"), petrobras)?.confianca).toBe("baixa")
  expect(pontuar(cred("d", "2026-11-05", 1170000, "TED PETROBRAS"), petrobras)?.confianca).toBe("media")
  expect(pontuar(cred("e", "2026-11-05", 500, "TED RECEBIDA"), petrobras)).toBeNull()
  expect(pontuar(cred("f", "2026-09-20", 1175174.44, "TED PETROBRAS"), petrobras)).toBeNull()
  expect(pontuar(cred("g", "2026-11-05", -1175174.44, "TED PETROBRAS"), petrobras)).toBeNull()
})

test("seguro: um candidato de alta confiança, sem disputa", () => {
  const s = sugerirDepositos(
    [cred("a", "2026-11-05", 1175174.44, "TED PETROBRAS"), cred("b", "2026-11-06", 13676.62, "TED HALLIBURTON"), cred("c", "2026-11-07", 13676.62, "PIX RECEBIDO")],
    [petrobras, halli]
  )
  const p = s.find((x) => x.relacao.empresaId === "p")!
  const h = s.find((x) => x.relacao.empresaId === "h")!
  expect(p.seguro).toBe(true)
  expect(p.candidatos[0].credito.id).toBe("a")
  expect(h.seguro).toBe(true)
  expect(h.candidatos.map((c) => c.credito.id)).toEqual(["b", "c"])
})

test("crédito disputado por duas relações não é seguro", () => {
  const outra = { ...halli, chave: "h|202609|Associativa", competencia: 202609 }
  const s = sugerirDepositos([cred("b", "2026-11-06", 13676.62, "TED HALLIBURTON")], [halli, outra])
  expect(s.every((x) => !x.seguro)).toBe(true)
})

test("palpite fraco some quando o crédito é muito provável em outra relação", () => {
  const junho = { ...halli, chave: "h|202606|Associativa", competencia: 202606, valorRelacao: 20000, inicio: "2026-06-20" }
  const julho = { ...halli, chave: "h|202607|Associativa", competencia: 202607, valorRelacao: 13676.62, inicio: "2026-07-20" }
  const s = sugerirDepositos([cred("b", "2026-08-06", 13676.62, "TED HALLIBURTON")], [junho, julho])
  expect(s.map((x) => x.relacao.chave)).toEqual(["h|202607|Associativa"])
  expect(s[0].seguro).toBe(true)
})

test("mesmo valor em meses seguidos: fica com o mês de prazo mais perto", () => {
  const set = { ...halli, chave: "h|202609|Associativa", competencia: 202609, inicio: "2026-09-20", prazo: "2026-10-10" }
  const out = { ...halli, chave: "h|202610|Associativa", competencia: 202610, inicio: "2026-10-20", prazo: "2026-11-10" }
  const s = sugerirDepositos(
    [cred("x", "2026-10-09", 13676.62, "TED HALLIBURTON"), cred("y", "2026-11-11", 13676.62, "TED HALLIBURTON")],
    [set, out]
  )
  const porMes = Object.fromEntries(s.map((x) => [x.relacao.competencia, x]))
  expect(porMes[202609].candidatos.map((c) => c.credito.id)).toEqual(["x"])
  expect(porMes[202610].candidatos.map((c) => c.credito.id)).toEqual(["y"])
  expect(porMes[202609].seguro && porMes[202610].seguro).toBe(true)
})
