import { expect, test } from "playwright/test"

import {
  janelaConflitante,
  paresSobrepostos,
  type Janela,
} from "@/lib/espacos-constantes"

const j = (
  dia: number,
  inicio: string,
  termino: string,
  modo: Janela["modo"] = "livre",
  rotulo: string | null = null
): Janela & { id: string } => ({
  id: `${dia}-${inicio}-${termino}-${modo}`,
  dia_semana: dia,
  hora_inicio: `${inicio}:00`,
  hora_termino: `${termino}:00`,
  modo,
  slot_minutos: modo === "slots" ? 60 : null,
  rotulo,
})

// O Teatro em produção (31/10/2026): dia inteiro e os três turnos por cima.
const teatroSegunda = [
  j(1, "08:00", "21:30", "livre", "Dia inteiro"),
  j(1, "08:00", "12:59"),
  j(1, "13:00", "17:59"),
  j(1, "18:00", "21:30"),
]

test.describe("janelas de horário livre não se sobrepõem", () => {
  test("o caso do Teatro: o dia inteiro cruza os três turnos, os turnos não se cruzam", () => {
    const pares = paresSobrepostos(teatroSegunda)
    expect(pares).toHaveLength(3)
    expect(pares.every(([a]) => a.rotulo === "Dia inteiro")).toBe(true)
  })

  test("faixa livre nova que cruza outra é recusada e diz qual", () => {
    const c = janelaConflitante(j(1, "12:00", "14:00"), teatroSegunda)
    expect(c?.rotulo).toBe("Dia inteiro")
  })

  test("encostar não é cruzar", () => {
    const existentes = [j(2, "08:00", "13:00")]
    expect(janelaConflitante(j(2, "13:00", "18:00"), existentes)).toBeUndefined()
  })

  test("outro dia não conflita", () => {
    expect(janelaConflitante(j(3, "08:00", "21:30"), teatroSegunda)).toBeUndefined()
  })

  test("slots × livre também é recusado; slots × slots continua permitido", () => {
    expect(janelaConflitante(j(1, "09:00", "11:00", "slots"), teatroSegunda)).toBeDefined()
    const slots = [j(4, "08:00", "18:00", "slots")]
    expect(janelaConflitante(j(4, "13:00", "18:00", "slots"), slots)).toBeUndefined()
    expect(paresSobrepostos([...slots, j(4, "13:00", "18:00", "slots")])).toHaveLength(0)
  })
})
