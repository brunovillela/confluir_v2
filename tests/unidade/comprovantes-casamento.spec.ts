import { expect, test } from "playwright/test"

import {
  atribuirOrdens,
  codigoDeBarras,
  pontuar,
  semelhancaNome,
  sugerirOrdens,
  type ComprovanteLido,
  type OrdemCandidata,
} from "../../src/lib/comprovantes-casamento"

const comprovante = (p: Partial<ComprovanteLido> = {}): ComprovanteLido => ({
  paginas: [1],
  tipo: "Pix",
  valor: 1500,
  data: "2026-11-05",
  favorecido: null,
  documento: null,
  chavePix: null,
  linhaDigitavel: null,
  ...p,
})

const ordem = (p: Partial<OrdemCandidata> = {}): OrdemCandidata => ({
  id: "o1",
  codigo: "2026.1105.0001.0001",
  situacao: "A pagar",
  descricao: null,
  forma: "Pix",
  valor: 1500,
  valorPago: null,
  vencimento: "2026-11-05",
  dataPagamento: null,
  favorecido: "Tech Suprimentos Ltda",
  documento: "11222333000181",
  linhaDigitavel: null,
  chavesPix: [],
  ...p,
})

test("nomes abreviados pelo banco ainda se parecem", () => {
  expect(semelhancaNome("TECH SUPRIM", "Tech Suprimentos Ltda")).toBe(1)
  expect(semelhancaNome("João Batista Ramos", "JOAO B RAMOS")).toBeGreaterThanOrEqual(0.5)
  expect(semelhancaNome("Gráfica Modelo", "Pousada Mar Azul")).toBe(0)
})

test("linha digitável de boleto vira o mesmo código de barras", () => {
  const linha = "23793381286000000000300000000400184340000012345"
  expect(codigoDeBarras(linha)).toHaveLength(44)
  expect(codigoDeBarras(linha)).toBe(codigoDeBarras(linha.replace(/(\d{5})/, "$1.")))
})

test("mesmo valor, nome e data: sugestão confiável", () => {
  const s = pontuar(comprovante({ favorecido: "TECH SUPRIMENTOS" }), ordem())
  expect(s.pontos).toBeGreaterThanOrEqual(60)
  expect(s.motivos).toContain("mesmo valor")
})

test("valor diferente derruba mesmo com o nome igual", () => {
  const s = pontuar(comprovante({ valor: 999, favorecido: "Tech Suprimentos" }), ordem())
  expect(s.pontos).toBeLessThan(35)
})

test("código de barras e chave Pix decidem", () => {
  const linha = "23793381286000000000300000000400184340000012345"
  expect(pontuar(comprovante({ linhaDigitavel: linha }), ordem({ linhaDigitavel: codigoDeBarras(linha) })).pontos).toBeGreaterThanOrEqual(100)
  expect(pontuar(comprovante({ chavePix: "+55 (21) 99999-0000" }), ordem({ chavesPix: ["21999990000"] })).motivos).toContain("mesma chave Pix")
})

test("CPF mascarado confere pelo trecho visível; completo diferente pesa contra", () => {
  const o = ordem({ documento: "12345678901", favorecido: "Maria" })
  expect(pontuar(comprovante({ documento: "***.456.789-**" }), o).motivos).toContain("CPF/CNPJ confere no trecho visível")
  expect(pontuar(comprovante({ documento: "98765432100" }), o).pontos).toBeLessThan(pontuar(comprovante(), o).pontos)
})

test("ordem já paga compara a data do pagamento", () => {
  const paga = ordem({ situacao: "Paga", valorPago: 1500, dataPagamento: "2026-11-05" })
  expect(pontuar(comprovante(), paga).motivos).toContain("mesma data de pagamento")
})

test("sugestões ordenadas e só acima do mínimo", () => {
  const lista = sugerirOrdens(comprovante({ favorecido: "Tech Suprimentos" }), [
    ordem({ id: "a", valor: 10 }),
    ordem({ id: "b" }),
  ])
  expect(lista.map((s) => s.ordemId)).toEqual(["b"])
})

test("a mesma ordem não vai para dois comprovantes; empate fica para o usuário", () => {
  const escolha = atribuirOrdens([
    { chave: "x", sugestoes: [{ ordemId: "o1", pontos: 120, motivos: [] }] },
    { chave: "y", sugestoes: [{ ordemId: "o1", pontos: 90, motivos: [] }, { ordemId: "o2", pontos: 70, motivos: [] }] },
    { chave: "z", sugestoes: [{ ordemId: "o3", pontos: 80, motivos: [] }, { ordemId: "o4", pontos: 75, motivos: [] }] },
  ])
  expect(escolha.get("x")).toBe("o1")
  expect(escolha.get("y")).toBe("o2")
  expect(escolha.get("z")).toBeNull()
})
