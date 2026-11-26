import { expect, test } from "playwright/test"

import {
  iniciarDiariaBot,
  lerDataDiaria,
  lerQuantidade,
  perguntaDoPassoDiaria,
  quantidadeSugerida,
  responderDiariaBot,
  resumoDiariaBot,
  type ContextoDiaria,
  type EntradaDiaria,
  type EstadoDiariaBot,
} from "@/lib/telegram-diaria-fluxo"

const HOJE = "2026-11-17"
const ctx: ContextoDiaria = {
  hoje: HOJE,
  tipos: [
    { id: "tipo-nacional", nome: "Nacional", valor: 250 },
    { id: "tipo-local", nome: "Local", valor: 80 },
  ],
  remessaAberta: null,
}

/** Aplica as respostas em sequência e devolve o estado final. */
function conversa(respostas: EntradaDiaria[], c: ContextoDiaria = ctx): EstadoDiariaBot {
  let estado = iniciarDiariaBot()
  for (const r of respostas) {
    const res = responderDiariaBot(estado, r, c)
    if (!("estado" in res)) throw new Error(`passo ${estado.passo}: ${JSON.stringify(res)}`)
    estado = res.estado
  }
  return estado
}

test.describe("lerDataDiaria", () => {
  test("dia/mês sem ano: o ano mais perto de hoje (vale data passada)", () => {
    expect(lerDataDiaria("12/11", HOJE)).toBe("2026-11-12")
    expect(lerDataDiaria("20/11", HOJE)).toBe("2026-11-20")
    expect(lerDataDiaria("28/12", "2027-01-05")).toBe("2026-12-28")
    expect(lerDataDiaria("05/01", "2026-12-20")).toBe("2027-01-05")
  })
  test("ano escrito, palavras e datas inválidas", () => {
    expect(lerDataDiaria("12/11/25", HOJE)).toBe("2025-11-12")
    expect(lerDataDiaria("ontem", HOJE)).toBe("2026-11-16")
    expect(lerDataDiaria("Hoje", HOJE)).toBe(HOJE)
    expect(lerDataDiaria("31/02", HOJE)).toBeNull()
    expect(lerDataDiaria("semana que vem", HOJE)).toBeNull()
  })
})

test.describe("lerQuantidade", () => {
  test("inteiro, vírgula e ponto; com a palavra diárias", () => {
    expect(lerQuantidade("2")).toBe(2)
    expect(lerQuantidade("1,5")).toBe(1.5)
    expect(lerQuantidade("2.5 diárias")).toBe(2.5)
    expect(lerQuantidade("0")).toBeNull()
    expect(lerQuantidade("duas")).toBeNull()
  })
})

test.describe("conversa do /diaria", () => {
  test("caminho completo: tipo, período, quantidade sugerida, motivo", () => {
    const fim = conversa([
      { botao: "t:tipo-nacional" },
      { texto: "12/11" },
      { texto: "14/11" },
      { botao: "q:3" },
      { texto: "Reunião em Brasília com pernoite" },
    ])
    expect(fim.passo).toBe("confirmar")
    expect(fim.dados).toEqual({
      tipoId: "tipo-nacional",
      inicio: "2026-11-12",
      termino: "2026-11-14",
      quantidade: 3,
      motivo: "Reunião em Brasília com pernoite",
    })
    const resumo = resumoDiariaBot(fim.dados, ctx)
    expect(resumo).toContain("12/11/2026 a 14/11/2026")
    expect(resumo).toContain("750,00")
    const ok = responderDiariaBot(fim, { botao: "ok:e" }, ctx)
    expect(ok).toEqual({ confirmar: true, enviarRemessa: true })
  })

  test("com projetos em andamento, pergunta o projeto depois do motivo", () => {
    const comProjetos: ContextoDiaria = { ...ctx, projetos: [{ id: "proj-1", titulo: "Congresso 2027" }] }
    const respostas: EntradaDiaria[] = [
      { botao: "t:tipo-local" },
      { botao: "i:-" },
      { texto: "1" },
      { texto: "Plenária do congresso" },
    ]
    const noProjeto = conversa(respostas, comProjetos)
    expect(noProjeto.passo).toBe("projeto")
    const botoes = perguntaDoPassoDiaria(noProjeto, comProjetos).botoes!.flat().map((x) => x.dado)
    expect(botoes).toContain("dg:p:proj-1")
    expect(botoes).toContain("dg:p:-")
    expect(responderDiariaBot(noProjeto, { botao: "p:outro" }, comProjetos)).toHaveProperty("erro")
    const fim = conversa([...respostas, { botao: "p:proj-1" }], comProjetos)
    expect(fim.passo).toBe("confirmar")
    expect(fim.dados.projetoId).toBe("proj-1")
    expect(resumoDiariaBot(fim.dados, comProjetos)).toContain("Projeto: Congresso 2027")
    const semProjeto = conversa([...respostas, { botao: "p:-" }], comProjetos)
    expect(semProjeto.passo).toBe("confirmar")
    expect(semProjeto.dados.projetoId).toBeNull()
  })

  test("a quantidade sugerida é um dia por dia do período", () => {
    expect(quantidadeSugerida({ inicio: "2026-11-12", termino: "2026-11-14" })).toBe(3)
    expect(quantidadeSugerida({ inicio: "2026-11-12", termino: "2026-11-12" })).toBe(1)
    expect(quantidadeSugerida({ inicio: null })).toBeNull()
    const p = perguntaDoPassoDiaria({ passo: "quantidade", dados: { inicio: "2026-11-12", termino: "2026-11-14" } }, ctx)
    expect(p.botoes?.[0]?.[0]?.dado).toBe("dg:q:3")
  })

  test("Sem data pula o término; No mesmo dia repete o início", () => {
    const semData = conversa([{ botao: "t:tipo-local" }, { botao: "i:-" }])
    expect(semData.passo).toBe("quantidade")
    expect(semData.dados.inicio).toBeNull()
    const mesmoDia = conversa([{ botao: "t:tipo-local" }, { botao: "i:o" }, { botao: "f:=" }])
    expect(mesmoDia.dados).toMatchObject({ inicio: "2026-11-16", termino: "2026-11-16" })
  })

  test("erros: tipo fora da lista, término antes do início, quantidade absurda", () => {
    expect(responderDiariaBot(iniciarDiariaBot(), { botao: "t:outro" }, ctx)).toHaveProperty("erro")
    const termino = conversa([{ botao: "t:tipo-local" }, { texto: "14/11" }])
    expect(responderDiariaBot(termino, { texto: "12/11" }, ctx)).toHaveProperty("erro")
    const qtd = conversa([{ botao: "t:tipo-local" }, { botao: "i:-" }])
    expect(responderDiariaBot(qtd, { texto: "200" }, ctx)).toHaveProperty("erro")
    expect(responderDiariaBot(qtd, { texto: "abc" }, ctx)).toHaveProperty("erro")
  })

  test("/cancelar e o botão Cancelar desistem em qualquer passo", () => {
    const meio = conversa([{ botao: "t:tipo-local" }])
    expect(responderDiariaBot(meio, { texto: "/cancelar" }, ctx)).toEqual({ cancelar: true })
    expect(responderDiariaBot(iniciarDiariaBot(), { botao: "x" }, ctx)).toEqual({ cancelar: true })
  })

  test("remessa devolvida: só Salvar na remessa, sem enviar", () => {
    const devolvida: ContextoDiaria = { ...ctx, remessaAberta: { codigo: "RD-1", valorTotal: 160, devolvida: true } }
    const fim = conversa([{ botao: "t:tipo-local" }, { botao: "i:h" }, { botao: "f:=" }, { botao: "q:1" }, { texto: "Visita" }], devolvida)
    const p = perguntaDoPassoDiaria(fim, devolvida)
    expect(p.botoes?.flat().map((x) => x.dado)).not.toContain("dg:ok:e")
    expect(p.texto).toContain("reenvie a remessa pelo painel")
    expect(responderDiariaBot(fim, { botao: "ok:e" }, devolvida)).toHaveProperty("erro")
    expect(responderDiariaBot(fim, { botao: "ok" }, devolvida)).toEqual({ confirmar: true, enviarRemessa: false })
  })

  test("todo callback cabe nos 64 bytes do Telegram", () => {
    const uuid = "123e4567-e89b-12d3-a456-426614174000"
    const p = perguntaDoPassoDiaria(iniciarDiariaBot(), { ...ctx, tipos: [{ id: uuid, nome: "Nacional", valor: 1 }] })
    for (const linha of p.botoes ?? []) for (const x of linha) expect(Buffer.byteLength(x.dado)).toBeLessThanOrEqual(64)
  })
})
