#!/usr/bin/env node
/**
 * Agente do controle de acesso — Confluir
 *
 * Roda no computador da recepção de uma sede e liga o Confluir (na nuvem) ao
 * sistema de catracas da sede. Só faz conexões de SAÍDA: a cada poucos
 * segundos procura o Confluir, recebe comandos e devolve os resultados.
 * Não precisa de porta aberta no firewall.
 *
 * Uso (Node.js 18 ou mais novo, sem dependências):
 *   node agente-confluir.mjs parear      assistente: endereço do Confluir + código de 6 dígitos
 *   node agente-confluir.mjs verificar   roda a lista de verificação uma vez e mostra na tela
 *   node agente-confluir.mjs             fica rodando (é o que o instalador agenda com o Windows)
 *
 * Configuração em %ProgramData%\Confluir\agente.json (ou no caminho de
 * CONFLUIR_AGENTE_CONFIG). Registro em agente.log na mesma pasta.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs"
import { hostname, homedir, release, type as tipoSistema } from "node:os"
import { dirname, join } from "node:path"
import { createInterface } from "node:readline"

const VERSAO = "0.1.0"
const INTERVALO_CONTATO_MS = 5_000
const INTERVALO_VERIFICACAO_MS = 10 * 60_000
const ESPERA_MAXIMA_MS = 60_000

const PASTA = process.env.CONFLUIR_AGENTE_CONFIG
  ? dirname(process.env.CONFLUIR_AGENTE_CONFIG)
  : process.platform === "win32"
    ? join(process.env.ProgramData ?? "C:\\ProgramData", "Confluir")
    : join(homedir(), ".confluir-agente")
const ARQ_CONFIG = process.env.CONFLUIR_AGENTE_CONFIG ?? join(PASTA, "agente.json")
const ARQ_LOG = join(PASTA, "agente.log")
const MAQUINA = `${hostname()} · ${tipoSistema()} ${release()}`

// ── Registro ─────────────────────────────────────────────────────────────────

function registrar(msg) {
  const linha = `${new Date().toISOString()} ${msg}`
  console.log(linha)
  try {
    mkdirSync(PASTA, { recursive: true })
    if (existsSync(ARQ_LOG) && statSync(ARQ_LOG).size > 1_000_000) renameSync(ARQ_LOG, `${ARQ_LOG}.1`)
    appendFileSync(ARQ_LOG, `${linha}\n`)
  } catch {
    // sem disco para o log: segue só no console
  }
}

// ── Configuração ─────────────────────────────────────────────────────────────

function lerConfig() {
  if (!existsSync(ARQ_CONFIG)) return null
  return JSON.parse(readFileSync(ARQ_CONFIG, "utf8"))
}

function gravarConfig(c) {
  mkdirSync(dirname(ARQ_CONFIG), { recursive: true })
  writeFileSync(ARQ_CONFIG, JSON.stringify(c, null, 2), { mode: 0o600 })
}

// ── Conversa com o Confluir ──────────────────────────────────────────────────

async function chamar(cfg, caminho, corpo, token = cfg.token) {
  const r = await fetch(new URL(caminho, cfg.endereco), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(corpo ?? {}),
    signal: AbortSignal.timeout(15_000),
  })
  let json = {}
  try {
    json = await r.json()
  } catch {
    // resposta sem JSON (proxy, página de erro)
  }
  return { status: r.status, json }
}

// ── Conectores (sistemas de catracas) ────────────────────────────────────────
//
// Cada conector responde às quatro verificações que o Confluir mostra:
// servidor, login, permissão e teste. Devolve [{ id, ok, detalhe }].

async function esperar(ms) {
  await new Promise((r) => setTimeout(r, ms))
}

const CONECTORES = {
  /** Sem catraca: responde como se tudo existisse. `simular_falha` força uma etapa a falhar. */
  async simulado(cfg) {
    const falha = cfg.simulado?.simular_falha ?? null
    const etapas = [
      ["servidor", "servidor simulado na rede"],
      ["login", "usuário de integração simulado"],
      ["permissao", "permissão de visitantes simulada"],
      ["teste", "visitante fictício cadastrado e apagado (simulado)"],
    ]
    const r = []
    for (const [id, detalhe] of etapas) {
      await esperar(300)
      if (falha === id) {
        r.push({ id, ok: false, detalhe: "falha simulada" })
        break
      }
      r.push({ id, ok: true, detalhe })
    }
    return r
  },

  /**
   * Control iD com servidor local (iDSecure). Por enquanto só confere se o
   * servidor responde na rede: login, permissão e teste dependem da
   * documentação da API do iDSecure, pedida ao fornecedor.
   */
  async controlid_local(cfg) {
    const base = cfg.controlid?.endereco
    if (!base) return [{ id: "servidor", ok: false, detalhe: "endereço do servidor não configurado; rode o assistente de novo" }]
    try {
      const r = await fetch(base, { signal: AbortSignal.timeout(8_000) })
      const servidor = { id: "servidor", ok: true, detalhe: `${base} respondeu (HTTP ${r.status})` }
      return [servidor, { id: "login", ok: false, detalhe: "conector Control iD aguardando a documentação da API do iDSecure" }]
    } catch (e) {
      return [{ id: "servidor", ok: false, detalhe: `${base} não respondeu: ${e?.cause?.code ?? e?.name ?? "erro"}` }]
    }
  },
}

async function verificar(cfg) {
  const conector = CONECTORES[cfg.conector]
  if (!conector) return [{ id: "servidor", ok: false, detalhe: `conector desconhecido: ${cfg.conector}` }]
  try {
    return await conector(cfg)
  } catch (e) {
    return [{ id: "servidor", ok: false, detalhe: `erro no conector: ${e?.message ?? e}` }]
  }
}

async function enviarDiagnostico(cfg, comandoId = null) {
  const verificacoes = await verificar(cfg)
  const { status, json } = await chamar(cfg, "/api/acesso/agente/diagnostico", { comandoId, verificacoes })
  const resumo = verificacoes.map((v) => `${v.id}=${v.ok ? "ok" : "falha"}`).join(" ")
  registrar(status === 200 ? `verificação enviada: ${resumo}` : `verificação não aceita (HTTP ${status}): ${json.erro ?? ""}`)
}

// ── Assistente de pareamento ─────────────────────────────────────────────────

/**
 * Leitor de respostas que não perde linhas: o `question` do readline descarta
 * o que chegou antes da pergunta (acontece com entrada colada ou redirecionada).
 */
function leitorDeLinhas() {
  const rl = createInterface({ input: process.stdin, terminal: false })
  const fila = []
  const esperando = []
  let fechado = false
  rl.on("line", (l) => (esperando.length ? esperando.shift()(l) : fila.push(l)))
  rl.on("close", () => {
    fechado = true
    while (esperando.length) esperando.shift()("")
  })
  return {
    proxima: () => (fila.length ? Promise.resolve(fila.shift()) : fechado ? Promise.resolve("") : new Promise((r) => esperando.push(r))),
    close: () => rl.close(),
  }
}

async function perguntar(rl, texto, padrao = "") {
  process.stdout.write(padrao ? `${texto} [${padrao}]: ` : `${texto}: `)
  const r = (await rl.proxima()).trim()
  return r || padrao
}

async function parear() {
  const anterior = lerConfig()
  const rl = leitorDeLinhas()
  try {
    console.log("\nAgente do controle de acesso — Confluir")
    console.log("No Confluir: Institucional › Controle de acesso › Cadastrar o computador.\n")
    let endereco = await perguntar(rl, "Endereço do Confluir da entidade (ex.: https://sindipetronf.confluir.online)", anterior?.endereco ?? "")
    if (!/^https?:\/\//.test(endereco)) endereco = `https://${endereco}`
    endereco = new URL(endereco).origin
    const codigo = (await perguntar(rl, "Código de 6 dígitos")).replace(/\D/g, "")

    let resposta
    try {
      resposta = await chamar({ endereco }, "/api/acesso/agente/parear", { codigo, versao: VERSAO, maquina: MAQUINA }, null)
    } catch (e) {
      console.error(`\nNão consegui falar com ${endereco}: ${e?.cause?.code ?? e?.name ?? e}. Confira o endereço e a internet deste computador.`)
      process.exitCode = 1
      return
    }
    const { status, json } = resposta
    if (status !== 200) {
      console.error(`\nNão pareou (HTTP ${status}): ${json.erro ?? "resposta inesperada do Confluir"}`)
      process.exitCode = 1
      return
    }
    const cfg = { endereco, token: json.token, agente: json.agente, conector: json.agente.conector }
    console.log(`\nPareado: ${json.agente.nome}${json.agente.sede ? ` (${json.agente.sede})` : ""}.`)

    if (cfg.conector === "controlid_local") {
      console.log("\nDados do servidor Control iD (o técnico da Control iD informa):")
      cfg.controlid = {
        endereco: await perguntar(rl, "Endereço do servidor (ex.: http://192.168.0.10:30443)", anterior?.controlid?.endereco ?? ""),
        usuario: await perguntar(rl, "Usuário de integração", anterior?.controlid?.usuario ?? ""),
        senha: await perguntar(rl, "Senha do usuário de integração", anterior?.controlid?.senha ? "(manter a atual)" : ""),
      }
      if (cfg.controlid.senha === "(manter a atual)") cfg.controlid.senha = anterior.controlid.senha
    } else {
      cfg.simulado = { simular_falha: null }
    }
    gravarConfig(cfg)
    console.log(`Configuração gravada em ${ARQ_CONFIG}.`)

    console.log("\nRodando a lista de verificação…")
    await enviarDiagnostico(cfg)
    console.log("Pronto. Confira o resultado na tela de Controle de acesso do Confluir.")
  } finally {
    rl.close()
  }
}

// ── Ciclo principal ──────────────────────────────────────────────────────────

async function rodar() {
  const cfg = lerConfig()
  if (!cfg?.token) {
    registrar(`sem configuração em ${ARQ_CONFIG}: rode "node agente-confluir.mjs parear" primeiro`)
    process.exitCode = 1
    return
  }
  registrar(`agente ${VERSAO} iniciado: ${cfg.agente?.nome ?? "?"} → ${cfg.endereco} (conector ${cfg.conector})`)
  let espera = INTERVALO_CONTATO_MS
  let ultimaVerificacao = 0
  let avisouOffline = false

  for (;;) {
    try {
      const { status, json } = await chamar(cfg, "/api/acesso/agente/contato", { versao: VERSAO, maquina: MAQUINA })
      if (status === 401) {
        registrar(`o Confluir recusou o token (${json.erro ?? "desligado"}); pareie de novo com um código novo`)
        espera = ESPERA_MAXIMA_MS
      } else if (status !== 200) {
        registrar(`contato recusado (HTTP ${status}): ${json.erro ?? ""}`)
        espera = Math.min(espera * 2, ESPERA_MAXIMA_MS)
      } else {
        if (avisouOffline) registrar("conexão com o Confluir restabelecida")
        avisouOffline = false
        espera = INTERVALO_CONTATO_MS
        for (const c of json.comandos ?? []) {
          if (c.tipo === "verificar") {
            registrar("verificação pedida pelo Confluir")
            await enviarDiagnostico(cfg, c.id)
            ultimaVerificacao = Date.now()
          } else registrar(`comando desconhecido ignorado: ${c.tipo}`)
        }
        if (Date.now() - ultimaVerificacao > INTERVALO_VERIFICACAO_MS) {
          await enviarDiagnostico(cfg)
          ultimaVerificacao = Date.now()
        }
      }
    } catch (e) {
      if (!avisouOffline) registrar(`sem conexão com o Confluir: ${e?.cause?.code ?? e?.name ?? e}`)
      avisouOffline = true
      espera = Math.min(espera * 2, ESPERA_MAXIMA_MS)
    }
    await esperar(espera)
  }
}

const comando = process.argv[2] ?? "rodar"
if (comando === "parear") await parear()
else if (comando === "verificar") {
  const cfg = lerConfig()
  if (!cfg) console.error(`Sem configuração em ${ARQ_CONFIG}.`)
  else for (const v of await verificar(cfg)) console.log(`${v.ok ? "OK   " : "FALHA"} ${v.id}: ${v.detalhe ?? ""}`)
} else if (comando === "rodar") await rodar()
else console.error(`Comando desconhecido: ${comando}. Use: parear | verificar | (nada, para rodar)`)
