// Dá forma de pagamento às ordens ABERTAS que nasceram sem (26/10/2026):
// a mesma regra de completarFormaPadrao (src/lib/db/ordens-destino.ts) — a
// chave Pix quando o favorecido prefere Pix (ou só tem chave), senão a conta
// (TED), o favorito primeiro, e a ordem fica ligada ao dado bancário. Pessoa:
// o dado do usuário, o da filiação dela (mesmo CPF) e a ficha antiga do
// diretor (cadastrada no usuário). Custeio de convidado: a chave do custeio.
//
//   node scripts/forma-padrao-ordens-abertas.mjs            → simula
//   node scripts/forma-padrao-ordens-abertas.mjs --apply    → grava
//
// Idempotente: só pega ordem sem forma. As que ficam sem dado bancário são
// listadas para resolver à mão.

import { createClient } from "@supabase/supabase-js"
import fs from "node:fs"

const env = Object.fromEntries(
  fs
    .readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")])
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const aplicar = process.argv.includes("--apply")
const t = (v) => (typeof v === "string" && v.trim() ? v.trim() : null)
const temPix = (d) => Boolean(t(d.pix))
const temConta = (d) => Boolean(t(d.conta) && t(d.agencia) && (t(d.banco) || t(d.banco_codigo)))

const { data: ordens, error } = await s
  .from("ordens_pagamento")
  .select("id, codigo, tipo, situacao, emp_proprietaria_id, custeio_id, fornecedor_id, beneficiario_fornecedor_id, beneficiario_usuario_id, beneficiario_nome_avulso, dados_bancarios_id, pix_codigo")
  .is("forma_pagamento", null)
  .not("situacao", "in", '("Paga","Cancelada","Estornado")')
  .not("excluido", "is", true)
if (error) throw error

let feitas = 0
const pendentes = []
for (const o of ordens) {
  const fornecedor = o.beneficiario_fornecedor_id ?? o.fornecedor_id
  const usuario = o.beneficiario_usuario_id
  const meus = []
  if (fornecedor) meus.push(...((await s.from("dados_bancarios").select("*").eq("fornecedor_id", fornecedor)).data ?? []))
  let fichaDiretor = null
  if (usuario && !fornecedor) {
    meus.push(...((await s.from("dados_bancarios").select("*").eq("usuario_id", usuario)).data ?? []))
    const { data: u } = await s.from("usuarios").select("cpf").eq("id", usuario).maybeSingle()
    const cpf = String(u?.cpf ?? "").replace(/\D/g, "")
    if (cpf.length === 11) {
      const grafias = [cpf, cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")]
      const { data: fs } = await s.from("filiacoes").select("id").eq("emp_proprietaria_id", o.emp_proprietaria_id).in("cpf", grafias)
      if (fs?.length) meus.push(...((await s.from("dados_bancarios").select("*").in("filiado_id", fs.map((f) => f.id))).data ?? []))
    }
    if (!meus.length) {
      const { data: i } = await s.from("diretoria_integrantes").select("id").eq("usuario_id", usuario).limit(1).maybeSingle()
      if (i) {
        const { data: f } = await s.from("diretoria_ficha").select("banco, agencia, conta_corrente, pix, tipo_chave_pix").eq("integrante_id", i.id).maybeSingle()
        if (f && (t(f.pix) || t(f.conta_corrente))) {
          fichaDiretor = f
          meus.push({ id: null, pix: f.pix, pix_tipo: f.tipo_chave_pix, conta: f.conta_corrente, agencia: f.agencia, banco: f.banco })
        }
      }
    }
  }
  meus.sort((a, b) => Number(b.favorito === true) - Number(a.favorito === true))
  let escolha = null
  const pixPreferido = meus.find((d) => temPix(d) && d.prefere_pix === true)
  if (pixPreferido) escolha = { forma: "Pix", dado: pixPreferido }
  else if (meus.find(temConta)) escolha = { forma: "Depósito bancário (TED)", dado: meus.find(temConta) }
  else if (meus.find(temPix)) escolha = { forma: "Pix", dado: meus.find(temPix) }
  // Custeio de convidado sem cadastro: a chave escolhida no custeio vai na ordem.
  let pixDaOrdem = null
  if (!escolha && o.custeio_id) {
    const { data: c } = await s.from("institucional_custeios").select("pix").eq("id", o.custeio_id).maybeSingle()
    if (t(c?.pix)) pixDaOrdem = t(c.pix)
  }
  const quem = t(o.beneficiario_nome_avulso) ?? (fornecedor ? "fornecedor" : usuario ? "usuário" : "sem favorecido")
  if (!escolha && !pixDaOrdem) {
    pendentes.push(`${o.codigo} (${o.tipo}, ${o.situacao}) — ${quem} sem chave Pix nem conta`)
    continue
  }
  const daFicha = escolha && !escolha.dado.id
  console.log(`${o.codigo} (${o.tipo}, ${o.situacao}) → ${escolha?.forma ?? "Pix"}${escolha ? (daFicha ? " (da ficha do diretor)" : "") : " (chave do custeio na ordem)"}`)
  if (!aplicar) continue
  if (daFicha) {
    const ehPix = escolha.forma === "Pix"
    const { data: novo, error: e1 } = await s
      .from("dados_bancarios")
      .insert({ usuario_id: usuario, ...(ehPix ? { pix: fichaDiretor.pix, pix_tipo: fichaDiretor.tipo_chave_pix, prefere_pix: true } : { banco: fichaDiretor.banco, agencia: fichaDiretor.agencia, conta: fichaDiretor.conta_corrente }) })
      .select("id")
      .single()
    if (e1) throw e1
    escolha.dado.id = novo.id
  }
  const mudanca = escolha
    ? { forma_pagamento: escolha.forma, ...(o.dados_bancarios_id ? {} : { dados_bancarios_id: escolha.dado.id }) }
    : { forma_pagamento: "Pix", pix_codigo: pixDaOrdem }
  const { error: e } = await s.from("ordens_pagamento").update(mudanca).eq("id", o.id).is("forma_pagamento", null)
  if (e) throw e
  await s.from("ordens_pagamento_eventos").insert({
    emp_proprietaria_id: o.emp_proprietaria_id,
    ordem_id: o.id,
    tipo: "corrigida",
    usuario_id: null,
    descricao: `Forma de pagamento preenchida pelo cadastro do favorecido (${mudanca.forma_pagamento}): toda ordem precisa de forma.`,
    dados: { migracao: "forma-padrao-ordens-abertas", antes: { forma_pagamento: null }, depois: mudanca },
  })
  feitas++
}
console.log(`\n${ordens.length} ordem(ns) abertas sem forma; ${aplicar ? `${feitas} ajustadas` : "simulação"}.`)
if (pendentes.length) console.log(`Sem dado bancário (resolver à mão):\n- ${pendentes.join("\n- ")}`)
