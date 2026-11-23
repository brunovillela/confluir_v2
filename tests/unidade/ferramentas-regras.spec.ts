import { expect, test } from "playwright/test"

import { diasEntre, fraseDaRegra, prazoDoItem, rotuloDias, validarRegra } from "../../src/lib/ferramentas-regras"

test("validar regra: combinações e parâmetros", () => {
  expect(validarRegra({ gatilho: "tarefa_atrasou", acao: "prioridade_alta", pessoaId: null, etiquetaId: null })).toBeNull()
  expect(validarRegra({ gatilho: "tarefa_criada", acao: "demanda_feito", pessoaId: null, etiquetaId: null })).toBe("Essa ação não combina com esse gatilho.")
  expect(validarRegra({ gatilho: "tarefa_criada", acao: "atribuir", pessoaId: null, etiquetaId: null })).toBe("Escolha a pessoa.")
  expect(validarRegra({ gatilho: "tarefa_atrasou", acao: "etiquetar", pessoaId: null, etiquetaId: null })).toBe("Escolha a etiqueta.")
  expect(validarRegra({ gatilho: "outro", acao: "avisar", pessoaId: "p", etiquetaId: null })).toBe("Escolha quando a regra age.")
})

test("frase da regra", () => {
  expect(fraseDaRegra({ gatilho: "tarefa_atrasou", acao: "prioridade_alta" })).toBe(
    "Quando uma tarefa atrasar, em qualquer demanda ou avulsa, mudar a prioridade para Alta."
  )
  expect(fraseDaRegra({ gatilho: "tarefa_criada", acao: "atribuir", demandaNome: "Congresso", pessoaNome: "Ana" })).toBe(
    'Quando uma tarefa for criada, na demanda "Congresso", atribuir a tarefa sem responsável a Ana.'
  )
})

test("prazos relativos dos modelos", () => {
  expect(prazoDoItem("2026-12-10", -10)).toBe("2026-11-30")
  expect(prazoDoItem("2026-12-10", 0)).toBe("2026-12-10")
  expect(rotuloDias(-10)).toBe("10 dias antes")
  expect(rotuloDias(1)).toBe("1 dia depois")
  expect(rotuloDias(0)).toBe("no dia")
  expect(diasEntre("2026-12-10", "2026-11-30")).toBe(-10)
})
