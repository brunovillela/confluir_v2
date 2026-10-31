import { expect, test } from "playwright/test"

import {
  arquivoDaMensagem,
  dadoCabe,
  iniciarArquivoBot,
  lancamentoDoArquivo,
  lerDataDoDocumento,
  lerDataHora,
  LIMITE_BYTES_ARQUIVO,
  normalizarLeitura,
  perguntaDoPassoArquivo,
  problemaDoArquivo,
  responderArquivoBot,
  resumoArquivoBot,
  type ArquivoTelegram,
  type ContextoArquivo,
  type EntradaArquivo,
  type EstadoArquivoBot,
  type TipoArquivo,
} from "@/lib/telegram-arquivo-fluxo"

const HOJE = "2026-10-31"
const EU = { id: "3f2a9c1e-7b4d-4e8a-9f10-2c3d4e5f6a7b", nome: "Ana Beatriz Nogueira" }
const OUTRA = { id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d", nome: "Carlos Eduardo Simões" }
const TIPO_CRECHE = "11111111-2222-4333-8444-555555555555"
const TIPO_OTICA = "66666666-7777-4888-9999-aaaaaaaaaaaa"
const CARRO = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff"

const ctx: ContextoArquivo = {
  hoje: HOJE,
  usuario: EU,
  tiposReembolso: [
    { id: TIPO_CRECHE, nome: "Auxílio creche" },
    { id: TIPO_OTICA, nome: "Ótica" },
  ],
  veiculos: [{ id: CARRO, placa: "RJA1B23", rotulo: "RJA1B23 · Onix" }],
}

const ARQ: ArquivoTelegram = { fileId: "AgACAgEAAx", nome: "foto.jpg", mime: "image/jpeg", tamanho: 200_000 }
const TODOS: TipoArquivo[] = ["reembolso", "abastecimento", "atestado"]

function conversa(inicio: EstadoArquivoBot, respostas: EntradaArquivo[]): EstadoArquivoBot {
  let e = inicio
  for (const r of respostas) {
    const res = responderArquivoBot(e, r, ctx)
    if (!("estado" in res)) throw new Error(`resposta ${JSON.stringify(r)} no passo ${e.passo}: ${JSON.stringify(res)}`)
    e = res.estado
  }
  return e
}

const textos = (p: { botoes?: { dado: string }[][] }) => (p.botoes ?? []).flat().map((x) => x.dado)

test.describe("arquivo da mensagem", () => {
  test("foto: pega a maior resolução que cabe no limite", () => {
    const a = arquivoDaMensagem({
      photo: [
        { file_id: "p", width: 90, height: 120, file_size: 2_000 },
        { file_id: "m", width: 900, height: 1200, file_size: 150_000 },
        { file_id: "g", width: 3000, height: 4000, file_size: LIMITE_BYTES_ARQUIVO + 1 },
      ],
    })
    expect(a).toEqual({ fileId: "m", nome: "foto.jpg", mime: "image/jpeg", tamanho: 150_000 })
  })

  test("documento: PDF pelo mime ou pela extensão", () => {
    expect(arquivoDaMensagem({ document: { file_id: "d", file_name: "recibo.pdf", mime_type: "application/pdf", file_size: 10 } })?.mime).toBe(
      "application/pdf"
    )
    expect(arquivoDaMensagem({ document: { file_id: "d", file_name: "Cupom.JPG", file_size: 10 } })?.mime).toBe("image/jpeg")
    expect(arquivoDaMensagem({ text: "oi" })).toBeNull()
  })

  test("recusa formato estranho e arquivo grande", () => {
    expect(problemaDoArquivo({ ...ARQ, mime: "application/zip" })).toContain("foto ou um PDF")
    expect(problemaDoArquivo({ ...ARQ, tamanho: LIMITE_BYTES_ARQUIVO + 1 })).toContain("5 MB")
    expect(problemaDoArquivo(ARQ)).toBeNull()
    expect(problemaDoArquivo({ ...ARQ, tamanho: null })).toBeNull()
  })
})

test.describe("leitura da IA", () => {
  test("higieniza números, datas e tipo", () => {
    const l = normalizarLeitura({
      tipo: "Abastecimento",
      valor: "245,90",
      litros: "41.01",
      data: "30/10/2026",
      hora: "9:05",
      placa: "rja-1b23",
      hodometro: "48.350",
      cid: "j11.1 ",
      dias: 2.5,
    })
    expect(l.tipo).toBe("abastecimento")
    expect(l.valor).toBe(245.9)
    expect(l.litros).toBe(41.01)
    expect(l.data).toBe("2026-10-30")
    expect(l.hora).toBe("09:05")
    expect(l.placa).toBe("RJA1B23")
    expect(l.hodometro).toBe(48350)
    expect(l.cid).toBe("J11.1")
    expect(l.dias).toBeNull()
  })

  test("lixo vira nulo; tipo desconhecido vira null", () => {
    const l = normalizarLeitura({ tipo: "outro", valor: "abc", data: "31/02/2026", dias: 0 })
    expect(l.tipo).toBeNull()
    expect(l.valor).toBeNull()
    expect(l.data).toBeNull()
    expect(l.dias).toBeNull()
    expect(normalizarLeitura(undefined).tipo).toBeNull()
  })
})

test.describe("datas digitadas", () => {
  test("documento já emitido: sem ano, data futura cai no ano anterior", () => {
    expect(lerDataDoDocumento("30/10", HOJE)).toBe("2026-10-30")
    expect(lerDataDoDocumento("15/12", HOJE)).toBe("2025-12-15")
    expect(lerDataDoDocumento("ontem", HOJE)).toBe("2026-10-30")
    expect(lerDataDoDocumento("15/12", HOJE, 60)).toBe("2026-12-15")
    expect(lerDataDoDocumento("31/02", HOJE)).toBeNull()
  })

  test("data e hora", () => {
    expect(lerDataHora("30/10 14:20", HOJE)).toBe("2026-10-30T14:20")
    expect(lerDataHora("30/10/2026 9h", HOJE)).toBe("2026-10-30T09:00")
    expect(lerDataHora("30/10", HOJE)).toBe("2026-10-30T12:00")
    expect(lerDataHora("30/10 25:00", HOJE)).toBeNull()
  })
})

test.describe("reembolso do ACT", () => {
  const lido = normalizarLeitura({
    tipo: "reembolso",
    valor: 480,
    data: "2026-10-05",
    emitente: "Creche Pequeno Príncipe",
    descricao: "Mensalidade de outubro",
  })

  test("deduzido pela IA: pergunta só o tipo do reembolso e confirma", () => {
    const e0 = iniciarArquivoBot(ARQ, lido, TODOS, false, ctx)
    expect(e0.passo).toBe("tipo_reembolso")
    expect(textos(perguntaDoPassoArquivo(e0, ctx))).toContain(`ar:tr:${TIPO_CRECHE}`)
    const e1 = conversa(e0, [{ botao: `tr:${TIPO_CRECHE}` }])
    expect(e1.passo).toBe("confirmar")
    const resumo = resumoArquivoBot(e1.dados, ctx)
    expect(resumo).toContain("Auxílio creche")
    expect(resumo).toContain("480,00")
    expect(resumo).toContain("Mensalidade de outubro (Creche Pequeno Príncipe)")
    expect(responderArquivoBot(e1, { botao: "ok" }, ctx)).toEqual({ confirmar: true })
    expect(lancamentoDoArquivo(e1.dados)).toEqual({
      tipo: "reembolso",
      tipoReembolsoId: TIPO_CRECHE,
      valor: 480,
      descricao: "Mensalidade de outubro (Creche Pequeno Príncipe)",
    })
  })

  test("um tipo só: nem pergunta", () => {
    const um = { ...ctx, tiposReembolso: [ctx.tiposReembolso[0]] }
    expect(iniciarArquivoBot(ARQ, lido, TODOS, false, um).passo).toBe("confirmar")
  })

  test("Corrigir → valor digitado volta à confirmação", () => {
    const e1 = conversa(iniciarArquivoBot(ARQ, lido, TODOS, false, ctx), [
      { botao: `tr:${TIPO_CRECHE}` },
      { botao: "c" },
      { botao: "c:valor" },
    ])
    expect(e1.passo).toBe("editar")
    expect(responderArquivoBot(e1, { texto: "abc" }, ctx)).toHaveProperty("erro")
    const e2 = conversa(e1, [{ texto: "R$ 1.250,40" }])
    expect(e2.passo).toBe("confirmar")
    expect(e2.dados.valor).toBe(1250.4)
  })

  test("sem valor lido: pergunta o valor", () => {
    const e = iniciarArquivoBot(ARQ, { ...lido, valor: null }, TODOS, false, ctx)
    const e1 = conversa(e, [{ botao: `tr:${TIPO_OTICA}` }])
    expect(e1.passo).toBe("editar")
    expect(e1.dados.campo).toBe("valor")
  })
})

test.describe("abastecimento", () => {
  const lido = normalizarLeitura({
    tipo: "abastecimento",
    valor: 245.9,
    litros: 41.01,
    data: "2026-10-30",
    hora: "14:20",
    posto: "Posto Ipiranga Centro",
    cidade: "Macaé",
    combustivel: "Gasolina comum",
    placa: "",
  })

  test("sem placa: pede o veículo e o km; o condutor é quem mandou", () => {
    const e0 = iniciarArquivoBot(ARQ, lido, TODOS, false, ctx)
    expect(e0.passo).toBe("veiculo")
    const e1 = conversa(e0, [{ texto: "rja 1b23" }])
    expect(e1.passo).toBe("editar")
    expect(e1.dados.campo).toBe("hodometro")
    const e2 = conversa(e1, [{ texto: "48.350 km" }])
    expect(e2.passo).toBe("confirmar")
    expect(resumoArquivoBot(e2.dados, ctx)).toContain(EU.nome)
    expect(lancamentoDoArquivo(e2.dados)).toEqual({
      tipo: "abastecimento",
      veiculoId: CARRO,
      posto: "POSTO IPIRANGA CENTRO",
      cidade: "MACAÉ",
      combustivel: "GASOLINA COMUM",
      litros: 41.01,
      valor: 245.9,
      hodometro: 48350,
      dataHora: "2026-10-30T14:20:00-03:00",
    })
  })

  test("placa da frota sugerida pelo servidor pula a pergunta do veículo", () => {
    const e0 = iniciarArquivoBot(ARQ, lido, TODOS, false, ctx, { veiculoSugeridoId: CARRO })
    expect(e0.passo).toBe("editar")
    expect(e0.dados.campo).toBe("hodometro")
  })

  test("placa digitada fora da frota dá erro", () => {
    const e0 = iniciarArquivoBot(ARQ, lido, TODOS, false, ctx)
    expect(responderArquivoBot(e0, { texto: "ZZZ9Z99" }, ctx)).toHaveProperty("erro")
  })

  test("já lançado: não oferece Confirmar nem aceita ok", () => {
    const e0 = iniciarArquivoBot(ARQ, { ...lido, hodometro: 48350 }, TODOS, false, ctx, { veiculoSugeridoId: CARRO })
    const dup: EstadoArquivoBot = { ...e0, dados: { ...e0.dados, duplicado: true } }
    expect(textos(perguntaDoPassoArquivo(dup, ctx))).not.toContain("ar:ok")
    expect(responderArquivoBot(dup, { botao: "ok" }, ctx)).toHaveProperty("erro")
  })

  test("data do cupom no futuro não é aceita", () => {
    const e0 = iniciarArquivoBot(ARQ, { ...lido, data: "2026-11-05" }, TODOS, false, ctx, { veiculoSugeridoId: CARRO })
    const e1 = conversa(e0, [{ texto: "48350" }])
    expect(e1.dados.campo).toBe("data")
    expect(responderArquivoBot(e1, { texto: "05/11/2026" }, ctx)).toHaveProperty("erro")
  })
})

test.describe("atestado", () => {
  const lido = normalizarLeitura({
    tipo: "atestado",
    inicio: "2026-10-29",
    dias: 2,
    paciente: "Carlos Eduardo Simões",
    cid: "J11",
  })

  test("funcionário: o atestado é o dele; o resumo não mostra o CID", () => {
    const e0 = iniciarArquivoBot(ARQ, lido, ["reembolso", "atestado"], false, ctx)
    expect(e0.passo).toBe("confirmar")
    const resumo = resumoArquivoBot(e0.dados, ctx)
    expect(resumo).toContain(EU.nome)
    expect(resumo).toContain("29/10/2026 a 30/10/2026")
    expect(resumo).not.toContain("J11")
    const l = lancamentoDoArquivo(e0.dados)
    expect(l).toMatchObject({ tipo: "atestado", funcionarioId: EU.id, termino: "2026-10-30", dias: 2, cid: "J11" })
    // Sem gestão de pessoal, não há como trocar o funcionário.
    expect(textos(perguntaDoPassoArquivo({ passo: "corrigir", dados: e0.dados }, ctx))).not.toContain("ar:c:f")
  })

  test("gestão: escolhe entre o sugerido, o próprio e a busca", () => {
    const e0 = iniciarArquivoBot(ARQ, lido, TODOS, true, ctx, { sugestaoFuncionario: OUTRA })
    expect(e0.passo).toBe("funcionario")
    expect(textos(perguntaDoPassoArquivo(e0, ctx))).toEqual(
      expect.arrayContaining([`ar:f:${OUTRA.id}`, "ar:f:eu", "ar:fo"])
    )
    const e1 = conversa(e0, [{ botao: `f:${OUTRA.id}` }])
    expect(e1.passo).toBe("confirmar")
    expect(lancamentoDoArquivo(e1.dados)).toMatchObject({ funcionarioId: OUTRA.id })
  })

  test("gestão: nome digitado pede a busca ao servidor", () => {
    const e0 = iniciarArquivoBot(ARQ, lido, TODOS, true, ctx)
    const r = responderArquivoBot(conversa(e0, [{ botao: "fo" }]), { texto: "carlos" }, ctx)
    expect(r).toHaveProperty("buscarFuncionario", "carlos")
    expect(responderArquivoBot(e0, { texto: "ab" }, ctx)).toHaveProperty("erro")
    // Botão de alguém fora das opções não vale.
    expect(responderArquivoBot(e0, { botao: `f:${"0".repeat(36)}` }, ctx)).toHaveProperty("erro")
  })

  test("acompanhamento: Sim pede o nome; CID só vai se a IA leu um atestado", () => {
    const e0 = iniciarArquivoBot(ARQ, lido, ["atestado"], false, ctx)
    const e1 = conversa(e0, [{ botao: "c" }, { botao: "c:ac" }, { botao: "ac:s" }])
    expect(e1.dados.campo).toBe("nome_acompanhado")
    const e2 = conversa(e1, [{ texto: "Pedro (filho)" }])
    expect(e2.passo).toBe("confirmar")
    expect(lancamentoDoArquivo(e2.dados)).toMatchObject({ acompanhamento: true, nomeAcompanhado: "Pedro (filho)" })

    const semTipo = iniciarArquivoBot(ARQ, { ...lido, tipo: null }, ["atestado"], false, ctx)
    expect(lancamentoDoArquivo(semTipo.dados)).toMatchObject({ cid: null })
  })
})

test.describe("tipo e permissões", () => {
  test("não reconhecido: pergunta o tipo só com o que a pessoa pode", () => {
    const e0 = iniciarArquivoBot(ARQ, normalizarLeitura({ tipo: "outro" }), ["reembolso", "atestado"], false, ctx)
    expect(e0.passo).toBe("tipo")
    const p = perguntaDoPassoArquivo(e0, ctx)
    expect(p.texto).toContain("Não reconheci")
    expect(textos(p)).toEqual(["ar:t:r", "ar:t:t", "ar:x"])
    expect(responderArquivoBot(e0, { botao: "t:a" }, ctx)).toHaveProperty("erro")
  })

  test("tipo lido sem permissão: avisa e oferece os permitidos", () => {
    const e0 = iniciarArquivoBot(ARQ, normalizarLeitura({ tipo: "atestado", dias: 1 }), ["reembolso", "abastecimento"], false, ctx)
    expect(e0.passo).toBe("tipo")
    expect(perguntaDoPassoArquivo(e0, ctx).texto).toContain("não lança por aqui")
  })

  test("Corrigir → mudar o tipo reaproveita a leitura", () => {
    const lido = normalizarLeitura({ tipo: "reembolso", valor: 245.9, descricao: "Combustível", posto: "Posto X", litros: 41, combustivel: "Etanol", data: "2026-10-30" })
    const e0 = iniciarArquivoBot(ARQ, lido, TODOS, false, ctx, { veiculoSugeridoId: CARRO })
    const e1 = conversa(e0, [{ botao: `tr:${TIPO_CRECHE}` }, { botao: "c" }, { botao: "c:tipo" }, { botao: "t:a" }])
    expect(e1.dados.tipo).toBe("abastecimento")
    expect(e1.dados.campo).toBe("hodometro")
  })

  test("cancelar por botão ou /cancelar; outro comando pede a resposta", () => {
    const e0 = iniciarArquivoBot(ARQ, normalizarLeitura({}), TODOS, false, ctx)
    expect(responderArquivoBot(e0, { botao: "x" }, ctx)).toEqual({ cancelar: true })
    expect(responderArquivoBot(e0, { texto: "/cancelar" }, ctx)).toEqual({ cancelar: true })
    expect(responderArquivoBot(e0, { texto: "/ferias" }, ctx)).toHaveProperty("erro")
  })

  test("todo callback_data cabe nos 64 bytes", () => {
    const estados: EstadoArquivoBot[] = [
      iniciarArquivoBot(ARQ, normalizarLeitura({}), TODOS, true, ctx),
      { passo: "tipo_reembolso", dados: { arquivo: ARQ, lido: normalizarLeitura({}), permitidos: TODOS, atestadoDeOutros: true } },
      { passo: "veiculo", dados: { arquivo: ARQ, lido: normalizarLeitura({}), permitidos: TODOS, atestadoDeOutros: true } },
      {
        passo: "funcionario",
        dados: { arquivo: ARQ, lido: normalizarLeitura({}), permitidos: TODOS, atestadoDeOutros: true, sugestaoFuncionario: OUTRA },
      },
    ]
    for (const e of estados) for (const d of textos(perguntaDoPassoArquivo(e, ctx))) expect(dadoCabe(d)).toBe(true)
  })
})
