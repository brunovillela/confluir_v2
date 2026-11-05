import { expect, test } from "playwright/test"

import {
  alinharVinculos,
  chaveTelefone,
  emailsDosCadastros,
  montarEnvio,
  papeisPadraoEmails,
  papeisPadraoTelefones,
  paresDeVinculos,
  telefonesDosCadastros,
  trocarPapel,
  type Decisao,
  type FichaMesclagem,
  type VinculoFicha,
} from "@/lib/mesclagem-cadastros"

/** Regras da mesclagem lado a lado (lib/mesclagem-cadastros.ts). */

const ficha = (id: string, parcial: Partial<FichaMesclagem> & { v?: Record<string, string | null> } = {}): FichaMesclagem => ({
  id,
  valores: parcial.v ?? {},
  whatsapp1: false,
  whatsapp2: false,
  criadoEm: null,
  atualizadoEm: null,
  optoutEm: null,
  emails: [],
  telefones: [],
  enderecos: [],
  emergencia: [],
  contas: [],
  vinculos: [],
  contagens: { contribuicoes: 0, valorContribuicoes: 0, prontuario: 0, reembolsos: 0, eventos: 0 },
  ...parcial,
})

const vinculo = (id: string, parcial: Partial<VinculoFicha> = {}): VinculoFicha => ({
  id,
  fonteId: "fonte-a",
  fonte: "Fonte A",
  matricula: null,
  cargo: null,
  lotacao: null,
  admissao: null,
  demissao: null,
  filiacao: null,
  desfiliacao: null,
  fichaUrl: null,
  cartaUrl: null,
  ...parcial,
})

const decisao = (principal: string, fichas: FichaMesclagem[], parcial: Partial<Decisao> = {}): Decisao => ({
  principal,
  campos: {},
  telefones: papeisPadraoTelefones(fichas, principal),
  emails: papeisPadraoEmails(fichas, principal),
  enderecosDescartados: [],
  emergenciaDescartados: [],
  vinculos: {},
  contaFavorita: null,
  ...parcial,
})

test.describe("telefones", () => {
  test("a mesma pessoa com grafias diferentes é um número só", () => {
    expect(chaveTelefone("+55 (21) 98877-6655")).toBe("21988776655")
    const itens = telefonesDosCadastros([
      ficha("a", { v: { telefone_1: "(21) 98877-6655" }, whatsapp1: true }),
      ficha("b", { v: { telefone_1: "21988776655" } }),
    ])
    expect(itens).toHaveLength(1)
    expect(itens[0].whatsapp).toBe(true)
    expect(Object.keys(itens[0].origens)).toEqual(["a", "b"])
  })

  test("dois números diferentes viram Telefone 1 e Telefone 2", () => {
    const fichas = [
      ficha("a", { v: { telefone_1: "21911111111" } }),
      ficha("b", { v: { telefone_1: "21922222222" } }),
    ]
    expect(papeisPadraoTelefones(fichas, "a")).toEqual({ "21911111111": "telefone_1", "21922222222": "telefone_2" })
    expect(papeisPadraoTelefones(fichas, "b")).toEqual({ "21922222222": "telefone_1", "21911111111": "telefone_2" })
  })

  test("o terceiro número vai para Outros contatos, sem se perder", () => {
    const fichas = [
      ficha("a", { v: { telefone_1: "21911111111", telefone_2: "21922222222" } }),
      ficha("b", { v: { telefone_1: "21933333333" } }),
    ]
    const d = decisao("a", fichas)
    expect(d.telefones["21933333333"]).toBe("outros")
    const envio = montarEnvio(fichas, d)
    expect(envio.campos.telefone_1).toBe("21911111111")
    expect(envio.campos.telefone_2).toBe("21922222222")
    expect(envio.contatos.telefones_outros).toEqual([{ numero: "21933333333", whatsapp: false }])
  })

  test("dar um lugar ocupado manda o outro para Outros contatos", () => {
    const novo = trocarPapel({ x: "telefone_1", y: "telefone_2" }, "y", "telefone_1", ["telefone_1", "telefone_2"], "outros")
    expect(novo).toEqual({ x: "outros", y: "telefone_1" })
  })

  test("o que já está em Outros contatos não é inserido de novo", () => {
    const fichas = [ficha("a"), ficha("b", { telefones: [{ numero: "21933333333", whatsapp: false, tipo: null }] })]
    const envio = montarEnvio(fichas, decisao("a", fichas))
    expect(envio.contatos.telefones_outros).toEqual([])
  })

  test("não guardar registra para o prontuário", () => {
    const fichas = [ficha("a", { v: { telefone_1: "21911111111" } }), ficha("b", { v: { telefone_1: "21922222222" } })]
    const d = decisao("a", fichas)
    const envio = montarEnvio(fichas, { ...d, telefones: { ...d.telefones, "21922222222": "descartar" } })
    expect(envio.campos.telefone_2).toBeNull()
    expect(envio.contatos.telefones_descartar).toEqual(["21922222222"])
    expect(envio.contatos.rotulos_descartados).toEqual(["21922222222"])
  })
})

test.describe("e-mails", () => {
  test("une os dois, ignorando caixa, cada um no seu lugar", () => {
    const fichas = [
      ficha("a", { v: { email_pessoal: "Ana@Exemplo.com" } }),
      ficha("b", { v: { email_pessoal: "ana@exemplo.com", email_corporativo: "ana@empresa.com" } }),
    ]
    expect(emailsDosCadastros(fichas)).toHaveLength(2)
    const envio = montarEnvio(fichas, decisao("a", fichas))
    expect(envio.campos.email_pessoal).toBe("ana@exemplo.com")
    expect(envio.campos.email_corporativo).toBe("ana@empresa.com")
  })

  test("o e-mail pessoal do outro não cabe: vai para Outros contatos", () => {
    const fichas = [
      ficha("a", { v: { email_pessoal: "a@x.com" } }),
      ficha("b", { v: { email_pessoal: "b@x.com" } }),
    ]
    const envio = montarEnvio(fichas, decisao("a", fichas))
    expect(envio.campos.email_pessoal).toBe("a@x.com")
    expect(envio.contatos.emails_outros).toEqual([{ email: "b@x.com", tipo: null }])
  })
})

test.describe("campos de um valor", () => {
  test("vale o principal; vazio nele, o outro completa", () => {
    const fichas = [
      ficha("a", { v: { nome_completo: "Ana", sexo: null } }),
      ficha("b", { v: { nome_completo: "ANA LIMA", sexo: "Feminino" } }),
    ]
    const envio = montarEnvio(fichas, decisao("a", fichas))
    expect(envio.campos.nome_completo).toBe("Ana")
    expect(envio.campos.sexo).toBe("Feminino")
  })

  test("quem está Ativo em algum cadastro fica Ativo, mesmo no outro", () => {
    const fichas = [ficha("a", { v: { filiacao_condicao: "Inativo" } }), ficha("b", { v: { filiacao_condicao: "Ativo", ativo_em: "2024-01-01" } })]
    expect(montarEnvio(fichas, decisao("a", fichas)).campos).toMatchObject({ filiacao_condicao: "Ativo", ativo_em: "2024-01-01" })
  })

  test("a escolha da pessoa vence, e o que acompanha vai junto", () => {
    const fichas = [
      ficha("a", { v: { filiacao_condicao: "Inativo", inativo_em: "2020-01-01", tl_lgpd_id: "t1", tl_lgpd_data: "2019-01-01" } }),
      ficha("b", { v: { filiacao_condicao: "Ativo", ativo_em: "2024-02-02", tl_lgpd_id: "t2", tl_lgpd_data: "2024-02-02" } }),
    ]
    const envio = montarEnvio(fichas, decisao("a", fichas, { campos: { filiacao_condicao: "b", tl_lgpd_id: "b" } }))
    expect(envio.campos).toMatchObject({
      filiacao_condicao: "Ativo",
      ativo_em: "2024-02-02",
      inativo_em: null,
      tl_lgpd_id: "t2",
      tl_lgpd_data: "2024-02-02",
    })
  })
})

test.describe("endereços", () => {
  const rua = (cep: string, numero: string) => ({ endereco_cep: cep, endereco_logradouro: "Rua A", endereco_numero: numero })

  test("o endereço não escolhido é guardado em Outros contatos", () => {
    const fichas = [ficha("a", { v: rua("24000000", "10") }), ficha("b", { v: rua("25000000", "20") })]
    const envio = montarEnvio(fichas, decisao("a", fichas))
    expect(envio.campos.endereco_cep).toBe("24000000")
    expect(envio.contatos.enderecos_outros).toHaveLength(1)
    expect(envio.contatos.enderecos_outros[0]).toMatchObject({ cep: "25000000", numero: "20" })
  })

  test("o mesmo lugar não vira dois", () => {
    const fichas = [ficha("a", { v: rua("24000-000", "10") }), ficha("b", { v: rua("24000000", "10") })]
    expect(montarEnvio(fichas, decisao("a", fichas)).contatos.enderecos_outros).toEqual([])
  })
})

test.describe("vínculos", () => {
  test("o mesmo emprego se alinha e já vem sugerido unir", () => {
    const fichas = [
      ficha("a", { vinculos: [vinculo("v1", { matricula: "003002", filiacao: "2010-01-01" })] }),
      ficha("b", { vinculos: [vinculo("v2", { matricula: "3002", filiacao: "2015-01-01" })] }),
    ]
    const [linha, ...resto] = alinharVinculos(fichas, "a")
    expect(resto).toHaveLength(0)
    expect(linha.sugerirUnir).toBe(true)
    expect(montarEnvio(fichas, decisao("a", fichas)).vinculos).toEqual([{ fica: "v1", sai: "v2" }])
  })

  test("o par verdadeiro se encontra, mesmo com vínculo antigo da mesma fonte", () => {
    const fichas = [
      ficha("a", { vinculos: [vinculo("v1", { matricula: "003002", filiacao: "2012-03-15" })] }),
      ficha("b", {
        vinculos: [
          vinculo("antigo", { matricula: "7788", filiacao: "2005-02-01", desfiliacao: "2010-02-01" }),
          vinculo("v2", { matricula: "3002", filiacao: "2015-01-10" }),
        ],
      }),
    ]
    const linhas = alinharVinculos(fichas, "b")
    expect(linhas).toHaveLength(2)
    expect(montarEnvio(fichas, decisao("b", fichas)).vinculos).toEqual([{ fica: "v2", sai: "v1" }])
  })

  test("fica o que tem documento, mesmo no outro cadastro", () => {
    const fichas = [
      ficha("a", { vinculos: [vinculo("v1", { matricula: "1" })] }),
      ficha("b", { vinculos: [vinculo("v2", { matricula: "1", fichaUrl: "http://x" })] }),
    ]
    expect(alinharVinculos(fichas, "a")[0].ficaSugerido).toBe("v2")
  })

  test("fontes diferentes nunca dividem linha", () => {
    const fichas = [
      ficha("a", { vinculos: [vinculo("v1")] }),
      ficha("b", { vinculos: [vinculo("v2", { fonteId: "fonte-b", fonte: "Fonte B" })] }),
    ]
    expect(alinharVinculos(fichas, "a")).toHaveLength(2)
    expect(montarEnvio(fichas, decisao("a", fichas)).vinculos).toEqual([])
  })

  test("mesma fonte sem mesma matrícula: alinha, mas só une se a pessoa pedir", () => {
    const fichas = [
      ficha("a", { vinculos: [vinculo("v1", { matricula: "1" })] }),
      ficha("b", { vinculos: [vinculo("v2", { matricula: "2" })] }),
    ]
    const linhas = alinharVinculos(fichas, "a")
    expect(linhas).toHaveLength(1)
    expect(linhas[0].sugerirUnir).toBe(false)
    expect(paresDeVinculos(linhas, {})).toEqual([])
    expect(paresDeVinculos(linhas, { [linhas[0].chave]: { unir: true, fica: "v2" } })).toEqual([{ fica: "v2", sai: "v1" }])
  })

  test("refiliação com períodos separados não vem sugerida e avisa", () => {
    const fichas = [
      ficha("a", { vinculos: [vinculo("v1", { matricula: "1", filiacao: "2010-01-01", desfiliacao: "2015-01-01" })] }),
      ficha("b", { vinculos: [vinculo("v2", { matricula: "1", filiacao: "2020-01-01" })] }),
    ]
    const [linha] = alinharVinculos(fichas, "a")
    expect(linha.sugerirUnir).toBe(false)
    expect(linha.periodosSeparados).toBe(true)
  })

  test("dois vínculos no mesmo cadastro seguem separados", () => {
    const fichas = [
      ficha("a", { vinculos: [vinculo("v1", { matricula: "1" }), vinculo("v2", { matricula: "1" })] }),
      ficha("b"),
    ]
    expect(alinharVinculos(fichas, "a")).toHaveLength(2)
    expect(montarEnvio(fichas, decisao("a", fichas)).vinculos).toEqual([])
  })

  test("a linha não muda de identidade ao trocar o principal", () => {
    const fichas = [
      ficha("a", { vinculos: [vinculo("v1", { matricula: "1" })] }),
      ficha("b", { vinculos: [vinculo("v2", { matricula: "1" })] }),
    ]
    expect(alinharVinculos(fichas, "a")[0].chave).toBe(alinharVinculos(fichas, "b")[0].chave)
  })
})

test.describe("contas e contatos de emergência", () => {
  const conta = (id: string, parcial = {}) => ({
    id,
    banco: "341",
    agencia: "1234",
    conta: "5678-9",
    pix: null,
    favorecido: null,
    favorito: false,
    ...parcial,
  })

  test("a mesma conta nos dois cadastros vira uma, ficando a do principal", () => {
    const fichas = [ficha("a", { contas: [conta("c1")] }), ficha("b", { contas: [conta("c2", { favorito: true })] })]
    const envio = montarEnvio(fichas, decisao("b", fichas))
    expect(envio.contatos.contas_unir).toEqual([{ fica: "c2", sai: "c1" }])
    expect(envio.contatos.conta_favorita).toBe("c2")
  })

  test("o mesmo contato de emergência fica uma vez; o descartado sai", () => {
    const c = (id: string, nome: string, telefone: string) => ({ id, nome, telefone, vinculo: null })
    const fichas = [
      ficha("a", { emergencia: [c("e1", "Rosa", "21911111111"), c("e3", "Pedro", "21933333333")] }),
      ficha("b", { emergencia: [c("e2", "Rosa Lima", "(21) 91111-1111")] }),
    ]
    const envio = montarEnvio(fichas, decisao("a", fichas, { emergenciaDescartados: ["21933333333"] }))
    expect(envio.contatos.emergencia_descartar.sort()).toEqual(["e2", "e3"])
  })
})
