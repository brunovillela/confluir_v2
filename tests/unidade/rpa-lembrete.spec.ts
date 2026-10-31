import { expect, test } from "playwright/test"

import { proximaAcaoLembrete } from "@/lib/rpa-lembrete-regra"

/** Lembretes da assinatura do RPA (lib/rpa-lembrete-regra.ts): 3 dias, 2 lembretes. */

const DIA = 864e5
const agora = Date.parse("2026-10-31T12:00:00Z")

test.describe("proximaAcaoLembrete", () => {
  test("menos de 3 dias desde o último contato: nada", () => {
    expect(proximaAcaoLembrete({ contatos: [agora - 2 * DIA], lembretesFeitos: 0, esgotado: false, agora })).toBe("nada")
  })
  test("3 dias depois do envio: primeiro lembrete", () => {
    expect(proximaAcaoLembrete({ contatos: [agora - 3 * DIA], lembretesFeitos: 0, esgotado: false, agora })).toBe("lembrete")
  })
  test("conta a partir do último contato, não do envio", () => {
    const contatos = [agora - 6 * DIA, agora - 1 * DIA]
    expect(proximaAcaoLembrete({ contatos, lembretesFeitos: 1, esgotado: false, agora })).toBe("nada")
  })
  test("segundo lembrete 3 dias depois do primeiro", () => {
    const contatos = [agora - 7 * DIA, agora - 4 * DIA]
    expect(proximaAcaoLembrete({ contatos, lembretesFeitos: 1, esgotado: false, agora })).toBe("lembrete")
  })
  test("depois de 2 lembretes e mais 3 dias: esgota (avisa quem emitiu)", () => {
    const contatos = [agora - 10 * DIA, agora - 7 * DIA, agora - 3 * DIA]
    expect(proximaAcaoLembrete({ contatos, lembretesFeitos: 2, esgotado: false, agora })).toBe("esgotar")
  })
  test("já esgotado: nunca mais nada", () => {
    expect(proximaAcaoLembrete({ contatos: [agora - 30 * DIA], lembretesFeitos: 2, esgotado: true, agora })).toBe("nada")
  })
  test("sem data de contato válida: nada", () => {
    expect(proximaAcaoLembrete({ contatos: [Number.NaN], lembretesFeitos: 0, esgotado: false, agora })).toBe("nada")
  })
})
