import { expect, test } from "playwright/test"

import {
  AJUSTES,
  aplicarMudancas,
  ajusteVisivel,
  AJUSTE_POR_CHAVE,
  normalizarConfig,
  valor,
} from "@/lib/congressos/config"
import {
  alocarPorOrdem,
  configCopiada,
  configDoModelo,
  conferirConsistencia,
  conferirCotaGenero,
  DIREITOS_PADRAO,
  limparCpf,
  minimoDaCota,
  MODELOS,
  normalizarDireitos,
  resumoDireitos,
  vagasDaBase,
} from "@/lib/congressos/regras"

test.describe("catálogo e normalização", () => {
  test("chaves únicas e padrões válidos", () => {
    const chaves = AJUSTES.map((a) => a.chave)
    expect(new Set(chaves).size).toBe(chaves.length)
    for (const a of AJUSTES) {
      if (a.tipo === "escolha") expect(a.opcoes?.some((o) => o.valor === a.padrao)).toBe(true)
      for (const c of a.visivelSe ?? []) expect(AJUSTE_POR_CHAVE.has(c.chave)).toBe(true)
    }
  })

  test("configuração vazia vira o catálogo inteiro com padrões", () => {
    const c = normalizarConfig({})
    expect(Object.keys(c.valores)).toHaveLength(AJUSTES.length)
    expect(valor(c, "delegacao.forma")).toBe("ordem_inscricao")
    expect(c.origem["delegacao.forma"]).toBe("padrao")
  })

  test("valor inválido volta ao padrão e número respeita limites", () => {
    const c = normalizarConfig({
      valores: { "delegacao.forma": "sorteio", "cotas.genero_minimo": 80, "plenaria.tempo_fala": "4,5" },
    })
    expect(valor(c, "delegacao.forma")).toBe("ordem_inscricao")
    expect(valor(c, "cotas.genero_minimo")).toBe(50)
    expect(valor(c, "plenaria.tempo_fala")).toBe(4.5)
  })

  test("mudança marca só o que mudou como decisão da comissão", () => {
    const c = configDoModelo("sindical_regional")
    const { config, alteradas } = aplicarMudancas(c, {
      "delegacao.forma": "ordem_inscricao",
      "mocoes.minimo_numero": "25",
    })
    expect(alteradas).toEqual(["mocoes.minimo_numero"])
    expect(config.origem["mocoes.minimo_numero"]).toBe("comissao")
    expect(config.origem["delegacao.forma"]).toBe("modelo")
  })

  test("artigo do regimento muda a origem para regimento", () => {
    const c = configDoModelo("em_branco")
    const { config, alteradas } = aplicarMudancas(
      c,
      { "mocoes.minimo_numero": 20 },
      { "mocoes.minimo_numero": "Art. 21, parágrafo único" }
    )
    expect(alteradas).toContain("mocoes.minimo_numero")
    expect(config.origem["mocoes.minimo_numero"]).toBe("regimento")
    expect(config.artigos["mocoes.minimo_numero"]).toBe("Art. 21, parágrafo único")
  })

  test("ajuste condicional aparece só quando se aplica", () => {
    const coef = AJUSTE_POR_CHAVE.get("delegacao.coef_a_cada")!
    expect(ajusteVisivel(coef, { "delegacao.calculo_vagas": "fixo" })).toBe(false)
    expect(ajusteVisivel(coef, { "delegacao.calculo_vagas": "coeficiente" })).toBe(true)
    const doc = AJUSTE_POR_CHAVE.get("delegacao.documento_indicacao")!
    expect(ajusteVisivel(doc, { "delegacao.forma": "eleicao_base" })).toBe(true)
    expect(ajusteVisivel(doc, { "delegacao.forma": "ordem_inscricao" })).toBe(false)
  })
})

test.describe("modelos e cópia", () => {
  test("todo modelo gera configuração válida com papel de delegado", () => {
    for (const m of MODELOS) {
      const c = configDoModelo(m.id)
      expect(c.modelo).toBe(m.id)
      expect(m.papeis.some((p) => p.categoria === "delegado")).toBe(true)
      for (const [k, v] of Object.entries(m.valores)) expect(valor(c, k)).toBe(v)
    }
  })

  test("cópia da edição anterior mantém regras e descarta datas", () => {
    const anterior = normalizarConfig({
      valores: { "mocoes.minimo_numero": 20, "inscricao.abre": "2025-05-01T08:00:00.000Z" },
      origem: { "mocoes.minimo_numero": "regimento" },
      artigos: { "mocoes.minimo_numero": "Art. 21" },
    })
    const nova = configCopiada(anterior)
    expect(valor(nova, "mocoes.minimo_numero")).toBe(20)
    expect(nova.origem["mocoes.minimo_numero"]).toBe("copia")
    expect(nova.artigos["mocoes.minimo_numero"]).toBe("Art. 21")
    expect(valor(nova, "inscricao.abre")).toBeNull()
  })
})

test.describe("direitos", () => {
  test("padrão completa o que não foi gravado", () => {
    const d = normalizarDireitos("observador", { voz_plenaria: "livre", voto_plenaria: "sim" })
    expect(d.voz_plenaria).toBe("livre")
    expect(d.voto_plenaria).toBe(false)
  })

  test("resumo em linguagem clara", () => {
    expect(resumoDireitos(DIREITOS_PADRAO.delegado)).toContain("Tem voz e voto nos grupos e na plenária")
    expect(resumoDireitos(DIREITOS_PADRAO.suplente)).toContain("Vota só quando substitui um titular")
    expect(resumoDireitos(DIREITOS_PADRAO.observador)).toContain("Fala na plenária com autorização da mesa")
    expect(resumoDireitos(DIREITOS_PADRAO.observador)).toContain("Não vota")
  })
})

test.describe("vagas por base", () => {
  test("FUP: 16 + 1 a cada 360, fração desprezada", () => {
    const c = normalizarConfig({
      valores: { "delegacao.calculo_vagas": "coeficiente", "delegacao.coef_minimo": 16, "delegacao.coef_a_cada": 360 },
    })
    expect(vagasDaBase(c, { limite_delegados: null, socios: 1000 }).vagas).toBe(18)
  })

  test("Concut: 1 a cada 1.500, fração acima da metade conta", () => {
    const c = configDoModelo("central_nacional")
    expect(vagasDaBase(c, { limite_delegados: null, socios: 3700 }).vagas).toBe(2)
    expect(vagasDaBase(c, { limite_delegados: null, socios: 3800 }).vagas).toBe(3)
    expect(vagasDaBase(c, { limite_delegados: null, socios: 750 }).vagas).toBe(0)
    expect(vagasDaBase(c, { limite_delegados: null, socios: 751 }).vagas).toBe(1)
  })

  test("limite fixo e inscrição livre", () => {
    const fixo = configDoModelo("sindical_regional")
    expect(vagasDaBase(fixo, { limite_delegados: 12, socios: null }).vagas).toBe(12)
    expect(vagasDaBase(fixo, { limite_delegados: null, socios: null }).vagas).toBeNull()
    const livre = configDoModelo("assembleia_simples")
    expect(vagasDaBase(livre, { limite_delegados: 3, socios: null }).vagas).toBeNull()
  })
})

test.describe("ordem de inscrição", () => {
  const inscritos = [
    { id: "c", inscrito_em: "2027-05-01T10:02:00Z", situacao: "inscrito", ocupaVaga: true },
    { id: "a", inscrito_em: "2027-05-01T10:00:00Z", situacao: "inscrito", ocupaVaga: true },
    { id: "nato", inscrito_em: "2027-04-01T00:00:00Z", situacao: "confirmado", ocupaVaga: false },
    { id: "b", inscrito_em: "2027-05-01T10:01:00Z", situacao: "cancelado", ocupaVaga: true },
    { id: "d", inscrito_em: "2027-05-01T10:03:00Z", situacao: "lista_espera", ocupaVaga: true },
  ]

  test("os primeiros ocupam as vagas, o resto vai para a espera na ordem", () => {
    expect(alocarPorOrdem(inscritos, 1, "lista_espera")).toEqual([
      { id: "a", situacao: "confirmado", posicao: null },
      { id: "c", situacao: "lista_espera", posicao: 1 },
      { id: "d", situacao: "lista_espera", posicao: 2 },
    ])
  })

  test("cancelamento libera a vaga para o próximo", () => {
    const r = alocarPorOrdem(inscritos.map((i) => (i.id === "a" ? { ...i, situacao: "cancelado" } : i)), 1, "lista_espera")
    expect(r[0]).toEqual({ id: "c", situacao: "confirmado", posicao: null })
  })

  test("sem limite confirma todos; recusa quando configurado", () => {
    expect(alocarPorOrdem(inscritos, null, "lista_espera").every((r) => r.situacao === "confirmado")).toBe(true)
    expect(alocarPorOrdem(inscritos, 2, "recusa").map((r) => r.situacao)).toEqual(["confirmado", "confirmado", "recusado"])
  })
})

test.describe("cotas", () => {
  test("arredondamento", () => {
    expect(minimoDaCota(8, 30, "cima")).toBe(3)
    expect(minimoDaCota(8, 30, "baixo")).toBe(2)
    expect(minimoDaCota(10, 30, "cima")).toBe(3)
    expect(minimoDaCota(7, 30, "proximo")).toBe(2)
  })

  test("cota de gênero aponta quantos faltam", () => {
    const c = normalizarConfig({ valores: { "cotas.genero_minimo": 30 } })
    const r = conferirCotaGenero(c, ["F", "masculino", "M", "m", "Homem", "homem", "m", "M", null, "mulher"])!
    expect(r.exigido).toBe(3)
    expect(r.ok).toBe(false)
    expect(r.mensagem).toContain("Faltam 1 mulher(es)")
    expect(r.semInformacao).toBe(1)
  })

  test("sem cota configurada não confere", () => {
    expect(conferirCotaGenero(normalizarConfig({}), ["F"])).toBeNull()
  })
})

test.describe("consistência", () => {
  const base = {
    eventoInicio: "2027-06-08T11:00:00.000Z",
    eventoTermino: "2027-06-10T16:00:00.000Z",
    papeis: [
      { nome: "Delegado", categoria: "delegado" as const },
      { nome: "Suplente", categoria: "suplente" as const },
    ],
    unidades: [{ nome: "Macaé", limite_delegados: 10, socios: null }],
    grupos: [{ nome: "GT 1", vagas: 40 }],
    temParticipanteSemBase: false,
  }

  test("configuração coerente não gera alerta", () => {
    expect(conferirConsistencia({ ...base, config: configDoModelo("em_branco") })).toEqual([])
  })

  test("prazos contraditórios e papel faltando", () => {
    const c = normalizarConfig({
      valores: {
        "inscricao.abre": "2027-05-10T12:00:00.000Z",
        "inscricao.fecha": "2027-05-01T12:00:00.000Z",
        "credenciamento.titular_ate": "2027-06-08T20:00:00.000Z",
        "credenciamento.suplente_ate": "2027-06-08T15:00:00.000Z",
        "delegacao.natos": "diretoria",
      },
    })
    const msgs = conferirConsistencia({ ...base, config: c }).map((a) => a.mensagem)
    expect(msgs).toContain("As inscrições fecham antes de abrir.")
    expect(msgs).toContain("O prazo dos suplentes termina antes do prazo dos titulares.")
    expect(msgs).toContain("A configuração prevê natos, mas não há papel de delegado nato.")
  })

  test("evento virtual que exige presença", () => {
    const c = normalizarConfig({ valores: { "identidade.formato": "virtual" } })
    expect(conferirConsistencia({ ...base, config: c }).some((a) => a.nivel === "erro")).toBe(true)
  })
})

test("CPF", () => {
  expect(limparCpf("123.456.789-09")).toBe("12345678909")
  expect(limparCpf("123")).toBeNull()
  expect(limparCpf(null)).toBeNull()
})
