import { expect, test } from "playwright/test"

import { paginaDoIndice, recorteDaLista, urlNaLista } from "@/lib/lista-estado"

test.describe("recorte da lista nos botões das linhas", () => {
  test("mantém página, itens por página e filtros; tira avisos e formulário aberto", () => {
    const recorte = recorteDaLista({
      pagina: "3",
      porPagina: "30",
      aba: "registros",
      busca: "ana",
      salvo: "1",
      editar: "x",
      linha: "y",
      transferido: "Março",
      vazio: "",
    })
    expect(recorte.toString()).toBe("pagina=3&porPagina=30&aba=registros&busca=ana")
  })

  test("Editar leva o recorte e a âncora da linha", () => {
    const r = recorteDaLista(new URLSearchParams("pagina=2&porPagina=50&salvo=1"))
    expect(urlNaLista("/painel/x", r, { editar: "abc" }, "registro-abc")).toBe(
      "/painel/x?pagina=2&porPagina=50&editar=abc#registro-abc"
    )
  })

  test("extras em texto (cascata do ponto) e remoção de chave", () => {
    const r = recorteDaLista({ pagina: "2", aba: "x" })
    expect(urlNaLista("/p", r, "&salvo=1&recalculadas=A%7CB")).toBe("/p?pagina=2&aba=x&salvo=1&recalculadas=A%7CB")
    expect(urlNaLista("/p", r, { aba: null })).toBe("/p?pagina=2")
    expect(urlNaLista("/p", new URLSearchParams())).toBe("/p")
  })

  test("página da linha em foco", () => {
    expect(paginaDoIndice(0, 10)).toBe(1)
    expect(paginaDoIndice(9, 10)).toBe(1)
    expect(paginaDoIndice(10, 10)).toBe(2)
    expect(paginaDoIndice(-1, 10)).toBe(1)
  })
})
