import { expect, test } from "playwright/test"

import { normalizarTipoPix } from "@/lib/bancos"

test("tipo da chave Pix na lista única", () => {
  expect(normalizarTipoPix("cpf")).toBe("CNPJ / CPF")
  expect(normalizarTipoPix("CNPJ")).toBe("CNPJ / CPF")
  expect(normalizarTipoPix("Email")).toBe("E-mail")
  expect(normalizarTipoPix("Aleatória")).toBe("Chave aleatória")
  expect(normalizarTipoPix("Telefone")).toBe("Telefone")
  // Sem tipo reconhecível: deduz pela chave.
  expect(normalizarTipoPix(null, "fulano@exemplo.com")).toBe("E-mail")
  expect(normalizarTipoPix("qualquer", "+5522999999999")).toBe("Telefone")
  expect(normalizarTipoPix(null, null)).toBeNull()
})
