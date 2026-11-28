import { expect, test } from "playwright/test"

import {
  iniciarChecklistBot,
  itensParaMarcar,
  lerKm,
  perguntaDoPassoChecklist,
  respostasParaGravar,
  responderChecklistBot,
  type ContextoChecklist,
  type EntradaChecklist,
  type EstadoChecklistBot,
} from "@/lib/telegram-checklist-fluxo"

const ctx: ContextoChecklist = {
  veiculo: "ABC1D23 · Fiat Cronos",
  kmAnterior: 40000,
  apontamentos: [],
  itens: [
    { id: "pneus", categoria: "Pneus e Rodas", verificar: "calibragem, desgaste" },
    { id: "luzes", categoria: "Iluminação", verificar: null },
    { id: "carga", categoria: "Carroceria", verificar: null },
  ],
}

/** Aplica as respostas em sequência e devolve o estado final. */
function conversa(respostas: EntradaChecklist[], c: ContextoChecklist = ctx): EstadoChecklistBot {
  let estado = iniciarChecklistBot()
  for (const r of respostas) {
    const res = responderChecklistBot(estado, r, c)
    if (!("estado" in res)) throw new Error(`esperava estado, veio ${JSON.stringify(res)}`)
    estado = res.estado
  }
  return estado
}

test("lê o km com ponto, espaço ou 'km'", () => {
  expect(lerKm("45.320")).toBe(45320)
  expect(lerKm("45320 km")).toBe(45320)
  expect(lerKm(" 45 320 ")).toBe(45320)
  expect(lerKm("quarenta")).toBeNull()
  expect(lerKm("")).toBeNull()
})

test("km menor que o último é recusado", () => {
  const r = responderChecklistBot(iniciarChecklistBot(), { texto: "39000" }, ctx)
  expect("erro" in r && r.erro).toContain("40.000 km")
})

test("salto grande de km pede confirmação; Corrigir volta ao km", () => {
  const alto = conversa([{ texto: "60000" }])
  expect(alto.passo).toBe("km_alto")
  const corrigir = responderChecklistBot(alto, { botao: "km:n" }, ctx)
  expect("estado" in corrigir && corrigir.estado.passo).toBe("km")
  const seguir = responderChecklistBot(alto, { botao: "km:s" }, ctx)
  expect("estado" in seguir && seguir.estado.passo).toBe("itens")
})

test("tudo em ordem: km, concluir e o resumo; grava tudo conforme", () => {
  const e = conversa([{ texto: "41200" }, { botao: "ok" }])
  expect(e.passo).toBe("confirmar")
  expect(perguntaDoPassoChecklist(e, ctx).texto).toContain("Tudo em ordem")
  expect(responderChecklistBot(e, { botao: "salvar" }, ctx)).toEqual({ salvar: true })
  const g = respostasParaGravar(e.dados, ctx)
  expect(Object.values(g.itens).map((i) => i.situacao)).toEqual(["conforme", "conforme", "conforme"])
})

test("tocar no item alterna ✅ → ⚠️ → ➖ e reescreve a lista", () => {
  const um = responderChecklistBot(conversa([{ texto: "41200" }]), { botao: "t:1" }, ctx)
  expect("estado" in um && um.editar).toBe(true)
  const e1 = conversa([{ texto: "41200" }, { botao: "t:1" }])
  expect(e1.dados.itens?.luzes).toBe("nao_conforme")
  expect(perguntaDoPassoChecklist(e1, ctx).botoes?.at(-2)?.[0].texto).toContain("1 com problema")
  const e2 = conversa([{ texto: "41200" }, { botao: "t:2" }, { botao: "t:2" }])
  expect(e2.dados.itens?.carga).toBe("nao_aplica")
  const e3 = conversa([{ texto: "41200" }, { botao: "t:2" }, { botao: "t:2" }, { botao: "t:2" }])
  expect(e3.dados.itens?.carga).toBe("conforme")
})

test("item com problema pede a descrição antes de confirmar", () => {
  const e = conversa([{ texto: "41200" }, { botao: "t:0" }, { botao: "ok" }])
  expect(e.passo).toBe("descricao")
  const curto = responderChecklistBot(e, { texto: "ok" }, ctx)
  expect("erro" in curto).toBe(true)
  const fim = conversa([{ texto: "41200" }, { botao: "t:0" }, { botao: "ok" }, { texto: "Pneu traseiro careca" }])
  expect(fim.passo).toBe("confirmar")
  const g = respostasParaGravar(fim.dados, ctx)
  expect(g.itens.pneus).toEqual({ situacao: "nao_conforme", observacao: "Pneu traseiro careca" })
})

test("apontamento aberto: Continua tira o item da lista; Foi resolvido mantém", () => {
  const c: ContextoChecklist = {
    ...ctx,
    apontamentos: [{ id: "ap1", itemId: "luzes", categoria: "Iluminação", descricao: "farol queimado", desde: "2026-11-01T10:00:00Z" }],
  }
  const km = conversa([{ texto: "41200" }], c)
  expect(km.passo).toBe("apontamento")
  expect(perguntaDoPassoChecklist(km, c).texto).toContain("farol queimado")
  const continua = conversa([{ texto: "41200" }, { botao: "ap:p" }], c)
  expect(itensParaMarcar(continua.dados, c).map((i) => i.id)).toEqual(["pneus", "carga"])
  const g = respostasParaGravar(conversa([{ texto: "41200" }, { botao: "ap:p" }, { botao: "ok" }], c).dados, c)
  expect(g.apontamentos.ap1.resposta).toBe("permanece")
  expect(g.itens.luzes).toBeUndefined()
  const resolvido = conversa([{ texto: "41200" }, { botao: "ap:s" }], c)
  expect(itensParaMarcar(resolvido.dados, c).map((i) => i.id)).toEqual(["pneus", "luzes", "carga"])
})

test("Cancelar e /cancelar desistem em qualquer passo", () => {
  expect(responderChecklistBot(iniciarChecklistBot(), { texto: "/cancelar" }, ctx)).toEqual({ cancelar: true })
  expect(responderChecklistBot(conversa([{ texto: "41200" }]), { botao: "cancelar" }, ctx)).toEqual({ cancelar: true })
})

test("carro sem km registrado aceita qualquer km", () => {
  const c = { ...ctx, kmAnterior: null }
  expect(conversa([{ texto: "12" }], c).passo).toBe("itens")
})
