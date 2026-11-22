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
  alertasDeSentido,
  blocos,
  lerCaderno,
  lerCorrelacao,
  lerMesclagem,
  lerRefino,
  lerRegimento,
  lerTriagem,
  lerTriagemMocao,
  listaParaIA,
  semDadosPessoais,
  sugestaoObsoleta,
  usoPorFuncao,
} from "@/lib/congressos/ia"
import {
  codigoCertificado,
  conferirChapa,
  direitoAoCertificado,
  dividirVagas,
  eleitosDaChapa,
  frequencia,
  janelaDeChapas,
  lembrar,
  resolucaoAtrasada,
  resumoResolucoes,
} from "@/lib/congressos/encerramento"
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
import { calcularLimiar, codigoMocao, lerCodigoMocao, podeAssinar, quantoFalta, tiposDeMocao } from "@/lib/congressos/mocoes"

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

test.describe("moções", () => {
  const base = { numero: 0, percentual: 0, combinacao: "ou" as const, percentualDe: "congresso" as const, denominadorCongresso: 100, denominadorBase: 23, validas: 0, validasDaBase: 0 }

  test("limiar do Congrenf: 90% da base de origem ou 20 delegados", () => {
    const regra = { ...base, numero: 20, percentual: 90, percentualDe: "base_origem" as const }
    expect(calcularLimiar({ ...regra, validas: 19, validasDaBase: 20 }).atingido).toBe(false)
    expect(calcularLimiar({ ...regra, validas: 20, validasDaBase: 3 }).atingido).toBe(true)
    const pelaBase = calcularLimiar({ ...regra, validas: 21, validasDaBase: 21 })
    expect(pelaBase.alternativas[1]).toMatchObject({ exigido: 21, atingido: true })
    expect(quantoFalta(calcularLimiar({ ...regra, validas: 15, validasDaBase: 19 }))).toBe("Faltam 2 para 90% da base de origem (21 de 23).")
  })

  test("limiar com \"e\", percentual do congresso e sem base de origem", () => {
    expect(calcularLimiar({ ...base, percentual: 10, validas: 10 }).atingido).toBe(true)
    expect(calcularLimiar({ ...base, percentual: 10, validas: 9 }).atingido).toBe(false)
    expect(calcularLimiar({ ...base, numero: 5, percentual: 10, combinacao: "e", validas: 7 }).atingido).toBe(false)
    const semBase = calcularLimiar({ ...base, percentual: 90, percentualDe: "base_origem", denominadorBase: null, validas: 50 })
    expect(semBase.atingido).toBe(false)
    expect(semBase.aviso).toBeTruthy()
    expect(calcularLimiar({ ...base }).atingido).toBe(true)
  })

  const pedido = {
    situacao: "coleta",
    prazo: null,
    direito: true,
    categoria: "delegado",
    emExercicio: true,
    credenciado: true,
    modalidade: "presencial" as const,
    meio: "link" as const,
    meioPermitido: "ambos" as const,
    regraLocal: "so_local" as const,
    provaExigida: "C" as const,
    presenteNaSessao: true,
    codigoValido: false,
  }

  test("quem pode assinar e com que prova", () => {
    expect(podeAssinar(pedido)).toMatchObject({ pode: false, precisaCodigo: true })
    expect(podeAssinar({ ...pedido, codigoValido: true })).toMatchObject({ pode: true, nivel: "C" })
    expect(podeAssinar({ ...pedido, meio: "estacao" })).toMatchObject({ pode: true, nivel: "D" })
    expect(podeAssinar({ ...pedido, provaExigida: "B" })).toMatchObject({ pode: true, nivel: "B" })
    expect(podeAssinar({ ...pedido, provaExigida: "A", presenteNaSessao: false })).toMatchObject({ pode: true, nivel: "A" })
    expect(podeAssinar({ ...pedido, modalidade: "distancia" }).pode).toBe(false)
    expect(podeAssinar({ ...pedido, modalidade: "distancia", regraLocal: "local_ou_distancia" })).toMatchObject({ pode: true, nivel: null })
    expect(podeAssinar({ ...pedido, direito: false }).motivo).toContain("não assina")
    expect(podeAssinar({ ...pedido, categoria: "suplente", emExercicio: false }).pode).toBe(false)
    expect(podeAssinar({ ...pedido, credenciado: false }).pode).toBe(false)
    expect(podeAssinar({ ...pedido, situacao: "protocolada" }).pode).toBe(false)
    expect(podeAssinar({ ...pedido, prazo: "2027-06-10T09:00:00Z", agora: Date.parse("2027-06-10T09:01:00Z") }).pode).toBe(false)
    expect(podeAssinar({ ...pedido, meioPermitido: "papel", codigoValido: true }).pode).toBe(false)
    expect(podeAssinar({ ...pedido, meio: "papel", meioPermitido: "eletronico" }).pode).toBe(false)
    expect(podeAssinar({ ...pedido, meio: "papel" })).toMatchObject({ pode: true, nivel: "E" })
  })

  test("código da moção", () => {
    const c = codigoMocao(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]))
    expect(c).toMatch(/^M[A-Z2-9]{7}$/)
    expect(lerCodigoMocao(`https://x.confluir.app/congresso/mocao/${c}`)).toBe(c)
    expect(lerCodigoMocao(`CGRM:${c.toLowerCase()}`)).toBe(c)
    expect(lerCodigoMocao("qualquer coisa")).toBeNull()
    expect(tiposDeMocao("Apoio, Repúdio, Apoio")).toEqual(["Apoio", "Repúdio"])
  })
})

test.describe("congressos — IA na relatoria", () => {
  test("tira dados pessoais e autoria do que vai à IA", () => {
    expect(semDadosPessoais("Contato 123.456.789-09, ana@x.org, (22) 99876-5432; reajuste de 10%")).toBe(
      "Contato [CPF], [e-mail], [telefone]; reajuste de 10%"
    )
    expect(listaParaIA([{ numero: 7, texto: "Garantir  PLR\nintegral", eixo: "ACT", grupo: "GT 1" }], { comGrupo: true })).toBe("P7 [GT 1]: Garantir PLR integral")
  })

  test("blocos não separam o eixo que cabe inteiro", () => {
    const b = blocos([["a", [1, 2, 3]], ["b", [4, 5]], ["c", [6, 7, 8, 9, 10, 11]]], 5)
    expect(b).toEqual([[1, 2, 3, 4, 5], [6, 7, 8, 9, 10], [11]])
    expect(blocos([["a", [1, 2, 3]], ["b", [4, 5, 6]]], 5)).toEqual([[1, 2, 3], [4, 5, 6]])
  })

  test("alerta quando a redação nova parece mudar o sentido", () => {
    expect(alertasDeSentido("Lutar pela manutenção do regime de turno", "Lutar pela manutenção do regime de turno de 12 horas")[0]).toContain("Números")
    expect(alertasDeSentido("Não aceitar a venda das refinarias", "Aceitar a venda das refinarias")[0]).toContain("Negação")
    expect(alertasDeSentido("O sindicato deve exigir PLR", "O sindicato pode sugerir PLR").some((a) => a.includes("Força"))).toBe(true)
    expect(alertasDeSentido("Garantir o reajuste de 10% para todos os trabalhadores", "Garantir reajuste de 10% a todos os trabalhadores")).toEqual([])
  })

  test("lê as respostas da IA só com propostas enviadas", () => {
    expect(lerRefino({ texto: "Texto melhor aqui", muda_sentido: true, alerta: "x" }, "Texto ruim")).toMatchObject({ mudaSentido: true })
    expect(lerRefino({ texto: "Igual" }, "Igual")).toBeNull()
    expect(lerRefino({ texto: "P6: Proposta de teste" }, "Proposta de teste")).toBeNull()
    expect(lerRefino({ texto: "Proposta 12 - Garantir PLR" }, "garantir plr")?.texto).toBe("Garantir PLR")
    expect(lerRefino({ texto: "10% de reajuste" }, "x")?.texto).toBe("10% de reajuste")
    const validos = new Set([1, 2, 3, 4])
    expect(lerMesclagem({ grupos: [{ propostas: ["P1", 2, 99], texto: "Unida", motivo: "m" }, { propostas: [2, 3], texto: "Outra" }, { propostas: [3, 4], texto: "Terceira" }] }, validos)).toEqual([
      { numeros: [1, 2], texto: "Unida", motivo: "m" },
      { numeros: [3, 4], texto: "Terceira", motivo: "" },
    ])
    const atuais = new Map([[1, { eixo: "ACT", abrangencia: null }], [2, { eixo: "ACT", abrangencia: "Local" }]])
    expect(
      lerTriagem(
        { propostas: [{ proposta: "P1", eixo: "saúde", abrangencia: "nacional", fora_competencia: "" }, { proposta: 2, eixo: "ACT", abrangencia: "Local" }, { proposta: 9, eixo: "Saúde" }] },
        atuais,
        ["ACT", "Saúde"],
        ["Local", "Nacional"]
      )
    ).toEqual([{ numero: 1, eixo: "Saúde", motivoEixo: "", abrangencia: "Nacional", foraCompetencia: null }])
    const grupos = new Map<number, string | null>([[1, "g1"], [2, "g1"], [3, "g2"]])
    expect(lerCorrelacao({ pares: [{ a: 1, b: 2, relacao: "igual" }, { a: 3, b: 1, relacao: "contraditoria", motivo: "m" }, { a: 1, b: 3, relacao: "igual" }, { a: 2, b: 3, relacao: "talvez" }] }, grupos)).toEqual([
      { a: 1, b: 3, relacao: "contraditoria", motivo: "m" },
    ])
    expect(lerTriagemMocao({ tipo: "repúdio", destinatario: "Petrobras", alerta_conteudo: "" }, ["Apoio", "Repúdio"])).toMatchObject({ tipo: "Repúdio", alertaConteudo: null })
    expect(lerCaderno({ propostas: [{ texto: "Primeira proposta", eixo: "act" }, { texto: "primeira proposta" }, { texto: "x" }] }, ["ACT"])).toEqual([
      { texto: "Primeira proposta", eixo: "ACT", origem: "" },
    ])
  })

  test("regimento lido vira só ajustes válidos do catálogo", () => {
    const r = lerRegimento({
      ajustes: [
        { chave: "plenaria.maioria", valor: "absoluta", artigo: "Art. 12", trecho: "maioria absoluta" },
        { chave: "plenaria.maioria", valor: "simples", artigo: "Art. 13" },
        { chave: "plenaria.maioria_x", valor: "1" },
        { chave: "propostas.ia", valor: "talvez" },
        { chave: "propostas.consenso_debate", valor: false, artigo: "Art. 9" },
      ],
    })
    expect(r.map((a) => [a.chave, a.valor, a.artigo])).toEqual([
      ["propostas.consenso_debate", false, "Art. 9"],
      ["plenaria.maioria", "absoluta", "Art. 12"],
    ])
  })

  test("uso medido e sugestão velha", () => {
    expect(usoPorFuncao([{ funcao: "mesclagem", situacao: "aceita" }, { funcao: "refino", situacao: "recusada" }, { funcao: "mesclagem", situacao: "ajustada" }, { funcao: "mesclagem", situacao: "pendente" }])).toEqual([
      { funcao: "refino", total: 1, aceitas: 0, recusadas: 1, pendentes: 0 },
      { funcao: "mesclagem", total: 3, aceitas: 2, recusadas: 0, pendentes: 1 },
    ])
    const atuais = new Map([["a", { versao: 2, situacao: "entregue" }], ["b", { versao: 1, situacao: "fundida" }]])
    expect(sugestaoObsoleta({ a: 2 }, atuais)).toBe(false)
    expect(sugestaoObsoleta({ a: 1 }, atuais)).toBe(true)
    expect(sugestaoObsoleta({ b: 1 }, atuais)).toBe(true)
  })
})

test.describe("congressos — encerramento", () => {
  const c = (id: string, votos: number, inscritaEm = "2027-06-12T12:0" + id.length + ":00Z") => ({ id, votos, inscritaEm })

  test("maioria: a mais votada leva todas; empate é apontado", () => {
    const r = dividirVagas([c("a", 120), c("b", 80)], 18, "maioria")
    expect([r.vagas.get("a"), r.vagas.get("b"), r.empate]).toEqual([18, 0, false])
    const e = dividirVagas([c("a", 90), c("b", 90)], 18, "maioria")
    expect(e.empate).toBe(true)
    expect(e.vagas.get("a")).toBe(0)
  })

  test("proporcional: quociente e maiores restos", () => {
    // 200 votos, 10 vagas → quociente 20: A 110 (5,5), B 60 (3), C 30 (1,5) → 9 inteiras; resto 0,5 empata A e C, A tem mais votos
    const r = dividirVagas([c("A", 110), c("B", 60), c("C", 30)], 10, "proporcional")
    expect([r.vagas.get("A"), r.vagas.get("B"), r.vagas.get("C")]).toEqual([6, 3, 1])
    const s = dividirVagas([c("A", 50), c("B", 30), c("C", 20)], 18, "proporcional")
    expect([...s.vagas.values()].reduce((x, y) => x + y, 0)).toBe(18)
    expect(dividirVagas([c("A", 0)], 5, "proporcional").aviso).toContain("Nenhuma")
  })

  test("eleitos pela ordem da chapa e conferência da chapa", () => {
    const m = [
      { participanteId: "t2", condicao: "titular" as const, ordem: 2 },
      { participanteId: "t1", condicao: "titular" as const, ordem: 1 },
      { participanteId: "s1", condicao: "suplente" as const, ordem: 1 },
      { participanteId: "t3", condicao: "titular" as const, ordem: 3 },
    ]
    expect([...eleitosDaChapa(m, 2, 1)].sort()).toEqual(["s1", "t1", "t2"])
    const membro = (id: string, extra = {}) => ({ participanteId: id, nome: id, condicao: "titular" as const, podeCompor: true, outraChapa: null, ...extra })
    expect(conferirChapa({ membros: [membro("a"), membro("b")], vagas: 2, suplentes: 0, completa: true }).ok).toBe(true)
    const r = conferirChapa({ membros: [membro("a"), membro("b", { podeCompor: false }), membro("c", { outraChapa: "1" })], vagas: 4, suplentes: 0, completa: true })
    expect(r.problemas).toEqual(["Faltam 1 titular(es): o regimento pede a chapa completa, com 4.", "b não pode compor chapa pela regra do congresso.", "c já está na chapa 1."])
    expect(janelaDeChapas("2027-06-12T15:00:00Z", "2027-06-12T15:15:00Z", Date.parse("2027-06-12T15:16:00Z")).aberta).toBe(false)
    expect(janelaDeChapas(null, null).aberta).toBe(true)
  })

  test("certificado pela frequência e código", () => {
    expect(frequencia(3, 4)).toBe(75)
    expect(frequencia(2, 0)).toBeNull()
    expect(direitoAoCertificado({ credenciado: true, frequencia: 75, minimo: 75, regra: "todos" }).tem).toBe(true)
    expect(direitoAoCertificado({ credenciado: true, frequencia: 50, minimo: 75, regra: "todos" }).motivo).toContain("50%")
    expect(direitoAoCertificado({ credenciado: false, frequencia: null, minimo: 75, regra: "todos" }).tem).toBe(false)
    expect(direitoAoCertificado({ credenciado: true, frequencia: null, minimo: 75, regra: "nao" }).tem).toBe(false)
    expect(codigoCertificado(new Uint8Array([1, 2, 3, 4, 5, 6, 7]))).toMatch(/^C[A-Z2-9]{7}$/)
  })

  test("acompanhamento das resoluções", () => {
    expect(resolucaoAtrasada({ prazo: "2027-07-01", situacao: "em_andamento" }, "2027-07-02")).toBe(true)
    expect(resolucaoAtrasada({ prazo: "2027-07-01", situacao: "cumprida" }, "2027-07-02")).toBe(false)
    const r = resumoResolucoes([{ prazo: null, situacao: "cumprida" }, { prazo: "2027-01-01", situacao: "a_encaminhar" }, { prazo: null, situacao: "parcial" }, { prazo: null, situacao: "em_andamento" }], "2027-07-02")
    expect([r.total, r.atrasadas, r.percentualConcluido, r.porSituacao.cumprida]).toEqual([4, 1, 50, 1])
  })

  test("memória acha o que já foi decidido, sem acento e sem palavras vazias", () => {
    const candidatos = [
      { item: "R3", texto: "Lutar pela reposição integral da inflação no acordo coletivo" },
      { item: "R7", texto: "Defender a Petrobras pública e integrada" },
    ]
    expect(lembrar("Reposicao integral da inflacao no proximo acordo", candidatos).map((x) => x.item)).toEqual(["R3"])
    expect(lembrar("Creche para os filhos dos delegados", candidatos)).toEqual([])
    expect(lembrar("de a o", candidatos)).toEqual([])
  })
})
