import { expect, test } from "playwright/test"

import {
  complementoDaDescricao,
  faltasDaDescricao,
  motivoJustificativaFraca,
} from "../../src/lib/auditoria-confirmacao"

const TAXI =
  "Compra direta — Serviço de transporte por táxi, prestado por Luís Mauricio Viana, no trajeto Lava-Jato–Sindipetro e Sindipetro–Lava-Jato."

test.describe("justificativa que não justifica", () => {
  test("a descrição colada (com ou sem o prefixo) é recusada", () => {
    expect(motivoJustificativaFraca(TAXI, [TAXI])).toContain("repete a descrição")
    expect(motivoJustificativaFraca(TAXI.replace("Compra direta — ", ""), [TAXI])).toContain("repete a descrição")
  })

  test("um trecho da descrição, mesmo sem acento ou com outra pontuação, é recusado", () => {
    expect(motivoJustificativaFraca("servico de transporte por taxi prestado por Luis Mauricio", [TAXI])).toContain("repete")
  })

  test("e-mail, endereço ou número sozinhos são recusados", () => {
    expect(motivoJustificativaFraca("pix.caixa@intecmidia.com.br", [TAXI])).toContain("e-mail")
    expect(motivoJustificativaFraca("https://loja.exemplo.com/pedido/123", [])).toContain("e-mail")
    expect(motivoJustificativaFraca("12345678900", [])).toContain("número")
  })

  test("motivo de verdade passa, mesmo citando palavras da descrição", () => {
    expect(motivoJustificativaFraca("São duas corridas: a ida no dia 6 e a volta no dia 7.", [TAXI])).toBeNull()
    expect(motivoJustificativaFraca("A chave Pix é do dono do MEI, o mesmo CPF da nota.", [TAXI])).toBeNull()
    expect(motivoJustificativaFraca("táxi de volta", [TAXI])).toBeNull()
  })

  test("sem descrição para comparar, só o formato conta", () => {
    expect(motivoJustificativaFraca("fornecedor único no local", [null, ""])).toBeNull()
  })
})

test.describe("o que falta na descrição", () => {
  test("lê os itens do parecer da IA", () => {
    expect(faltasDaDescricao("Falta: a finalidade da compra; a quantidade e unidade. Descrição vaga.")).toEqual([
      "a finalidade da compra",
      "a quantidade e unidade",
    ])
  })

  test("parecer sem a lista não pergunta nada", () => {
    expect(faltasDaDescricao("A descrição está genérica.")).toEqual([])
    expect(faltasDaDescricao("")).toEqual([])
  })

  test("as respostas viram frases no fim da descrição; vazias ficam de fora", () => {
    expect(
      complementoDaDescricao({ "a finalidade da compra": "oficina de artesanato em Campos.", "a quantidade": "  " })
    ).toBe("Finalidade da compra: oficina de artesanato em Campos.")
  })
})
