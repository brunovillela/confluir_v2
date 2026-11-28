import { expect, test } from "playwright/test"

import { corrigirEmailObvio, emailsDeEnvio, emailValido } from "../../src/lib/email-cadastro"

test("corrige os erros óbvios vistos no cadastro", () => {
  expect(corrigirEmailObvio("maria.exemplo@hotmail..com")).toBe("maria.exemplo@hotmail.com")
  expect(corrigirEmailObvio("fulano@petrobras.com. br")).toBe("fulano@petrobras.com.br")
  expect(corrigirEmailObvio("fulano@petrobras.com br")).toBe("fulano@petrobras.com.br")
  expect(corrigirEmailObvio("jose silva@gmail.com")).toBe("josesilva@gmail.com")
  expect(corrigirEmailObvio("Ana.Silva@Gmail.com.")).toBe("ana.silva@gmail.com")
  expect(corrigirEmailObvio("chave@petrobras.com.br'")).toBe("chave@petrobras.com.br")
  expect(corrigirEmailObvio(" x@y.com ")).toBe("x@y.com")
})

test("não inventa endereço", () => {
  expect(corrigirEmailObvio("(21)90000-0000")).toBeNull()
  expect(corrigirEmailObvio("re")).toBeNull()
  expect(corrigirEmailObvio("filipe.petrobras.com.br")).toBeNull()
  expect(corrigirEmailObvio("a@b.com;c@d.com")).toBeNull()
  expect(corrigirEmailObvio("")).toBeNull()
  expect(corrigirEmailObvio("fulano@.com.br")).toBeNull()
  expect(corrigirEmailObvio("dm@.uol.com.br")).toBe("dm@uol.com.br")
})

test("lista de envio: corrige, tira repetido e o que não tem conserto", () => {
  expect(emailsDeEnvio(["A@x.com", "a@x.com.", "re", null, "b@y..com"])).toEqual(["a@x.com", "b@y.com"])
  expect(emailValido("jo.ao+1@empresa.com.br")).toBe(true)
  expect(emailValido("jo ao@empresa.com")).toBe(false)
})
