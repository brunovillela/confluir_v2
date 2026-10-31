import { expect, test } from "playwright/test"

import {
  iniciarViagemBot,
  itensDaViagemBot,
  lerDataDigitada,
  lerHorarioDigitado,
  perguntaDoPasso,
  responderViagemBot,
  resumoViagemBot,
  type ContextoViagem,
  type EntradaViagem,
  type EstadoViagemBot,
} from "@/lib/telegram-viagem-fluxo"
import { validarItensViagem } from "@/lib/viagens-constantes"

const HOJE = "2026-10-31"
const ctx: ContextoViagem = {
  hoje: HOJE,
  departamentos: [
    { id: "dep-formacao", nome: "Formação" },
    { id: "dep-juridico", nome: "Jurídico" },
  ],
  antecedenciaDias: 7,
}

/** Aplica as respostas em sequência e devolve o estado final. */
function conversa(inicio: EstadoViagemBot, respostas: EntradaViagem[]): EstadoViagemBot {
  let estado = inicio
  for (const r of respostas) {
    const res = responderViagemBot(estado, r, ctx)
    if (!("estado" in res)) throw new Error(`passo ${estado.passo}: ${JSON.stringify(res)}`)
    estado = res.estado
  }
  return estado
}

test.describe("lerDataDigitada", () => {
  test("dia/mês sem ano: este ano, ou o próximo se já passou", () => {
    expect(lerDataDigitada("12/11", HOJE)).toBe("2026-11-12")
    expect(lerDataDigitada("05/01", HOJE)).toBe("2027-01-05")
  })
  test("com ano de 2 ou 4 dígitos, hoje e amanhã", () => {
    expect(lerDataDigitada("12-11-26", HOJE)).toBe("2026-11-12")
    expect(lerDataDigitada("12/11/2026", HOJE)).toBe("2026-11-12")
    expect(lerDataDigitada("hoje", HOJE)).toBe(HOJE)
    expect(lerDataDigitada("Amanhã", HOJE)).toBe("2026-11-01")
  })
  test("data impossível ou texto não vira data", () => {
    expect(lerDataDigitada("31/02", HOJE)).toBeNull()
    expect(lerDataDigitada("semana que vem", HOJE)).toBeNull()
  })
})

test.describe("lerHorarioDigitado", () => {
  test("até / depois", () => {
    expect(lerHorarioDigitado("até 10h")).toEqual({ criterio: "ate", hora: "10:00" })
    expect(lerHorarioDigitado("depois das 14h30")).toEqual({ criterio: "depois", hora: "14:30" })
    expect(lerHorarioDigitado("a partir de 8:15")).toEqual({ criterio: "depois", hora: "08:15" })
    expect(lerHorarioDigitado("9")).toEqual({ criterio: "ate", hora: "09:00" })
  })
  test("horário inválido", () => {
    expect(lerHorarioDigitado("25h")).toBeNull()
    expect(lerHorarioDigitado("de manhã")).toBeNull()
  })
})

test.describe("conversa do /viagem", () => {
  test("aérea ida e volta com hotel: três itens válidos e departamento do diretor sugerido", () => {
    const fim = conversa(iniciarViagemBot("diretor", "dep-juridico"), [
      { botao: "t:aerea" },
      { texto: "Rio de Janeiro" },
      { texto: "Brasília" },
      { texto: "12/11" },
      { texto: "14/11" },
      { texto: "até 10h" },
      { botao: "sh" },
      { botao: "h:s" },
      { texto: "Reunião no TST" },
    ])
    expect(fim.passo).toBe("departamento")
    const p = perguntaDoPasso(fim, ctx)
    expect(p.botoes?.[0][0]).toEqual({ texto: "✅ Jurídico", dado: "vg:d:dep-juridico" })

    const confirmar = conversa(fim, [{ botao: "d:dep-juridico" }])
    expect(confirmar.passo).toBe("confirmar")
    expect(responderViagemBot(confirmar, { botao: "ok" }, ctx)).toEqual({ confirmar: true })

    const itens = itensDaViagemBot(confirmar.dados)
    expect(itens.map((i) => i.tipo)).toEqual(["passagem", "passagem", "hospedagem"])
    expect(itens[1]).toMatchObject({ origem: "Brasília", destino: "Rio de Janeiro", data: "2026-11-14", saidaHora: null })
    expect(itens[2]).toMatchObject({ cidade: "Brasília", checkin: "2026-11-12", checkout: "2026-11-14" })
    const r = validarItensViagem(itens, HOJE)
    expect("itens" in r && r.itens.length).toBe(3)
    expect("itens" in r && r.itens[0]).toMatchObject({ modal: "aerea", saidaCriterio: "ate", saidaHora: "10:00" })
  })

  test("rodoviária só ida com hotel pergunta o check-out", () => {
    const fim = conversa(iniciarViagemBot("funcionario", null), [
      { botao: "t:rodoviaria" },
      { texto: "Macaé" },
      { texto: "Campos" },
      { texto: "03/11" },
      { botao: "sv" },
      { botao: "sh" },
      { botao: "h:s" },
    ])
    expect(fim.passo).toBe("checkout")
    expect(responderViagemBot(fim, { texto: "03/11" }, ctx)).toHaveProperty("erro")
    const depois = conversa(fim, [{ texto: "05/11" }, { texto: "Visita à base" }])
    expect(depois.passo).toBe("departamento")
    // Funcionário: sem sugestão, lista inteira + "a equipe define".
    const botoes = perguntaDoPasso(depois, ctx).botoes ?? []
    expect(botoes.flat().map((x) => x.dado)).toEqual(["vg:d:dep-formacao", "vg:d:dep-juridico", "vg:d:-"])
    const confirmar = conversa(depois, [{ botao: "d:-" }])
    expect(confirmar.dados.departamentoId).toBeNull()
    expect(resumoViagemBot(confirmar.dados, ctx)).toContain("Em cima da hora")
    expect(validarItensViagem(itensDaViagemBot(confirmar.dados), HOJE)).toHaveProperty("itens")
  })

  test("só hospedagem", () => {
    const fim = conversa(iniciarViagemBot("funcionario", null), [
      { botao: "t:hotel" },
      { texto: "São Paulo" },
      { texto: "20/11" },
      { texto: "22/11" },
      { texto: "Curso" },
      { botao: "d:dep-formacao" },
    ])
    expect(fim.passo).toBe("confirmar")
    const itens = itensDaViagemBot(fim.dados)
    expect(itens).toHaveLength(1)
    expect(itens[0]).toMatchObject({ tipo: "hospedagem", cidade: "São Paulo" })
    expect(resumoViagemBot(fim.dados, ctx)).not.toContain("Em cima da hora")
  })

  test("volta antes da ida, data passada e botão errado viram erro sem sair do passo", () => {
    const ida = conversa(iniciarViagemBot("funcionario", null), [
      { botao: "t:aerea" },
      { texto: "A" },
      { texto: "B" },
      { texto: "12/11" },
    ])
    expect(responderViagemBot(ida, { texto: "10/11" }, ctx)).toHaveProperty("erro")
    const inicio = conversa(iniciarViagemBot("funcionario", null), [{ botao: "t:aerea" }, { texto: "A" }, { texto: "B" }])
    expect(responderViagemBot(inicio, { texto: "31/10/2025" }, ctx)).toHaveProperty("erro")
    expect(responderViagemBot(iniciarViagemBot("funcionario", null), { texto: "avião" }, ctx)).toHaveProperty("erro")
    const depto = conversa(ida, [{ botao: "sv" }, { botao: "sh" }, { botao: "h:n" }, { texto: "x" }])
    expect(responderViagemBot(depto, { botao: "d:outro-tenant" }, ctx)).toHaveProperty("erro")
  })

  test("/cancelar e o botão Cancelar encerram em qualquer passo", () => {
    const meio = conversa(iniciarViagemBot("funcionario", null), [{ botao: "t:aerea" }])
    expect(responderViagemBot(meio, { texto: "/cancelar" }, ctx)).toEqual({ cancelar: true })
    expect(responderViagemBot(meio, { botao: "x" }, ctx)).toEqual({ cancelar: true })
  })

  test("texto da pessoa sai escapado no resumo (HTML do Telegram)", () => {
    const fim = conversa(iniciarViagemBot("funcionario", null), [
      { botao: "t:hotel" },
      { texto: "<b>Recife</b>" },
      { texto: "20/11" },
      { texto: "22/11" },
      { texto: "A & B" },
      { botao: "d:-" },
    ])
    const r = resumoViagemBot(fim.dados, ctx)
    expect(r).toContain("&lt;b&gt;Recife&lt;/b&gt;")
    expect(r).toContain("A &amp; B")
  })
})
