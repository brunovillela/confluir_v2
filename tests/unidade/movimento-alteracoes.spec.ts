import { expect, test } from "playwright/test"

import {
  chaveAlteracao,
  lerChaveCorrigivel,
  mudou,
  periodoTexto,
  ultimosInformados,
} from "../../src/lib/movimento-alteracoes"

const ID = "6c1f2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b"

test.describe("movimento: alterações depois do envio", () => {
  test("lê só as chaves de férias, atestado e ausência (e as correções)", () => {
    expect(lerChaveCorrigivel(`ferias:${ID}`)).toEqual({ tipo: "ferias", id: ID })
    expect(lerChaveCorrigivel(`atestado-alterada:${ID}:2026-10-01:2026-10-03:3`)).toEqual({ tipo: "atestado", id: ID })
    expect(lerChaveCorrigivel(`ferias-cancelada:${ID}`)).toBeNull()
    expect(lerChaveCorrigivel(`falta:${ID}`)).toBeNull()
    expect(lerChaveCorrigivel("aud:123")).toBeNull()
  })

  test("a correção entregue depois vira a referência", () => {
    const inf = ultimosInformados([
      {
        competencia: "2026-11",
        snapshot: [{ chave: `ferias-alterada:${ID}:2026-10-12:2026-10-21:10`, secao: "ferias", funcionarioId: "f", inicio: "2026-10-12", fim: "2026-10-21", quantidade: 10 }],
      },
      {
        competencia: "2026-10",
        snapshot: [{ chave: `ferias:${ID}`, secao: "ferias", funcionarioId: "f", inicio: "2026-10-05", fim: "2026-10-14", quantidade: 10 }],
      },
    ])
    const i = inf.get(`ferias:${ID}`)!
    expect(i.inicio).toBe("2026-10-12")
    expect(i.competencia).toBe("2026-11")
    expect(mudou(i, { inicio: "2026-10-12", fim: "2026-10-21", quantidade: 10 })).toBe(false)
  })

  test("muda início, fim ou dias", () => {
    const i = { inicio: "2026-10-05", fim: "2026-10-14", quantidade: 10 }
    expect(mudou(i, { ...i })).toBe(false)
    expect(mudou(i, { ...i, inicio: "2026-10-06" })).toBe(true)
    expect(mudou(i, { ...i, fim: "2026-10-15" })).toBe(true)
    expect(mudou(i, { ...i, quantidade: 11 })).toBe(true)
  })

  test("cada novo estado tem chave própria; texto do período", () => {
    const a = chaveAlteracao("atestado", ID, { inicio: "2026-10-01", fim: "2026-10-03", quantidade: 3 })
    const b = chaveAlteracao("atestado", ID, { inicio: "2026-10-01", fim: "2026-10-04", quantidade: 4 })
    expect(a).not.toBe(b)
    expect(periodoTexto({ inicio: "2026-10-05", fim: "2026-10-14", quantidade: 10 })).toBe("05/10/2026 a 14/10/2026 (10 dias)")
    expect(periodoTexto({ inicio: "2026-10-01", fim: "2026-10-01", quantidade: null })).toBe("01/10/2026")
  })
})
