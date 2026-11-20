import { expect, test } from "playwright/test"

import type { JornadaDia } from "../../src/lib/pessoal-sst-constantes"
import {
  apurarUso,
  diasDoPeriodo,
  resumirUso,
  rotuloMotivoUso,
  textoMinutos,
  textoUsoSemMarcacao,
  usoSemMarcacao,
} from "../../src/lib/uso-fora-expediente"

// Seg–sex 08–12 e 13–17.
const jornada: JornadaDia[] = [1, 2, 3, 4, 5].map((d) => ({
  dia_semana: d,
  hora_inicio: "08:00",
  hora_fim: "12:00",
  hora_inicio_2: "13:00",
  hora_fim_2: "17:00",
}))
const semNada = { feriados: new Set<string>(), afastamentos: new Map<string, string>() }
// Horário de São Paulo (UTC−3) → ISO.
const sp = (data: string, hora: string) => new Date(`${data}T${hora}:00-03:00`).toISOString()
const bloco = (data: string, de: string, ate: string) => ({ inicio: sp(data, de), fim: sp(data, ate) })

test.describe("uso fora do expediente", () => {
  test("separa antes, dentro, intervalo e depois num dia de trabalho", () => {
    // 2026-11-18 é quarta.
    const [dia] = apurarUso(
      [bloco("2026-11-18", "07:30", "08:30"), bloco("2026-11-18", "12:10", "12:40"), bloco("2026-11-18", "16:50", "18:05")],
      jornada,
      semNada
    )
    expect(dia.nomeDia).toBe("Quarta")
    expect(dia.situacao).toBeNull()
    expect(dia.fora).toMatchObject({ antes: 30, intervalo: 30, depois: 65 })
    expect(dia.dentro).toBe(40)
    expect(dia.foraTotal).toBe(125)
    expect(dia.considerado).toBe(125)
    expect(dia.trechos.map((t) => t.categoria)).toEqual(["antes", "dentro", "intervalo", "dentro", "depois"])
  })

  test("até 10 minutos num dia de trabalho ficam na tolerância", () => {
    const [dia] = apurarUso([bloco("2026-11-18", "17:00", "17:08")], jornada, semNada)
    expect(dia.foraTotal).toBe(8)
    expect(dia.considerado).toBe(0)
  })

  test("fim de semana, feriado e afastamento contam o dia inteiro, sem tolerância", () => {
    const dias = apurarUso(
      [bloco("2026-11-21", "10:00", "10:05"), bloco("2026-11-20", "09:00", "10:00"), bloco("2026-11-17", "09:00", "09:30")],
      jornada,
      { feriados: new Set(["2026-11-20"]), afastamentos: new Map([["2026-11-17", "Férias"]]) }
    )
    expect(dias.map((d) => [d.data, d.situacao, d.foraTotal, d.considerado])).toEqual([
      ["2026-11-17", "Férias", 30, 30],
      ["2026-11-20", "Feriado", 60, 60],
      ["2026-11-21", "Sem expediente", 5, 5],
    ])
    expect(dias[0].fora.afastado).toBe(30)
    expect(dias[2].fora.sem_expediente).toBe(5)
  })

  test("bloco que passa da meia-noite vai para os dois dias; abas paralelas não contam em dobro", () => {
    const dias = apurarUso(
      [
        { inicio: sp("2026-11-18", "23:30"), fim: sp("2026-11-19", "00:20") },
        { inicio: sp("2026-11-18", "23:40"), fim: sp("2026-11-18", "23:50") },
      ],
      jornada,
      semNada
    )
    expect(dias.map((d) => [d.data, d.fora.depois, d.fora.antes])).toEqual([
      ["2026-11-18", 30, 0],
      ["2026-11-19", 0, 20],
    ])
  })

  test("resume o mês", () => {
    const dias = apurarUso(
      [bloco("2026-11-18", "18:00", "19:00"), bloco("2026-11-19", "17:00", "17:05"), bloco("2026-11-22", "10:00", "10:30")],
      jornada,
      semNada
    )
    const r = resumirUso(dias)
    expect(r).toMatchObject({ foraTotal: 95, considerado: 90, diasComFora: 3, diasAcimaTolerancia: 2, ultimoDiaFora: "2026-11-22" })
    expect(textoMinutos(r.considerado)).toBe("1h30")
    expect(textoMinutos(45)).toBe("45 min")
    expect(textoMinutos(0)).toBe("—")
  })

  test("dias de um afastamento cortados ao mês", () => {
    expect(diasDoPeriodo("2026-10-30", "2026-11-02", "2026-11-01", "2026-11-30")).toEqual(["2026-11-01", "2026-11-02"])
    expect(diasDoPeriodo("2026-11-05", null, "2026-11-01", "2026-11-30")).toEqual(["2026-11-05"])
  })

  test("uso fora do horário sem marcação que o cubra", () => {
    const [dia] = apurarUso(
      [bloco("2026-11-18", "07:30", "08:30"), bloco("2026-11-18", "12:10", "12:40"), bloco("2026-11-18", "17:00", "18:30")],
      jornada,
      semNada
    )
    // Batidas 08:00–12:00 e 13:00–18:00: as 17h–18h estão batidas; sobra 07:30–08:00, o almoço e 18:00–18:30.
    const r = usoSemMarcacao(dia, ["08:00", "12:00", "13:00", "18:00"])
    expect(r.trechos).toEqual([[450, 480], [730, 760], [1080, 1110]])
    expect(r.minutos).toBe(90)
    expect(textoUsoSemMarcacao(r)).toBe("1h30 (07:30–08:00, 12:10–12:40, 18:00–18:30)")
    // Batidas cobrindo tudo (entrada 07:00, almoço sem saída, saída 19:00): nada sobra.
    expect(usoSemMarcacao(dia, ["07:00", "19:00"]).minutos).toBe(0)
    // Sábado sem batida: o uso inteiro conta.
    const [sab] = apurarUso([bloco("2026-11-21", "10:00", "10:45")], jornada, semNada)
    expect(usoSemMarcacao(sab, []).minutos).toBe(45)
    // Batida ímpar: o último horário sozinho não cobre nada.
    expect(usoSemMarcacao(sab, ["09:00"]).minutos).toBe(45)
  })

  test("motivo informado em uma frase", () => {
    expect(rotuloMotivoUso({ motivo: "combinado", detalhe: null })).toBe("Combinado com a chefia")
    expect(rotuloMotivoUso({ motivo: "urgencia", detalhe: "fechamento da folha" })).toBe("Urgência: fechamento da folha")
  })
})
