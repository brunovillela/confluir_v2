import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"

import { expect, test } from "playwright/test"

import {
  descreverExigencias,
  destinoAoConcluir,
  exigenciasDoPrimeiroAcesso,
  voltarAoPrimeiroAcesso,
  voltarDaOposicao,
  type ConfigDasExigencias,
} from "@/app/portal/primeiro-acesso/regras"
import {
  definicaoDaParte,
  estadoEfetivo,
  normalizarOpcoes,
  opcoesPadrao,
  parteDoLink,
  type EstadoParte,
} from "@/lib/portal-partes-constantes"

test.describe("Área do associado: volta automática (estadoEfetivo)", () => {
  test("volta no dia marcado e depois; antes, não", () => {
    expect(estadoEfetivo("suspensa", "2026-11-17", "2026-11-17")).toBe("habilitada")
    expect(estadoEfetivo("desabilitada", "2026-11-16", "2026-11-17")).toBe("habilitada")
    expect(estadoEfetivo("suspensa", "2026-11-18", "2026-11-17")).toBe("suspensa")
    expect(estadoEfetivo("suspensa", null, "2026-11-17")).toBe("suspensa")
    expect(estadoEfetivo("habilitada", "2026-11-01", "2026-11-17")).toBe("habilitada")
  })
})

test.describe("Área do associado: a parte de cada link (parteDoLink)", () => {
  test("o prefixo mais longo vence; busca e âncora não contam", () => {
    expect(parteDoLink("/portal/eventos/agenda/1")).toBe("agenda")
    expect(parteDoLink("/portal/eventos#evento-1")).toBe("eventos")
    expect(parteDoLink("/portal/atendimento/abc?motivo=desfiliacao")).toBe("atendimento")
    expect(parteDoLink("/portal/hospedagem/reserva/1")).toBe("hospedagem")
  })

  test("prefixo parecido e fora do portal não são parte nenhuma", () => {
    expect(parteDoLink("/portal/cadastroX")).toBeNull()
    expect(parteDoLink("/votar")).toBeNull()
    expect(parteDoLink(null)).toBeNull()
  })
})

test.describe("Área do associado: opções gravadas (normalizarOpcoes)", () => {
  test("tipo errado e número fora dos limites voltam ao padrão", () => {
    const padrao = opcoesPadrao("atendimento")
    expect(normalizarOpcoes("atendimento", { prazo_reabrir_dias: 200 }).prazo_reabrir_dias).toBe(padrao.prazo_reabrir_dias)
    expect(normalizarOpcoes("atendimento", { prazo_reabrir_dias: "7" }).prazo_reabrir_dias).toBe(7)
    expect(normalizarOpcoes("atendimento", { prazo_reabrir_dias: 2.5 }).prazo_reabrir_dias).toBe(padrao.prazo_reabrir_dias)
    expect(normalizarOpcoes("primeiro_acesso", { exigir: "sim" }).exigir).toBe(opcoesPadrao("primeiro_acesso").exigir)
    expect(normalizarOpcoes("primeiro_acesso", null)).toEqual(opcoesPadrao("primeiro_acesso"))
  })

  test("lista: item desconhecido sai, repetido conta uma vez", () => {
    const op = normalizarOpcoes("primeiro_acesso", { campos_obrigatorios: ["email", "email", "cpf", "telefone"] })
    expect(op.campos_obrigatorios).toEqual(["email", "telefone"])
  })
})

test.describe("Primeiro acesso: endereços de ida e volta", () => {
  test("o destino ao concluir é do portal e nunca a própria página", () => {
    expect(destinoAoConcluir("/portal/carteirinha")).toBe("/portal/carteirinha")
    expect(destinoAoConcluir("/portal/primeiro-acesso?next=x")).toBe("/portal/inicio")
    expect(destinoAoConcluir("//evil.com")).toBe("/portal/inicio")
    expect(destinoAoConcluir("https://evil.com/portal")).toBe("/portal/inicio")
  })

  test("o voltar dos formulários só aceita o primeiro acesso ou a oposição", () => {
    expect(voltarAoPrimeiroAcesso("/portal/primeiro-acesso?next=%2Fportal%2Fcarteirinha&feito=termo")).toBe(
      "/portal/primeiro-acesso?next=%2Fportal%2Fcarteirinha&feito=termo"
    )
    expect(voltarAoPrimeiroAcesso("/portal/primeiro-acesso?feito=qualquer")).toBe("/portal/primeiro-acesso")
    expect(voltarAoPrimeiroAcesso("//evil.com/portal/primeiro-acesso")).toBeNull()
    expect(voltarAoPrimeiroAcesso("/portal/carteirinha")).toBeNull()
    const campanha = "/portal/oposicao/11111111-2222-4333-8444-555555555555"
    expect(voltarDaOposicao(`${campanha}?feito=dados`)).toBe(`${campanha}?feito=dados`)
    expect(voltarDaOposicao(`${campanha}?feito=outro`)).toBe(campanha)
    expect(voltarDaOposicao("/portal/oposicao/nao-e-uuid")).toBeNull()
  })
})

/** Configuração mínima para as exigências, a partir do padrão das opções. */
function config(o: {
  portal?: EstadoParte
  cadastro?: EstadoParte
  exigir?: boolean
  exigirTermo?: boolean
  campos?: string[]
  editaveis?: string[]
  contatosEmergencia?: boolean
}): ConfigDasExigencias {
  const pa = opcoesPadrao("primeiro_acesso")
  const cad = opcoesPadrao("cadastro")
  return {
    partes: {
      portal: { estado: o.portal ?? "habilitada" },
      primeiro_acesso: {
        opcoes: {
          exigir: o.exigir ?? pa.exigir,
          exigir_termo: o.exigirTermo ?? pa.exigir_termo,
          campos_obrigatorios: o.campos ?? pa.campos_obrigatorios,
        },
      },
      cadastro: {
        estado: o.cadastro ?? "habilitada",
        opcoes: {
          campos_editaveis: o.editaveis ?? cad.campos_editaveis,
          contatos_emergencia: o.contatosEmergencia ?? cad.contatos_emergencia,
        },
      },
    },
  }
}

test.describe("Primeiro acesso: o que vale de fato (exigenciasDoPrimeiroAcesso)", () => {
  test("o padrão: termo, e-mail, telefone e endereço", () => {
    const ex = exigenciasDoPrimeiroAcesso(config({}))
    expect(ex.ativo).toBe(true)
    expect(ex.termo).toBe(true)
    expect(ex.itens).toEqual(["email", "telefone", "endereco"])
    expect(descreverExigencias(ex)).toBe("o termo de privacidade, um e-mail, um telefone e o endereço completo")
  })

  test("portal pausado ou opção desligada: nada", () => {
    expect(exigenciasDoPrimeiroAcesso(config({ portal: "suspensa" })).inativoPor).toBe("portal_suspenso")
    expect(exigenciasDoPrimeiroAcesso(config({ portal: "desabilitada" })).inativoPor).toBe("portal_fora_do_ar")
    const desligado = exigenciasDoPrimeiroAcesso(config({ exigir: false }))
    expect(desligado.ativo).toBe(false)
    expect(desligado.inativoPor).toBe("desligado")
    // Desligado E portal pausado: é o desligado que vale (nada volta a valer quando o portal reabrir).
    expect(exigenciasDoPrimeiroAcesso(config({ exigir: false, portal: "suspensa" })).inativoPor).toBe("desligado")
  })

  test("dado que Meu cadastro não deixa alterar sai, e diz por quê", () => {
    const ex = exigenciasDoPrimeiroAcesso(config({ editaveis: ["email_pessoal", "telefones"] }))
    expect(ex.itens).toEqual(["email", "telefone"])
    expect(ex.descartados.map((d) => d.item)).toEqual(["endereco"])
  })

  test("Meu cadastro suspenso: só o termo; contato de emergência só com o cartão ligado", () => {
    const suspenso = exigenciasDoPrimeiroAcesso(config({ cadastro: "suspensa" }))
    expect(suspenso.itens).toEqual([])
    expect(suspenso.termo).toBe(true)
    expect(suspenso.descartados).toHaveLength(3)
    const semCartao = exigenciasDoPrimeiroAcesso(
      config({ campos: ["contato_emergencia"], contatosEmergencia: false })
    )
    expect(semCartao.itens).toEqual([])
    expect(semCartao.descartados.map((d) => d.item)).toEqual(["contato_emergencia"])
  })
})

/** Os page.tsx de src/app/portal, com a rota de cada um ([id] vira um segmento qualquer). */
function paginasDoPortal(): { rota: string; arquivo: string }[] {
  const raiz = join(process.cwd(), "src", "app", "portal")
  const saida: { rota: string; arquivo: string }[] = []
  const andar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const p = join(dir, nome)
      if (statSync(p).isDirectory()) andar(p)
      else if (nome === "page.tsx") {
        const rel = relative(join(process.cwd(), "src", "app"), dir).split(sep).join("/")
        saida.push({ rota: `/${rel.replace(/\[[^\]]+\]/g, "x")}`, arquivo: p })
      }
    }
  }
  andar(raiz)
  return saida
}

test.describe("Área do associado: toda página de parte que se desabilita confere o estado", () => {
  // No Next 16 a página roda mesmo com o layout da seção mostrando
  // "indisponível" (GuardaParte): cada página precisa conferir de novo.
  test("paginaIndisponivel, ParteIndisponivel ou o estado da parte no topo", () => {
    const faltando: string[] = []
    for (const { rota, arquivo } of paginasDoPortal()) {
      const parte = parteDoLink(rota)
      if (!parte || !definicaoDaParte(parte).podeDesabilitar) continue
      const codigo = readFileSync(arquivo, "utf8")
      const confere =
        codigo.includes("paginaIndisponivel(") ||
        codigo.includes("ParteIndisponivel") ||
        /configDaParte\(\s*"/.test(codigo) ||
        codigo.includes("estadoDaParte(")
      if (!confere) faltando.push(`${rota} (${parte})`)
    }
    expect(faltando, "páginas sem a guarda da parte").toEqual([])
  })
})
