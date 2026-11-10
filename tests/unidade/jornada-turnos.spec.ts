import { expect, test } from "playwright/test"

import {
  dentroDaJornada,
  horarioDoDiaJornada,
  intervaloDoDiaJornada,
  minutosSemanaisJornada,
  type JornadaDia,
} from "@/lib/pessoal-sst-constantes"

const seg: JornadaDia = { dia_semana: 1, hora_inicio: "08:00:00", hora_fim: "12:00:00", hora_inicio_2: "13:00:00", hora_fim_2: "17:00:00" }
const sex: JornadaDia = { dia_semana: 5, hora_inicio: "08:00", hora_fim: "14:00" }
const min = (h: number, m = 0) => h * 60 + m

test.describe("jornada com dois turnos", () => {
  test("carga soma os turnos, sem o intervalo", () => {
    expect(minutosSemanaisJornada([seg, sex])).toBe(8 * 60 + 6 * 60)
    expect(intervaloDoDiaJornada(seg)).toBe(60)
    expect(intervaloDoDiaJornada(sex)).toBe(0)
    expect(horarioDoDiaJornada(seg)).toBe("08:00–12:00 e 13:00–17:00")
    expect(horarioDoDiaJornada(sex)).toBe("08:00–14:00")
  })

  test("alerta só fora dos extremos: o intervalo conta como dentro", () => {
    expect(dentroDaJornada([seg], 1, min(7, 59))).toBe(false)
    expect(dentroDaJornada([seg], 1, min(12, 30))).toBe(true)
    expect(dentroDaJornada([seg], 1, min(16, 59))).toBe(true)
    expect(dentroDaJornada([seg], 1, min(17, 1))).toBe(false)
    expect(dentroDaJornada([sex], 5, min(14, 30))).toBe(false)
    expect(dentroDaJornada([seg], 0, min(10))).toBeNull()
  })
})
