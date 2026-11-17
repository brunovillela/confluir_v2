import { expect, test } from "playwright/test"

import { apurarMes, REGRAS_PADRAO } from "../../src/lib/ponto-apuracao"
import {
  aplicarAjuste,
  conferirDia,
  desfazerAjustes,
  mesclarLeitura,
  type MarcacoesEspelho,
} from "../../src/lib/ponto-marcacoes-ajuste"
import { escolherJornada, jornadaDaCarga, jornadaDosDias, leituraDasMarcacoes } from "../../src/lib/ponto-recalculo"

const quem = { id: "u1", nome: "Gestora", motivo: null, em: "2026-11-16T12:00:00Z" }
// Seg 02/03 a qua 04/03 de 2026.
const lido = (): MarcacoesEspelho => ({
  departamento: null,
  carga_diaria: "08:00",
  dias: [
    { data: "2026-03-02", ocorrencia: null, marcacoes: ["08:00", "12:00", "13:00", "17:00"] },
    { data: "2026-03-03", ocorrencia: null, marcacoes: ["07:00", "12:00", "12:30", "19:30"] },
    { data: "2026-03-04", ocorrencia: null, marcacoes: ["08:00", "12:00", "13:00"] },
  ],
})

test.describe("conferir um dia como está", () => {
  test("marca o dia, registra no histórico e não repete", () => {
    const m = conferirDia(lido(), "2026-03-03", quem)
    expect(m.dias.find((d) => d.data === "2026-03-03")!.conferido).toBe(true)
    expect(m.ajustes!.at(-1)!.tipo).toBe("conferido")
    expect(conferirDia(m, "2026-03-03", quem)).toBe(m)
    expect(conferirDia(lido(), "2026-03-30", quem)).toEqual(lido())
  })

  test("desfazer a conferência tira a marca", () => {
    const m = conferirDia(lido(), "2026-03-03", quem)
    const d = desfazerAjustes(m, "2026-03-03", quem)
    expect(d.dias.find((x) => x.data === "2026-03-03")!.conferido).toBeUndefined()
  })

  test("ajustar um dia conferido mantém a conferência", () => {
    let m = conferirDia(lido(), "2026-03-03", quem)
    m = aplicarAjuste(m, { data: "2026-03-03", marcacoes: ["07:00", "12:00", "13:00", "19:30"], ocorrencia: null }, quem)
    const dia = m.dias.find((d) => d.data === "2026-03-03")!
    expect(dia.ajustado).toBe(true)
    expect(dia.conferido).toBe(true)
  })

  test("nova leitura mantém o conferido e o ajustado", () => {
    let m = conferirDia(lido(), "2026-03-03", quem)
    m = aplicarAjuste(m, { data: "2026-03-04", marcacoes: ["08:00", "12:00", "13:00", "17:00"], ocorrencia: null }, quem)
    const nova = mesclarLeitura(lido(), m)
    const d3 = nova.dias.find((d) => d.data === "2026-03-03")!
    const d4 = nova.dias.find((d) => d.data === "2026-03-04")!
    expect(d3.conferido).toBe(true)
    expect(d3.ajustado).toBeUndefined()
    expect(d4.ajustado).toBe(true)
    expect(d4.marcacoes).toEqual(["08:00", "12:00", "13:00", "17:00"])
  })
})

test.describe("jornada prevista para o recálculo", () => {
  test("jornada configurada vira o quadro do espelho, com o 2º turno", () => {
    const j = jornadaDosDias([
      { dia_semana: 1, hora_inicio: "08:00:00", hora_fim: "12:00:00", hora_inicio_2: "13:00:00", hora_fim_2: "17:00:00" },
      { dia_semana: 5, hora_inicio: "08:00", hora_fim: "14:00" },
    ])
    expect(j[1]).toEqual(["08:00", "12:00", "13:00", "17:00"])
    expect(j[5]).toEqual(["08:00", "14:00"])
    expect(j[0]).toEqual([])
  })

  test("carga do espelho vale de segunda a sexta", () => {
    const j = jornadaDaCarga("08:00")!
    expect(j[1]).toEqual(["08:00"])
    expect(j[6]).toEqual([])
    expect(jornadaDaCarga("08:00 12:00 13:00 17:00")![3]).toEqual(["08:00", "12:00", "13:00", "17:00"])
    expect(jornadaDaCarga(null)).toBeNull()
    expect(jornadaDaCarga("08:00 12:00 13:00")).toBeNull()
  })

  test("ordem: quadro do espelho, jornada do funcionário, carga", () => {
    const configurada = { nome: "Administrativo", dias: [{ dia_semana: 1, hora_inicio: "09:00", hora_fim: "18:00" }] }
    const comQuadro = { ...lido(), jornada: [[], ["08:00", "17:00"], [], [], [], [], []] }
    expect(escolherJornada(comQuadro, configurada)!.fonte).toBe("espelho")
    expect(escolherJornada(lido(), configurada)!.fonte).toBe("jornada")
    expect(escolherJornada(lido(), null)!.fonte).toBe("carga")
    expect(escolherJornada({ ...lido(), carga_diaria: null }, null)).toBeNull()
  })

  test("as marcações ajustadas mudam as horas apuradas", () => {
    const jornada = jornadaDaCarga("08:00")!
    // 03/03: 7h-12h + 12h30-19h30 = 12 h (4 h a mais); 04/03 incompleto (4 h, 4 h a menos).
    const antes = apurarMes(leituraDasMarcacoes(lido(), jornada), REGRAS_PADRAO)
    expect(antes.incompletos).toEqual(["2026-03-04"])
    expect(antes.realizadasFaixa1Min).toBe(0)
    const corrigido = aplicarAjuste(lido(), { data: "2026-03-04", marcacoes: ["08:00", "12:00", "13:00", "17:00"], ocorrencia: null }, quem)
    const depois = apurarMes(leituraDasMarcacoes(corrigido, jornada), REGRAS_PADRAO)
    expect(depois.incompletos).toEqual([])
    expect(depois.realizadasFaixa1Min).toBe(240)
  })
})
