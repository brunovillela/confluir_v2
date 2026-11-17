import { expect, test } from "playwright/test"

import { conferirTitularPix, documentoDaChave } from "@/lib/pix-titular"

// Documentos válidos de teste (dígitos verificadores corretos).
const CPF_A = "52998224725"
const CPF_B = "11144477735"
const CNPJ_MATRIZ = "11222333000181"
const CNPJ_FILIAL = "11222333000262"

test.describe("titular da chave Pix", () => {
  test("só chave do tipo CPF/CNPJ vira documento", () => {
    expect(documentoDaChave("CNPJ / CPF", "529.982.247-25")).toBe(CPF_A)
    expect(documentoDaChave("Telefone", "+5522999999999")).toBeNull()
    expect(documentoDaChave("CNPJ / CPF", "123")).toBeNull()
  })

  test("chave do próprio fornecedor (ou da mesma raiz de CNPJ) confere", () => {
    expect(conferirTitularPix("CNPJ / CPF", CPF_A, CPF_A).situacao).toBe("mesmo")
    expect(conferirTitularPix("CNPJ / CPF", CNPJ_FILIAL, CNPJ_MATRIZ).situacao).toBe("mesmo")
  })

  test("chave de outra pessoa é apontada com os dois documentos", () => {
    const r = conferirTitularPix("CNPJ / CPF", CPF_B, CNPJ_MATRIZ)
    expect(r.situacao).toBe("outro")
    if (r.situacao === "outro") {
      expect(r.documento).toBe(CPF_B)
      expect(r.mensagem).toContain("CPF 111.444.777-35")
      expect(r.mensagem).toContain("11.222.333/0001-81")
    }
  })

  test("telefone, e-mail ou fornecedor sem documento não se comparam", () => {
    expect(conferirTitularPix("Telefone", "+5522999999999", CPF_A).situacao).toBe("nao_comparavel")
    expect(conferirTitularPix("CNPJ / CPF", CPF_A, null).situacao).toBe("nao_comparavel")
  })
})
