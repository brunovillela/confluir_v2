import { expect, test } from "playwright/test"

import { ordenarTarefas, type PrioridadeTarefa } from "../../src/lib/nucleo-constantes"

const t = (titulo: string, prazo: string | null, prioridade: PrioridadeTarefa, concluido = false) => ({
  titulo,
  prazo,
  prioridade,
  concluido,
})

const lista = [
  t("baixa cedo", "2026-11-20", "baixa"),
  t("alta sem prazo", null, "alta"),
  t("media tarde", "2026-12-30", "media"),
  t("alta tarde", "2026-12-10", "alta"),
  t("concluída alta", "2026-11-01", "alta", true),
  t("media cedo", "2026-11-25", "media"),
]

test("por prazo: o mais próximo primeiro, sem prazo e concluídas no fim", () => {
  expect(ordenarTarefas(lista, "prazo").map((x) => x.titulo)).toEqual([
    "baixa cedo",
    "media cedo",
    "alta tarde",
    "media tarde",
    "alta sem prazo",
    "concluída alta",
  ])
})

test("por prioridade: alta, média, baixa; dentro do nível, o prazo", () => {
  expect(ordenarTarefas(lista, "prioridade").map((x) => x.titulo)).toEqual([
    "alta tarde",
    "alta sem prazo",
    "media cedo",
    "media tarde",
    "baixa cedo",
    "concluída alta",
  ])
})

test("não mexe na lista recebida", () => {
  const copia = [...lista]
  ordenarTarefas(lista, "prioridade")
  expect(lista).toEqual(copia)
})
