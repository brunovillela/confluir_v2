import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

import { expect, test } from "playwright/test"

import {
  envioDaMarca,
  marcaComEnvio,
  marcaSemEnvio,
  MODULOS_EMAIL,
  PROCESSOS_EMAIL,
  processoEmail,
  tituloModuloEmail,
} from "../../src/lib/email-processos"

/** Gestão › E-mail: catálogo dos processos que enviam e-mail (23/11/2026). */

test("todo processo de e-mail aponta para um módulo existente", () => {
  const modulos = new Set(MODULOS_EMAIL.map((m) => m.slug))
  for (const p of PROCESSOS_EMAIL) expect(modulos.has(p.modulo), p.chave).toBe(true)
})

test("chaves de processo de e-mail são únicas, no formato modulo.nome e no módulo do prefixo", () => {
  const chaves = PROCESSOS_EMAIL.map((p) => p.chave)
  expect(new Set(chaves).size).toBe(chaves.length)
  for (const p of PROCESSOS_EMAIL) {
    expect(p.chave).toMatch(/^[a-z]+\.[a-z_]+$/)
    expect(p.chave.split(".")[0], p.chave).toBe(p.modulo)
  }
})

test("processo de e-mail fora do catálogo vira 'não identificado' em Outros", () => {
  expect(processoEmail("inventado.xyz")).toEqual({ chave: "inventado.xyz", titulo: "Processo não identificado", modulo: "outros" })
  expect(processoEmail(undefined).chave).toBe("nao_identificado")
  expect(processoEmail("acesso.codigo").essencial).toBe(true)
  expect(tituloModuloEmail("nao-existe")).toBe("Outros")
})

test("marca do envio no X-Mailin-custom convive com a da votação", () => {
  const id = "0b9f3c1e-2a4d-4c8e-9f00-1234567890ab"
  const voto = "voto|11111111-1111-4111-8111-111111111111|a|22222222-2222-4222-8222-222222222222"
  expect(marcaComEnvio(undefined, id)).toBe(`e:${id}`)
  expect(marcaComEnvio(voto, id)).toBe(`${voto}|e:${id}`)
  expect(envioDaMarca(`e:${id}`)).toBe(id)
  expect(envioDaMarca(`${voto}|e:${id}`)).toBe(id)
  expect(envioDaMarca(voto)).toBeNull()
  expect(marcaSemEnvio(`${voto}|e:${id}`)).toBe(voto)
  expect(marcaSemEnvio(voto)).toBe(voto)
})

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? arquivos(p) : /\.tsx?$/.test(n) ? [p] : []
  })
}

test("toda chamada a enviarEmail passa um processo do catálogo", () => {
  const validos = new Set(PROCESSOS_EMAIL.map((p) => p.chave))
  let chamadas = 0
  for (const f of arquivos("src")) {
    if (f.replaceAll("\\", "/").endsWith("src/lib/email.ts")) continue
    const fonte = readFileSync(f, "utf8")
    for (const m of fonte.matchAll(/enviarEmail\(\{/g)) {
      chamadas++
      const trecho = fonte.slice(m.index, m.index + 200)
      const proc = /processo: "([a-z_.]+)"/.exec(trecho)?.[1]
      expect(proc, `${f}: chamada sem processo`).toBeTruthy()
      expect(validos.has(proc!), `${f}: processo ${proc} fora do catálogo`).toBe(true)
    }
  }
  expect(chamadas).toBeGreaterThan(80)
})

test("evento do Brevo vira entrega, adiamento ou rejeição no registro", async () => {
  const { mudancaDoEvento } = await import("../../src/lib/email-processos")
  expect(mudancaDoEvento({ event: "delivered", ts_event: 1795400000 })).toEqual({ entregue_em: "2026-11-23T02:13:20.000Z" })
  expect(mudancaDoEvento({ event: "soft_bounce", ts_event: 1795400000 })).toEqual({ adiado_em: "2026-11-23T02:13:20.000Z" })
  expect(mudancaDoEvento({ event: "deferred", ts_event: 1795400000000 })).toEqual({ adiado_em: "2026-11-23T02:13:20.000Z" })
  expect(mudancaDoEvento({ event: "hard_bounce", reason: "domain not found", ts_event: 1795400000 })).toEqual({
    rejeitado_em: "2026-11-23T02:13:20.000Z",
    rejeicao: "hard_bounce: domain not found",
  })
  expect(mudancaDoEvento({ event: "spam", ts_event: 1795400000 })?.rejeicao).toBe("spam")
  expect(mudancaDoEvento({ event: "click" })).toBeNull()
  expect(mudancaDoEvento({ event: "opened" })).toBeNull()
})

test("estado do envio: rejeição vence entrega, entrega vence adiamento", async () => {
  const { estadoDoEnvio } = await import("../../src/lib/email-processos")
  const base = { situacao: "enviado", entregueEm: null, adiadoEm: null, rejeitadoEm: null }
  expect(estadoDoEnvio(base)).toBe("aguardando")
  expect(estadoDoEnvio({ ...base, adiadoEm: "x" })).toBe("adiado")
  expect(estadoDoEnvio({ ...base, adiadoEm: "x", entregueEm: "y" })).toBe("entregue")
  expect(estadoDoEnvio({ ...base, entregueEm: "y", rejeitadoEm: "z" })).toBe("rejeitado")
  expect(estadoDoEnvio({ ...base, situacao: "falhou" })).toBe("falhou")
  expect(estadoDoEnvio({ ...base, situacao: "teste", entregueEm: "y" })).toBe("teste")
})

test("travas da Gestão: essencial passa por módulo, teto e cota; endereço bloqueado barra tudo", async () => {
  const { motivoParaBarrar, CONTROLES_PADRAO } = await import("../../src/lib/email-processos")
  const base = { enderecoBloqueado: false, enviadosNoMes: 0, departamentoId: "d1", enviadosDoDepartamento: 0, controles: CONTROLES_PADRAO }
  // Sem controles, tudo sai.
  expect(motivoParaBarrar({ ...base, processo: "compras.ordem_compra" })).toBeNull()
  // Módulo desligado barra o comum, não o essencial do mesmo módulo.
  const semCompras = { ...CONTROLES_PADRAO, modulosDesligados: ["compras"] }
  expect(motivoParaBarrar({ ...base, controles: semCompras, processo: "compras.ordem_compra" })).toMatch(/desligado no módulo Compras/)
  expect(motivoParaBarrar({ ...base, controles: semCompras, processo: "compras.rpa_assinatura_codigo" })).toBeNull()
  // Teto: só barra com "parar no teto".
  const teto = { ...CONTROLES_PADRAO, limiteMensal: 100, bloquearNoLimite: true }
  expect(motivoParaBarrar({ ...base, controles: teto, enviadosNoMes: 100, processo: "comunicacao.mensagens_filiados" })).toMatch(/teto mensal/)
  expect(motivoParaBarrar({ ...base, controles: teto, enviadosNoMes: 99, processo: "comunicacao.mensagens_filiados" })).toBeNull()
  expect(motivoParaBarrar({ ...base, controles: { ...teto, bloquearNoLimite: false }, enviadosNoMes: 500, processo: "comunicacao.mensagens_filiados" })).toBeNull()
  expect(motivoParaBarrar({ ...base, controles: teto, enviadosNoMes: 500, processo: "votacao.aviso_link" })).toBeNull()
  // Cota do departamento de quem disparou.
  const cota = { ...CONTROLES_PADRAO, bloquearNoLimite: true, cotasDepartamento: { d1: 10 } }
  expect(motivoParaBarrar({ ...base, controles: cota, enviadosDoDepartamento: 10, processo: "financeiro.reembolso" })).toMatch(/cota mensal/)
  expect(motivoParaBarrar({ ...base, controles: cota, departamentoId: "d2", enviadosDoDepartamento: 10, processo: "financeiro.reembolso" })).toBeNull()
  // Endereço bloqueado barra até o essencial.
  expect(motivoParaBarrar({ ...base, enderecoBloqueado: true, processo: "acesso.codigo" })).toMatch(/Endereço bloqueado/)
})
