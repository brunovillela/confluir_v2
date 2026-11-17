import { expect, test } from "playwright/test"

import {
  aplicarAjuste,
  descreverAjuste,
  desfazerAjustes,
  lerBatidas,
  lidoOriginal,
  mesmoDia,
  mesclarLeitura,
  textoDiaMarcado,
  type MarcacoesEspelho,
} from "../../src/lib/ponto-marcacoes-ajuste"

const quem = { id: "u1", nome: "Gestora", motivo: "conferido no espelho", em: "2026-11-16T12:00:00Z" }
const lido = (): MarcacoesEspelho => ({
  departamento: "Administrativo",
  carga_diaria: "08:00",
  dias: [
    { data: "2026-03-02", ocorrencia: null, marcacoes: ["08:00", "12:00", "13:00", "11:30"] },
    { data: "2026-03-03", ocorrencia: null, marcacoes: ["08:00", "12:00", "13:00"] },
  ],
})

test.describe("ajuste das marcações do espelho", () => {
  test("lê as batidas digitadas em vários formatos", () => {
    expect(lerBatidas("08:00 12:00 13:00 17:30")).toEqual({ batidas: ["08:00", "12:00", "13:00", "17:30"] })
    expect(lerBatidas("8:00-12:00; 1300, 17h")).toEqual({ batidas: ["08:00", "12:00", "13:00", "17:00"] })
    expect(lerBatidas("0800 1730")).toEqual({ batidas: ["08:00", "17:30"] })
    expect(lerBatidas("")).toEqual({ batidas: [] })
    expect("erro" in lerBatidas("08:00 25:00")).toBe(true)
  })

  test("corrige um dia, marca como ajustado e guarda o antes", () => {
    const m = aplicarAjuste(lido(), { data: "2026-03-02", marcacoes: ["08:00", "12:00", "13:00", "17:30"], ocorrencia: null }, quem)
    const dia = m.dias.find((d) => d.data === "2026-03-02")!
    expect(dia.marcacoes).toEqual(["08:00", "12:00", "13:00", "17:30"])
    expect(dia.ajustado).toBe(true)
    expect(m.ajustes).toHaveLength(1)
    expect(m.ajustes![0].antes?.marcacoes).toEqual(["08:00", "12:00", "13:00", "11:30"])
    expect(m.ajustes![0].motivo).toBe("conferido no espelho")
    expect(m.departamento).toBe("Administrativo")
  })

  test("inclui um dia novo em ordem, mesmo sem leitura nenhuma", () => {
    const m = aplicarAjuste(null, { data: "2026-03-05", marcacoes: [], ocorrencia: "Folga" }, quem)
    expect(m.dias).toEqual([{ data: "2026-03-05", ocorrencia: "Folga", marcacoes: [], ajustado: true }])
    const m2 = aplicarAjuste(lido(), { data: "2026-03-01", marcacoes: ["09:00", "13:00"], ocorrencia: null }, quem)
    expect(m2.dias.map((d) => d.data)).toEqual(["2026-03-01", "2026-03-02", "2026-03-03"])
    expect(m2.ajustes![0].antes).toBeNull()
  })

  test("retira um dia e desfaz voltando ao lido", () => {
    const m = aplicarAjuste(lido(), { data: "2026-03-03", marcacoes: [], ocorrencia: null, retirar: true }, quem)
    expect(m.dias.map((d) => d.data)).toEqual(["2026-03-02"])
    const m2 = aplicarAjuste(m, { data: "2026-03-03", marcacoes: ["08:00", "17:00"], ocorrencia: null }, quem)
    // O original continua sendo o que o espelho trazia antes do primeiro ajuste.
    expect(lidoOriginal(m2, "2026-03-03")?.marcacoes).toEqual(["08:00", "12:00", "13:00"])
    const d = desfazerAjustes(m2, "2026-03-03", quem)
    const dia = d.dias.find((x) => x.data === "2026-03-03")!
    expect(dia.marcacoes).toEqual(["08:00", "12:00", "13:00"])
    expect(dia.ajustado).toBeUndefined()
    expect(d.ajustes!.at(-1)!.tipo).toBe("desfeito")
    expect(desfazerAjustes(lido(), "2026-03-02", quem)).toEqual(lido())
  })

  test("desfazer um dia incluído o retira", () => {
    const m = aplicarAjuste(lido(), { data: "2026-03-09", marcacoes: ["08:00", "17:00"], ocorrencia: null }, quem)
    const d = desfazerAjustes(m, "2026-03-09", quem)
    expect(d.dias.some((x) => x.data === "2026-03-09")).toBe(false)
  })

  test("nova leitura do espelho mantém o que foi ajustado à mão", () => {
    let m = aplicarAjuste(lido(), { data: "2026-03-02", marcacoes: ["08:00", "12:00", "13:00", "17:30"], ocorrencia: null }, quem)
    m = aplicarAjuste(m, { data: "2026-03-03", marcacoes: [], ocorrencia: null, retirar: true }, quem)
    const nova = mesclarLeitura(lido(), m)
    expect(nova.dias.map((d) => [d.data, d.marcacoes.join(" ")])).toEqual([["2026-03-02", "08:00 12:00 13:00 17:30"]])
    expect(nova.ajustes).toHaveLength(2)
    // Desfeito: a leitura nova vale.
    const desfeito = desfazerAjustes(m, "2026-03-02", quem)
    const nova2 = mesclarLeitura(lido(), desfeito)
    expect(nova2.dias.find((d) => d.data === "2026-03-02")!.marcacoes).toEqual(["08:00", "12:00", "13:00", "11:30"])
    // Sem ajustes: a leitura passa como veio.
    expect(mesclarLeitura(lido(), lido())).toEqual(lido())
  })

  test("descreve cada ajuste em uma frase", () => {
    expect(textoDiaMarcado({ ocorrencia: "Feriado", marcacoes: ["08:00", "12:00"] })).toBe("08:00 12:00 (Feriado)")
    expect(textoDiaMarcado({ ocorrencia: "Folga", marcacoes: [] })).toBe("Folga")
    expect(textoDiaMarcado({ ocorrencia: null, marcacoes: [] })).toBe("sem batidas")
    let m = aplicarAjuste(lido(), { data: "2026-03-02", marcacoes: ["08:00", "12:00", "13:00", "17:30"], ocorrencia: null }, quem)
    expect(descreverAjuste(m.ajustes!.at(-1)!)).toBe("era 08:00 12:00 13:00 11:30, ficou 08:00 12:00 13:00 17:30")
    m = aplicarAjuste(m, { data: "2026-03-03", marcacoes: [], ocorrencia: null, retirar: true }, quem)
    expect(descreverAjuste(m.ajustes!.at(-1)!)).toBe("retirado (era 08:00 12:00 13:00)")
    m = aplicarAjuste(m, { data: "2026-03-09", marcacoes: [], ocorrencia: "Folga" }, quem)
    expect(descreverAjuste(m.ajustes!.at(-1)!)).toBe("incluído: Folga")
    m = desfazerAjustes(m, "2026-03-02", quem)
    expect(descreverAjuste(m.ajustes!.at(-1)!)).toBe("voltou ao que o espelho trazia (08:00 12:00 13:00 11:30)")
  })

  test("mesmo dia: batidas e ocorrência iguais", () => {
    const a = { ocorrencia: null, marcacoes: ["08:00", "17:00"] }
    expect(mesmoDia(a, { ocorrencia: null, marcacoes: ["08:00", "17:00"] })).toBe(true)
    expect(mesmoDia(a, { ocorrencia: "Feriado", marcacoes: ["08:00", "17:00"] })).toBe(false)
    expect(mesmoDia(a, null)).toBe(false)
    expect(mesmoDia(null, null)).toBe(true)
  })
})
