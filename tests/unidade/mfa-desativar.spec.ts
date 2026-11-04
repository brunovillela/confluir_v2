import { expect, test } from "playwright/test"

import { desativarFatorComCodigo, type DepsDesativar2FA } from "@/lib/mfa-desativar"

function montar(opcoes: { bloqueio?: string; codigoCerto?: boolean; removeu?: boolean } = {}) {
  const chamadas: string[] = []
  const deps: DepsDesativar2FA = {
    bloqueio: async () => opcoes.bloqueio ?? null,
    verificar: async (fator, codigo) => {
      chamadas.push(`verificar:${fator}:${codigo}`)
      return { ok: opcoes.codigoCerto ?? true }
    },
    registrarFalha: async () => {
      chamadas.push("falha")
    },
    limparFalhas: async () => {
      chamadas.push("limpar")
    },
    remover: async (fator) => {
      chamadas.push(`remover:${fator}`)
      return { ok: opcoes.removeu ?? true }
    },
  }
  return { deps, chamadas }
}

test.describe("desativarFatorComCodigo", () => {
  test("sem código não remove nem consulta", async () => {
    const { deps, chamadas } = montar()
    const r = await desativarFatorComCodigo(deps, "f1", "")
    expect(r.erro).toBe("Digite o código de 6 dígitos.")
    expect(chamadas).toEqual([])
  })

  test("código incompleto não remove", async () => {
    const { deps, chamadas } = montar()
    expect((await desativarFatorComCodigo(deps, "f1", "12345")).erro).toBeTruthy()
    expect(chamadas).toEqual([])
  })

  test("sem fator não remove", async () => {
    const { deps, chamadas } = montar()
    expect((await desativarFatorComCodigo(deps, "", "123456")).erro).toBe("Fator inválido.")
    expect(chamadas).toEqual([])
  })

  test("conta bloqueada não testa o código", async () => {
    const { deps, chamadas } = montar({ bloqueio: "Muitas tentativas." })
    expect((await desativarFatorComCodigo(deps, "f1", "123456")).erro).toBe("Muitas tentativas.")
    expect(chamadas).toEqual([])
  })

  test("código errado conta a falha e mantém o fator", async () => {
    const { deps, chamadas } = montar({ codigoCerto: false })
    expect((await desativarFatorComCodigo(deps, "f1", "123456")).erro).toContain("Código inválido")
    expect(chamadas).toEqual(["verificar:f1:123456", "falha"])
  })

  test("código certo limpa as falhas e só então remove", async () => {
    const { deps, chamadas } = montar()
    expect(await desativarFatorComCodigo(deps, "f1", "123 456")).toEqual({})
    expect(chamadas).toEqual(["verificar:f1:123456", "limpar", "remover:f1"])
  })

  test("falha ao remover vira erro", async () => {
    const { deps } = montar({ removeu: false })
    expect((await desativarFatorComCodigo(deps, "f1", "123456")).erro).toContain("Não foi possível")
  })
})
