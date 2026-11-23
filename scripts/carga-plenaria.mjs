#!/usr/bin/env node
/**
 * Teste de carga da plenária ao vivo (Fase 7 dos congressos).
 *
 * Simula N celulares consultando o estado da plenária pelo link pessoal a
 * cada X segundos, durante D segundos, e mede o tempo de resposta (p50,
 * p95, p99), as falhas e as requisições por segundo. É a conta do plano:
 * ~260 delegados consultando a cada 3 s dão ~90 req/s durante a plenária.
 *
 * USO (contra o servidor local ou um ambiente de teste — nunca contra a
 * produção sem combinar, ver armadilha da varredura pesada):
 *   node scripts/carga-plenaria.mjs <url-do-estado> [clientes=260] [intervalo_s=3] [duracao_s=60]
 *
 * <url-do-estado>: http://localhost:3222/congresso/eu/<token>/plenaria/estado
 */

const [, , url, nClientes = "260", nIntervalo = "3", nDuracao = "60"] = process.argv
if (!url) {
  console.error("Uso: node scripts/carga-plenaria.mjs <url-do-estado> [clientes] [intervalo_s] [duracao_s]")
  process.exit(1)
}
const clientes = Number(nClientes)
const intervalo = Number(nIntervalo) * 1000
const duracao = Number(nDuracao) * 1000

const tempos = []
let falhas = 0
let status = new Map()
const inicio = Date.now()

async function cliente(atraso) {
  await new Promise((r) => setTimeout(r, atraso))
  while (Date.now() - inicio < duracao) {
    const t0 = performance.now()
    try {
      const r = await fetch(url, { cache: "no-store" })
      await r.arrayBuffer()
      status.set(r.status, (status.get(r.status) ?? 0) + 1)
      if (!r.ok) falhas++
    } catch {
      falhas++
      status.set("erro de rede", (status.get("erro de rede") ?? 0) + 1)
    }
    tempos.push(performance.now() - t0)
    await new Promise((r) => setTimeout(r, intervalo))
  }
}

// Os clientes começam espalhados no primeiro intervalo, como celulares reais.
await Promise.all(Array.from({ length: clientes }, (_, i) => cliente((i / clientes) * intervalo)))

const total = tempos.length
const ord = [...tempos].sort((a, b) => a - b)
const p = (q) => ord[Math.min(ord.length - 1, Math.floor(q * ord.length))]?.toFixed(0)
const segundos = (Date.now() - inicio) / 1000
console.log(`clientes: ${clientes} · intervalo: ${intervalo / 1000} s · duração: ${segundos.toFixed(0)} s`)
console.log(`requisições: ${total} · ${(total / segundos).toFixed(1)} req/s · falhas: ${falhas}`)
console.log(`tempo de resposta: p50 ${p(0.5)} ms · p95 ${p(0.95)} ms · p99 ${p(0.99)} ms · máx ${ord.at(-1)?.toFixed(0)} ms`)
console.log(`status: ${[...status.entries()].map(([k, v]) => `${k}=${v}`).join(" ")}`)
