// Liga as ordens de CUSTEIO abertas, por Pix ou TED, ao dado bancário do
// favorecido (26/10/2026). Até aqui o custeio guardava a chave/conta só no
// próprio registro (institucional_custeios) e a ordem nascia sem
// dados_bancarios_id — a remessa não achava para onde pagar. Mesma regra de
// dadoBancarioDoCusteio (src/lib/db/custeio.ts): reaproveita o dado igual do
// favorecido, senão cadastra. Favorecido avulso não tem dono para o dado
// bancário (o RLS de dados_bancarios exige): a chave Pix vai na própria ordem
// (pix_codigo) e a TED fica listada para resolver à mão.
//
//   node scripts/ligar-conta-ordens-custeio.mjs            → simula
//   node scripts/ligar-conta-ordens-custeio.mjs --apply    → grava
//
// Idempotente: só pega ordem sem dados_bancarios_id.

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

const { data: ordens, error } = await s
  .from("ordens_pagamento")
  .select("id, codigo, emp_proprietaria_id, forma_pagamento, situacao, custeio_id, beneficiario_usuario_id, beneficiario_fornecedor_id, beneficiario_nome_avulso")
  .eq("tipo", "Custeio")
  .in("forma_pagamento", ["Pix", "Depósito bancário (TED)"])
  .is("dados_bancarios_id", null)
  .is("pix_codigo", null)
  .not("situacao", "in", '("Paga","Cancelada","Estornado")')
  .not("excluido", "is", true)
if (error) throw error

let ligadas = 0
// Mesmo custeio, mesmo dado: as parcelas reaproveitam o que a primeira cadastrou.
const doCusteio = new Map()
const semDado = []
for (const o of ordens) {
  const { data: c } = await s
    .from("institucional_custeios")
    .select("pix, tipo_chave_pix, banco, agencia, conta, tipo_conta, conta_favorecido, beneficiario_nome")
    .eq("id", o.custeio_id)
    .maybeSingle()
  const ehPix = o.forma_pagamento === "Pix" && t(c?.pix)
  const ehConta = o.forma_pagamento === "Depósito bancário (TED)" && t(c?.conta)
  if (!c || (!ehPix && !ehConta)) {
    semDado.push(`${o.codigo} (${o.situacao}, ${o.forma_pagamento}): o custeio não tem ${o.forma_pagamento === "Pix" ? "chave Pix" : "conta"}`)
    continue
  }
  const dono = o.beneficiario_fornecedor_id
    ? ["fornecedor_id", o.beneficiario_fornecedor_id]
    : o.beneficiario_usuario_id
      ? ["usuario_id", o.beneficiario_usuario_id]
      : null
  if (!dono) {
    if (!ehPix) {
      semDado.push(`${o.codigo} (${o.situacao}, TED): favorecido sem cadastro — só Pix ou boleto`)
      continue
    }
    console.log(`${o.codigo} (${o.situacao}, Pix) → chave na própria ordem (favorecido sem cadastro)`)
    if (!aplicar) continue
    const { error: e0 } = await s.from("ordens_pagamento").update({ pix_codigo: t(c.pix) }).eq("id", o.id)
    if (e0) throw e0
    ligadas++
    continue
  }
  let id = doCusteio.get(`${o.custeio_id}:${o.forma_pagamento}`) ?? null
  if (!id && dono) {
    const { data } = await s.from("dados_bancarios").select("id, pix, banco, conta").eq(dono[0], dono[1])
    id = (data ?? []).find((d) => (ehPix ? t(d.pix) === t(c.pix) : t(d.conta) === t(c.conta) && t(d.banco) === t(c.banco)))?.id ?? null
  }
  const acao = id ? "reaproveita" : doCusteio.has(`${o.custeio_id}:${o.forma_pagamento}`) ? "reaproveita" : "cadastra"
  if (!aplicar) doCusteio.set(`${o.custeio_id}:${o.forma_pagamento}`, id ?? "(novo)")
  console.log(`${o.codigo} (${o.situacao}, ${o.forma_pagamento}) → ${acao} ${ehPix ? "chave Pix" : "conta"}${dono ? "" : " avulsa"}`)
  if (!aplicar) continue
  if (!id) {
    const { data: novo, error: e } = await s
      .from("dados_bancarios")
      .insert({
        ...(dono ? { [dono[0]]: dono[1] } : {}),
        favorecido: t(c.conta_favorecido) ?? t(c.beneficiario_nome),
        ...(ehPix
          ? { pix: t(c.pix), pix_tipo: t(c.tipo_chave_pix), prefere_pix: true }
          : { banco: t(c.banco), agencia: t(c.agencia), conta: t(c.conta), tipo_conta: t(c.tipo_conta) }),
      })
      .select("id")
      .single()
    if (e) throw e
    id = novo.id
  }
  doCusteio.set(`${o.custeio_id}:${o.forma_pagamento}`, id)
  const { error: e2 } = await s.from("ordens_pagamento").update({ dados_bancarios_id: id }).eq("id", o.id)
  if (e2) throw e2
  await s.from("ordens_pagamento_eventos").insert({
    emp_proprietaria_id: o.emp_proprietaria_id,
    ordem_id: o.id,
    tipo: "corrigida",
    usuario_id: null,
    descricao: `Ligada ao dado bancário do favorecido (${ehPix ? "chave Pix" : "conta"} escolhida no custeio), para a remessa achar o destino.`,
    dados: { migracao: "ligar-conta-ordens-custeio", depois: { dados_bancarios_id: id } },
  })
  ligadas++
}
console.log(`\n${ordens.length} ordem(ns) abertas sem dado bancário; ${aplicar ? `${ligadas} ligadas` : "simulação"}.`)
if (semDado.length) console.log(`Sem chave/conta no custeio (resolver à mão):\n- ${semDado.join("\n- ")}`)
