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
  gerarSlug,
  inscricaoAberta,
  situacaoNaInscricao,
  limparCpf,
  minimoDaCota,
  MODELOS,
  normalizarDireitos,
  resumoDireitos,
  vagasDaBase,
} from "@/lib/congressos/regras"
import { casarPapel, conferirLinhas, lerGrade } from "@/lib/congressos/importacao"
import { codigoAtual, codigoRecente, codigoValido } from "@/lib/congressos/codigo-sala"
import {
  calcularQuorum,
  conferirSubstituicao,
  cpfParcial,
  emExercicio,
  lerQr,
  prazoCredenciamento,
  type PessoaTroca,
} from "@/lib/congressos/credenciamento"
import {
  abrangencias,
  classificarApreciacao,
  conferirCotas,
  destinoPelosGrupos,
  grupoTravado,
  podeNovaNoGrupo,
  resultadoPlenaria,
  separarPropostas,
} from "@/lib/congressos/relatoria"

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

test.describe("inscrição pública", () => {
  const agora = new Date("2027-05-10T12:00:00Z")
  test("janela e situação do congresso", () => {
    const base = { inscricaoPublica: true, situacao: "inscricoes", abre: "2027-05-01T00:00:00Z", fecha: "2027-05-20T00:00:00Z", agora }
    expect(inscricaoAberta(base).aberta).toBe(true)
    expect(inscricaoAberta({ ...base, inscricaoPublica: false }).aberta).toBe(false)
    expect(inscricaoAberta({ ...base, abre: "2027-05-11T00:00:00Z" }).motivo).toBe("As inscrições ainda não começaram.")
    expect(inscricaoAberta({ ...base, fecha: "2027-05-09T00:00:00Z" }).motivo).toBe("As inscrições estão encerradas.")
    expect(inscricaoAberta({ ...base, situacao: "cancelado" }).aberta).toBe(false)
    expect(inscricaoAberta({ ...base, abre: null, fecha: null }).aberta).toBe(true)
  })

  test("situação de quem se inscreve", () => {
    const ordem = configDoModelo("sindical_regional")
    expect(situacaoNaInscricao({ config: ordem, ocupaVaga: true, vagas: 2, ocupadas: 1 })).toBe("confirmado")
    expect(situacaoNaInscricao({ config: ordem, ocupaVaga: true, vagas: 2, ocupadas: 2 })).toBe("lista_espera")
    expect(situacaoNaInscricao({ config: ordem, ocupaVaga: false, vagas: 2, ocupadas: 2 })).toBe("confirmado")
    const comissao = aplicarMudancas(ordem, { "inscricao.aprovacao": "comissao" }).config
    expect(situacaoNaInscricao({ config: comissao, ocupaVaga: true, vagas: 2, ocupadas: 0 })).toBe("inscrito")
    const indicacao = configDoModelo("conferencia_publica")
    expect(situacaoNaInscricao({ config: indicacao, ocupaVaga: true, vagas: 5, ocupadas: 0 })).toBe("inscrito")
    expect(situacaoNaInscricao({ config: configDoModelo("assembleia_simples"), ocupaVaga: true, vagas: null, ocupadas: 9 })).toBe("confirmado")
  })

  test("endereço da página", () => {
    expect(gerarSlug("22 Congrenf — Energia, Democracia")).toBe("22-congrenf-energia-democracia")
  })
})

test.describe("importação de listas", () => {
  const papeis = [
    { id: "pd", nome: "Delegado", categoria: "delegado" },
    { id: "ps", nome: "Suplente", categoria: "suplente" },
    { id: "pn", nome: "Delegado nato", categoria: "nato" },
  ]
  const unidades = [
    { id: "u1", nome: "Macaé" },
    { id: "u2", nome: "P-51" },
  ]

  test("reconhece o cabeçalho e devolve o zero do CPF", () => {
    const grade = [
      ["Relação de delegados"],
      ["Nome completo", "C.P.F.", "Local de trabalho", "Condição"],
      ["Ana Souza", "529.982.247-25", "Macae", "Titular"],
      ["", "", "", ""],
      ["Bruno Lima", "1234567890", "P-51", "Suplente"],
    ]
    const linhas = lerGrade(grade)!
    expect(linhas).toHaveLength(2)
    expect(linhas[0]).toMatchObject({ linha: 3, nome: "Ana Souza", cpf: "52998224725", base: "Macae", papel: "Titular" })
    expect(linhas[1].linha).toBe(5)
    expect(lerGrade([["a", "b"], ["c", "d"]])).toBeNull()
  })

  test("papel por palavra-chave: suplente não vira delegado", () => {
    expect(casarPapel("Suplente", papeis, "pd")).toBe("ps")
    expect(casarPapel("Delegada suplente", papeis, "pd")).toBe("ps")
    expect(casarPapel("Membro nato", papeis, "pd")).toBe("pn")
    expect(casarPapel("Titular", papeis, null)).toBe("pd")
    expect(casarPapel(null, papeis, "pd")).toBe("pd")
  })

  test("conferência aponta repetidos, já existentes e base desconhecida", () => {
    const linhas = [
      { linha: 2, nome: "Ana Souza", cpf: "52998224725", email: null, telefone: null, genero: null, base: "macaé", papel: null },
      { linha: 3, nome: "Ana de novo", cpf: "52998224725", email: null, telefone: null, genero: null, base: null, papel: null },
      { linha: 4, nome: "Carlos", cpf: null, email: null, telefone: null, genero: null, base: "Campos", papel: null },
      { linha: 5, nome: "Dora Já", cpf: null, email: null, telefone: null, genero: null, base: null, papel: null },
      { linha: 6, nome: "Eva", cpf: "11111111112", email: null, telefone: null, genero: null, base: null, papel: null },
    ]
    const r = conferirLinhas(linhas, {
      unidades,
      papeis,
      papelPadrao: "pd",
      unidadePadrao: "u2",
      cpfsExistentes: new Set(),
      nomesExistentes: new Set(["dora ja"]),
    })
    expect(r.map((x) => x.situacao)).toEqual(["nova", "problema", "problema", "ja_esta", "problema"])
    expect(r[0]).toMatchObject({ unidadeId: "u1", papelId: "pd" })
    expect(r[1].unidadeId).toBe("u2")
    expect(r[2].motivo).toContain("Campos")
    expect(r[4].motivo).toBe("CPF inválido.")
  })
})

test.describe("credenciamento", () => {
  test("prazo por categoria, com e sem justificativa", () => {
    const c = normalizarConfig({
      valores: { "credenciamento.titular_ate": "2027-06-08T20:00:00Z", "credenciamento.suplente_ate": "2027-06-09T15:00:00Z" },
    })
    const depois = new Date("2027-06-09T10:00:00Z")
    expect(prazoCredenciamento(c, "delegado", depois)).toMatchObject({ permitido: false })
    expect(prazoCredenciamento(c, "suplente", depois)).toMatchObject({ permitido: true, exigeJustificativa: false })
    const flex = aplicarMudancas(c, { "credenciamento.apos_prazo": "justificativa" }).config
    expect(prazoCredenciamento(flex, "delegado", depois)).toMatchObject({ permitido: true, exigeJustificativa: true })
    expect(prazoCredenciamento(normalizarConfig({}), "delegado", depois).permitido).toBe(true)
  })

  const pessoa = (id: string, extra: Partial<PessoaTroca> = {}): PessoaTroca => ({
    id,
    categoria: "delegado",
    unidadeId: "u1",
    titularId: null,
    credenciado: false,
    situacao: "confirmado",
    inscritoEm: "2027-05-01T10:00:00Z",
    ...extra,
  })

  test("suplente assume titular ausente, com autorização", () => {
    const c = normalizarConfig({})
    const base = {
      config: c,
      titular: pessoa("t1"),
      suplente: pessoa("s1", { categoria: "suplente" }),
      suplentesDaBase: [],
      substituidos: new Set<string>(),
      assumiram: new Set<string>(),
      autorizadoPor: "Coordenação de Macaé",
    }
    expect(conferirSubstituicao(base).ok).toBe(true)
    expect(conferirSubstituicao({ ...base, autorizadoPor: null }).erro).toContain("coordenação da base")
    expect(conferirSubstituicao({ ...base, titular: pessoa("t1", { credenciado: true }) }).erro).toContain("titular ausente")
    expect(conferirSubstituicao({ ...base, suplente: pessoa("s1", { categoria: "suplente", unidadeId: "u2" }) }).erro).toContain("bases diferentes")
    expect(conferirSubstituicao({ ...base, suplente: pessoa("s1", { categoria: "suplente", titularId: "t9" }) }).erro).toContain("outro titular")
    expect(conferirSubstituicao({ ...base, assumiram: new Set(["s1"]) }).erro).toContain("já assumiu")
  })

  test("pela ordem da base, o primeiro suplente assume antes", () => {
    const c = aplicarMudancas(normalizarConfig({}), { "credenciamento.suplente_assume": "ordem", "credenciamento.autoriza_troca": "ninguem" }).config
    const s1 = pessoa("s1", { categoria: "suplente", inscritoEm: "2027-05-01T09:00:00Z" })
    const s2 = pessoa("s2", { categoria: "suplente", inscritoEm: "2027-05-01T11:00:00Z" })
    const d = { config: c, titular: pessoa("t1"), suplentesDaBase: [s1, s2], substituidos: new Set<string>(), assumiram: new Set<string>(), autorizadoPor: null }
    expect(conferirSubstituicao({ ...d, suplente: s2 }).erro).toContain("outro suplente")
    expect(conferirSubstituicao({ ...d, suplente: s1 }).ok).toBe(true)
  })

  test("quem está em exercício e o quórum", () => {
    const pessoas = [
      { id: "t1", situacao: "confirmado", credenciado: true, categoria: "delegado" as const, direitos: DIREITOS_PADRAO.delegado },
      { id: "t2", situacao: "confirmado", credenciado: false, categoria: "delegado" as const, direitos: DIREITOS_PADRAO.delegado },
      { id: "t3", situacao: "confirmado", credenciado: true, categoria: "delegado" as const, direitos: DIREITOS_PADRAO.delegado },
      { id: "s1", situacao: "confirmado", credenciado: true, categoria: "suplente" as const, direitos: DIREITOS_PADRAO.suplente },
      { id: "s2", situacao: "confirmado", credenciado: true, categoria: "suplente" as const, direitos: DIREITOS_PADRAO.suplente },
      { id: "o1", situacao: "confirmado", credenciado: true, categoria: "observador" as const, direitos: DIREITOS_PADRAO.observador },
      { id: "e1", situacao: "lista_espera", credenciado: true, categoria: "delegado" as const, direitos: DIREITOS_PADRAO.delegado },
    ]
    const r = emExercicio(pessoas, [{ titularId: "t3", suplenteId: "s1" }])
    expect([...r].sort()).toEqual(["s1", "t1"])
    const c = normalizarConfig({ valores: { "presenca.quorum_instalacao": 50 } })
    expect(calcularQuorum(c, 9, 4)).toMatchObject({ exigido: 5, atingido: false })
    expect(calcularQuorum(c, 9, 5).atingido).toBe(true)
    expect(calcularQuorum(normalizarConfig({}), 9, 1).atingido).toBeNull()
  })

  test("leitura dos QR", () => {
    expect(lerQr("CGRC:abcDEF123_-xyz")).toEqual({ tipo: "cracha", codigo: "abcDEF123_-xyz" })
    const token = "a".repeat(32)
    expect(lerQr(`CGRP:${token}`)).toEqual({ tipo: "pessoal", token })
    expect(lerQr(`https://nf.confluir.app/congresso/eu/${token}?nova=1`)).toEqual({ tipo: "pessoal", token })
    expect(lerQr("CGRS:3f1c2b7e-1111-4111-8111-222222222222:AB12CD")).toEqual({
      tipo: "sala",
      sessaoId: "3f1c2b7e-1111-4111-8111-222222222222",
      codigo: "AB12CD",
    })
    expect(lerQr("qualquer coisa")).toBeNull()
    expect(cpfParcial("12345678909")).toBe("***.456.789-**")
  })

  test("código da sala muda por janela e aceita a anterior", () => {
    const semente = "semente-de-teste"
    const t = Date.parse("2027-06-09T12:00:00Z")
    const { codigo } = codigoAtual(semente, 20, t)
    expect(codigo).toMatch(/^[A-Z2-9]{6}$/)
    expect(codigoValido(semente, 20, codigo, t + 5000)).toBe(true)
    expect(codigoValido(semente, 20, codigo, t + 25000)).toBe(true)
    expect(codigoValido(semente, 20, codigo, t + 45000)).toBe(false)
    expect(codigoValido("outra", 20, codigo, t)).toBe(false)
    // fora da validade: recente (expirou) × nunca foi desta sala (não confere)
    expect(codigoRecente(semente, 20, codigo, t + 45000)).toBe(true)
    expect(codigoRecente(semente, 20, codigo, t + 3600000)).toBe(false)
    expect(codigoRecente(semente, 20, "ZZZZZZ", t + 45000)).toBe(false)
  })
})

test("CPF", () => {
  expect(limparCpf("123.456.789-09")).toBe("12345678909")
  expect(limparCpf("123")).toBeNull()
  expect(limparCpf(null)).toBeNull()
})

test.describe("relatoria e plenária", () => {
  test("apreciação no grupo pelas regras configuradas", () => {
    const sem = { aprovaDireto: 0, vencidaSobe: 0 }
    expect(classificarApreciacao({ aFavor: 10, contra: 5, abstencao: 1 }, sem).resultado).toBe("plenaria")
    expect(classificarApreciacao({ aFavor: 5, contra: 5, abstencao: 0 }, sem).resultado).toBe("rejeitada")
    // Saúde/SC: 70% aprova direto
    expect(classificarApreciacao({ aFavor: 14, contra: 6, abstencao: 0 }, { aprovaDireto: 70, vencidaSobe: 0 }).resultado).toBe("aprovada_direto")
    expect(classificarApreciacao({ aFavor: 13, contra: 7, abstencao: 0 }, { aprovaDireto: 70, vencidaSobe: 0 }).resultado).toBe("plenaria")
    // Plenafup: vencida com mais de 1/3 sobe junto
    expect(classificarApreciacao({ aFavor: 12, contra: 8, abstencao: 0 }, { aprovaDireto: 0, vencidaSobe: 33 }).resultado).toBe("plenaria_com_vencida")
    expect(classificarApreciacao({ aFavor: 8, contra: 12, abstencao: 0 }, { aprovaDireto: 0, vencidaSobe: 33 }).resultado).toBe("plenaria_com_vencida")
    expect(classificarApreciacao({ aFavor: 5, contra: 15, abstencao: 0 }, { aprovaDireto: 0, vencidaSobe: 33 }).resultado).toBe("rejeitada")
    expect(classificarApreciacao({ aFavor: 0, contra: 0, abstencao: 0 }, sem).resultado).toBe("rejeitada")
  })

  test("destino de uma proposta apreciada em vários grupos", () => {
    expect(destinoPelosGrupos([], "um").destino).toBe("pendente")
    expect(destinoPelosGrupos(["aprovada_direto", "aprovada_direto"], "um").destino).toBe("aprovada")
    expect(destinoPelosGrupos(["plenaria", "rejeitada", "rejeitada"], "um").destino).toBe("plenaria")
    expect(destinoPelosGrupos(["plenaria", "rejeitada", "rejeitada"], "mais_de_um").destino).toBe("rejeitada")
    expect(destinoPelosGrupos(["plenaria", "plenaria_com_vencida", "rejeitada", "rejeitada"], "metade").destino).toBe("plenaria")
    expect(destinoPelosGrupos(["plenaria", "rejeitada", "rejeitada", "rejeitada"], "metade").destino).toBe("rejeitada")
    expect(destinoPelosGrupos(["plenaria"], "mais_de_um").destino).toBe("plenaria")
  })

  test("resultado da plenária pela maioria", () => {
    expect(resultadoPlenaria({ forma: "sem_oposicao", maioria: "simples" }).resultado).toBe("aprovada")
    expect(resultadoPlenaria({ forma: "visual", maioria: "simples", declarado: "rejeitada" }).resultado).toBe("rejeitada")
    expect(resultadoPlenaria({ forma: "visual", maioria: "simples" }).erro).toBeTruthy()
    expect(resultadoPlenaria({ forma: "contagem", maioria: "simples", aFavor: 40, contra: 30, abstencao: 50 }).resultado).toBe("aprovada")
    expect(resultadoPlenaria({ forma: "contagem", maioria: "simples", aFavor: 30, contra: 30 }).resultado).toBe("empate")
    expect(resultadoPlenaria({ forma: "contagem", maioria: "absoluta", aFavor: 50, contra: 10, credenciadosComVoto: 100 }).resultado).toBe("rejeitada")
    expect(resultadoPlenaria({ forma: "contagem", maioria: "absoluta", aFavor: 51, contra: 10, credenciadosComVoto: 100 }).resultado).toBe("aprovada")
    expect(resultadoPlenaria({ forma: "contagem", maioria: "dois_tercos", aFavor: 60, contra: 30, abstencao: 0 }).resultado).toBe("aprovada")
    expect(resultadoPlenaria({ forma: "contagem", maioria: "dois_tercos", aFavor: 59, contra: 30, abstencao: 1 }).resultado).toBe("rejeitada")
    expect(resultadoPlenaria({ forma: "contagem", maioria: "simples", aFavor: null, contra: 3 }).erro).toBeTruthy()
  })

  test("propostas novas, trava, cotas, abrangências e caderno colado", () => {
    expect(podeNovaNoGrupo("livres", 0, 50).pode).toBe(true)
    expect(podeNovaNoGrupo("proibidas", 0, 0).pode).toBe(false)
    expect(podeNovaNoGrupo("limitadas", 2, 1).pode).toBe(true)
    expect(podeNovaNoGrupo("limitadas", 2, 2).pode).toBe(false)
    const agora = Date.parse("2027-06-10T13:00:00Z")
    expect(grupoTravado({ trava: null, entregueEm: null, agora }).travado).toBe(false)
    expect(grupoTravado({ trava: "2027-06-10T12:59:00Z", entregueEm: null, agora }).travado).toBe(true)
    expect(grupoTravado({ trava: "2027-06-10T14:00:00Z", entregueEm: null, agora }).travado).toBe(false)
    expect(grupoTravado({ trava: null, entregueEm: "2027-06-10T11:00:00Z", agora }).travado).toBe(true)
    const ps = [
      { grupo: "GT 1", eixo: "A" }, { grupo: "GT 1", eixo: "A" }, { grupo: "GT 1", eixo: "B" }, { grupo: "GT 2", eixo: "A" },
    ]
    expect(conferirCotas(ps, { porGrupo: 0, porEixo: 0 })).toEqual([])
    expect(conferirCotas(ps, { porGrupo: 2, porEixo: 0 })).toHaveLength(1)
    expect(conferirCotas(ps, { porGrupo: 0, porEixo: 1 })[0]).toContain("GT 1, eixo A")
    expect(abrangencias("Local, Estadual;Nacional, Local")).toEqual(["Local", "Estadual", "Nacional"])
    expect(abrangencias("")).toEqual([])
    expect(separarPropostas("1. Lutar pela\nredução da jornada\n\n2) Defender a Petrobras pública\n\n\nx")).toEqual([
      "Lutar pela redução da jornada",
      "Defender a Petrobras pública",
    ])
  })
})
