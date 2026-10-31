import { expect, test } from "playwright/test"

import {
  botoesPendencia,
  COMANDOS_BOT,
  comandosParaOTelegram,
  contrachequeSugerido,
  dadoPendencia,
  lerDadoPendencia,
  lerRefDoMotivo,
  linhasDaAjuda,
  mensagemComPainel,
  pedidoDeMotivo,
  TEXTO_ABRIR_NO_PAINEL,
  TIPOS_PENDENCIA,
  urlDeBotaoValida,
  type TipoPendencia,
} from "@/lib/telegram-pendencias-fluxo"

const ID = "3f2a9c1e-7b4d-4e8a-9f10-2c3d4e5f6a7b"
const TIPOS = Object.keys(TIPOS_PENDENCIA) as TipoPendencia[]

test.describe("callback_data das pendências", () => {
  test("cabe nos 64 bytes do Telegram e volta igual", () => {
    for (const tipo of TIPOS) {
      for (const acao of ["a", "d"] as const) {
        const dado = dadoPendencia(tipo, acao, ID)
        expect(new TextEncoder().encode(dado).length).toBeLessThanOrEqual(64)
        expect(lerDadoPendencia(dado)).toEqual({ tipo, acao, id: ID })
      }
    }
  })

  test("não confunde com o botão das ordens nem com lixo", () => {
    expect(lerDadoPendencia(`ord:a:${ID}`)).toBeNull()
    expect(lerDadoPendencia(`pd:xx:a:${ID}`)).toBeNull()
    expect(lerDadoPendencia(`pd:fe:z:${ID}`)).toBeNull()
    expect(lerDadoPendencia("pd:fe:a:123")).toBeNull()
    expect(lerDadoPendencia(`pd:fe:a:${ID}x`)).toBeNull()
  })

  test("id em maiúsculas é normalizado", () => {
    expect(lerDadoPendencia(`pd:FA:D:${ID.toUpperCase()}`)).toEqual({ tipo: "fa", acao: "d", id: ID })
  })
})

test.describe("botões de cada tipo", () => {
  test("férias só autoriza (o painel não devolve férias); os outros têm as duas ações", () => {
    expect(botoesPendencia("fe", ID)).toEqual([[{ texto: "✅ Autorizar", dado: `pd:fe:a:${ID}` }]])
    for (const tipo of TIPOS.filter((t) => t !== "fe")) {
      const [linha] = botoesPendencia(tipo, ID)
      expect(linha.map((b) => b.dado)).toEqual([`pd:${tipo}:a:${ID}`, `pd:${tipo}:d:${ID}`])
    }
  })

  test("viagem abre o atendimento ou recusa; caixa reconhece ou não", () => {
    expect(botoesPendencia("vi", ID)[0].map((b) => b.texto)).toEqual(["🧳 Abrir atendimento", "✖️ Recusar"])
    expect(botoesPendencia("cx", ID)[0].map((b) => b.texto)).toEqual(["✅ Reconhecer", "✖️ Não reconhecer"])
  })
})

test.describe("Abrir no painel", () => {
  test("só endereço público em HTTPS vira botão", () => {
    expect(urlDeBotaoValida("https://sindipetro.confluir.online/painel/pessoal/faltas/1")).toBe(true)
    expect(urlDeBotaoValida("http://sindipetro.confluir.online/painel")).toBe(false)
    expect(urlDeBotaoValida("https://localhost:3000/painel")).toBe(false)
    expect(urlDeBotaoValida("https://demo.localhost/painel")).toBe(false)
    expect(urlDeBotaoValida("https://192.168.0.10/painel")).toBe(false)
    expect(urlDeBotaoValida(null)).toBe(false)
    expect(urlDeBotaoValida("não é url")).toBe(false)
  })

  test("com endereço válido, o link sai do texto e vira a última linha de botões", () => {
    const url = "https://x.confluir.online/painel/institucional/viagens/1"
    const m = mensagemComPainel("Pedido novo", url, botoesPendencia("vi", ID))
    expect(m.texto).toBe("Pedido novo")
    expect(m.botoes).toHaveLength(2)
    expect(m.botoes[1]).toEqual([{ texto: TEXTO_ABRIR_NO_PAINEL, url }])
  })

  test("sem endereço válido, o link fica no texto e os botões de ação seguem", () => {
    const m = mensagemComPainel("Pedido novo", "http://localhost:3000/painel", botoesPendencia("vi", ID))
    expect(m.texto).toBe("Pedido novo\nhttp://localhost:3000/painel")
    expect(m.botoes).toHaveLength(1)
    expect(mensagemComPainel("Só texto", null)).toEqual({ texto: "Só texto", botoes: [] })
  })
})

test.describe("pedido de motivo", () => {
  test("a resposta da pessoa traz de volta o item (reply_to_message em texto puro)", () => {
    const pedido = pedidoDeMotivo("dr", ID)
    expect(pedido).toContain("devolver")
    expect(pedido).toContain("remessa de diárias")
    const comoOTelegramDevolve = pedido.replace(/<[^>]+>/g, "")
    expect(lerRefDoMotivo(comoOTelegramDevolve)).toEqual({ tipo: "dr", id: ID })
  })

  test("resposta a outra mensagem não vira motivo", () => {
    expect(lerRefDoMotivo("Ordem de pagamento aguarda sua autorização")).toBeNull()
    expect(lerRefDoMotivo(null)).toBeNull()
    // A referência é sempre da ação negativa.
    expect(lerRefDoMotivo(`Ref. pd:fa:a:${ID}`)).toBeNull()
  })
})

test.describe("menu de comandos", () => {
  test("/ajuda e o setMyCommands saem da mesma lista", () => {
    const ajuda = linhasDaAjuda()
    const menu = comandosParaOTelegram()
    expect(ajuda).toHaveLength(COMANDOS_BOT.length)
    expect(menu.map((c) => c.command)).toEqual(COMANDOS_BOT.map((c) => c.comando))
    expect(ajuda[0]).toBe("/pendencias — o que espera por você, com botões para resolver")
    expect(ajuda).toContain("/filiado &lt;nome ou CPF&gt; — consulta de filiação")
  })

  test("formato aceito pelo Telegram: comando minúsculo e descrição de 3 a 256", () => {
    for (const c of comandosParaOTelegram()) {
      expect(c.command).toMatch(/^[a-z0-9_]{1,32}$/)
      expect(c.description.length).toBeGreaterThanOrEqual(3)
      expect(c.description.length).toBeLessThanOrEqual(256)
      expect(c.description).not.toContain("&lt;")
    }
    expect(comandosParaOTelegram().find((c) => c.command === "filiado")?.description).toBe(
      "Consulta de filiação (/filiado nome ou CPF)"
    )
  })
})

test.describe("contracheque do reembolso aprovado pelo bot", () => {
  test("até o dia 15, o do mês; depois, o seguinte (com a virada do ano)", () => {
    expect(contrachequeSugerido("2026-10-15")).toEqual({ mes: "Outubro", ano: "2026" })
    expect(contrachequeSugerido("2026-10-31")).toEqual({ mes: "Novembro", ano: "2026" })
    expect(contrachequeSugerido("2026-12-20")).toEqual({ mes: "Janeiro", ano: "2027" })
  })
})
