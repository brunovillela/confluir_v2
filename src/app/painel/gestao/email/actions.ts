"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { listarDepartamentosCompletos } from "@/lib/db/departamentos"
import { credencialDaEntidade, gerarTokenWebhookEmail, registrarTesteContaEmail, removerContaEmail, salvarContaEmail, salvarRemetenteEmail } from "@/lib/db/email-conta"
import { bloquearEndereco, liberarEndereco, obterControlesEmail, salvarControlesEmail } from "@/lib/db/email-controles"
import { chaveEmailParecida, EMAIL_VALIDO, MODULOS_EMAIL, remetenteNoDominio, tituloModuloEmail, type ControlesEmail } from "@/lib/email-processos"
import { testarConta } from "@/lib/email-provedores"

const ROTA = "/painel/gestao/email"

function inteiroOuNulo(fd: FormData, nome: string): number | null | "invalido" {
  const bruto = String(fd.get(nome) ?? "").trim().replace(/[.\s]/g, "")
  if (!bruto) return null
  const n = Number(bruto)
  return Number.isInteger(n) && n > 0 ? n : "invalido"
}

/**
 * Controles do e-mail: módulos ligados (`mod:<slug>` marcado = ligado), teto
 * mensal, parar no teto e cotas por departamento (`cota:<id>`).
 */
export async function salvarControlesEmailAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("gestao_sistema")
  const { controles: antes } = await obterControlesEmail()

  const modulosDesligados = MODULOS_EMAIL.filter((m) => fd.has(`presente:${m.slug}`) && !fd.has(`mod:${m.slug}`)).map((m) => m.slug)
  const limite = inteiroOuNulo(fd, "limite_mensal")
  if (limite === "invalido") return { erro: "Use um número inteiro maior que zero (ex.: 5000) ou deixe em branco.", campo: "limite_mensal" }

  const deptos = (await listarDepartamentosCompletos()).filter((d) => !d.legado)
  const nomes = new Map(deptos.map((d) => [d.id, d.nome]))
  const cotas: Record<string, number> = {}
  for (const [nome] of fd.entries()) {
    if (!nome.startsWith("cota:")) continue
    const id = nome.slice("cota:".length)
    if (!nomes.has(id)) continue
    const v = inteiroOuNulo(fd, nome)
    if (v === "invalido") return { erro: "Use um número inteiro maior que zero ou deixe em branco.", campo: nome }
    if (v !== null) cotas[id] = v
  }

  const novo: ControlesEmail = { modulosDesligados, limiteMensal: limite, bloquearNoLimite: fd.get("bloquear_no_limite") === "on", cotasDepartamento: cotas }
  const mudancas: string[] = []
  const desl = [...novo.modulosDesligados].sort().join(",")
  if ([...antes.modulosDesligados].sort().join(",") !== desl) {
    mudancas.push(`módulos desligados: ${novo.modulosDesligados.map(tituloModuloEmail).join(", ") || "nenhum"}`)
  }
  if (antes.limiteMensal !== novo.limiteMensal) mudancas.push(`teto: ${novo.limiteMensal ?? "sem teto"}`)
  if (antes.bloquearNoLimite !== novo.bloquearNoLimite) mudancas.push(novo.bloquearNoLimite ? "para no teto" : "só avisa no teto")
  const ids = new Set([...Object.keys(antes.cotasDepartamento), ...Object.keys(cotas)])
  for (const id of ids) {
    if ((antes.cotasDepartamento[id] ?? null) !== (cotas[id] ?? null)) mudancas.push(`cota ${nomes.get(id) ?? id}: ${cotas[id] ?? "sem cota"}`)
  }
  if (!mudancas.length) return { ok: "Nada mudou." }
  const r = await salvarControlesEmail(novo, mudancas, String(sessao.usuario.id))
  if (r.erro) return { erro: r.erro }
  revalidatePath(ROTA)
  return { ok: "Controles do e-mail salvos. Valem em até um minuto para todos os envios." }
}


export async function bloquearEnderecoAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("gestao_sistema")
  const endereco = String(fd.get("endereco") ?? "").trim().toLowerCase()
  if (!EMAIL_VALIDO.test(endereco) || endereco.length > 320) return { erro: "Informe um e-mail válido.", campo: "endereco" }
  const motivo = String(fd.get("motivo") ?? "").trim() || null
  const r = await bloquearEndereco(endereco, motivo, String(sessao.usuario.id))
  if (r.erro) return { erro: r.erro }
  revalidatePath(ROTA)
  return { ok: `${endereco} não recebe mais e-mails do sistema.` }
}

export async function liberarEnderecoAction(id: string): Promise<EstadoForm> {
  const sessao = await requirePermissao("gestao_sistema")
  const r = await liberarEndereco(id, String(sessao.usuario.id))
  if (r.erro) return { erro: r.erro }
  revalidatePath(ROTA)
  return { ok: `${r.endereco} liberado: volta a receber e-mails.` }
}

// ── Conta própria (fase 4) ──────────────────────────────────────────────────

function textoOuNulo(fd: FormData, nome: string, max = 200): string | null {
  const v = String(fd.get(nome) ?? "").trim()
  return v ? v.slice(0, max) : null
}

/** Confere o remetente contra os domínios e remetentes verificados da conta. */
function conferirRemetente(remetente: string, teste: { dominios: { nome: string; verificado: boolean }[]; remetentes: string[] }): string | null {
  if (teste.remetentes.includes(remetente) || remetenteNoDominio(remetente, teste.dominios)) return null
  const verificados = teste.dominios.filter((d) => d.verificado).map((d) => d.nome)
  return verificados.length
    ? `O remetente precisa ser de um domínio verificado na conta (${verificados.join(", ")}).`
    : "A conta não tem domínio verificado nem este remetente validado. Verifique o domínio no painel do provedor (registros de DNS) e tente de novo."
}

/**
 * Cadastra (ou troca) a conta própria: provedor, chave, remetente, nome e
 * resposta. A chave é testada e o remetente conferido antes de gravar. Sem
 * chave no formulário, mantém a cadastrada e troca só o remetente.
 */
export async function salvarContaEmailAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("gestao_sistema")
  const provedor = fd.get("provedor") === "resend" ? "resend" : "brevo"
  const chave = String(fd.get("chave") ?? "").trim()
  const remetenteEmail = String(fd.get("remetente_email") ?? "").trim().toLowerCase()
  const remetenteNome = textoOuNulo(fd, "remetente_nome", 80)
  const responderPara = textoOuNulo(fd, "responder_para", 320)?.toLowerCase() ?? null
  if (!EMAIL_VALIDO.test(remetenteEmail)) return { erro: "Informe o remetente (ex.: comunicacao@sindicato.org.br).", campo: "remetente_email" }
  if (responderPara && !EMAIL_VALIDO.test(responderPara)) return { erro: "Endereço de resposta inválido.", campo: "responder_para" }

  if (chave) {
    if (!chaveEmailParecida(provedor, chave)) {
      return { erro: provedor === "brevo" ? "Isso não parece uma chave de API do Brevo (começa com xkeysib-)." : "Isso não parece uma chave do Resend (começa com re_).", campo: "chave" }
    }
    const teste = await testarConta({ provedor, chave })
    if (teste.erro) return { erro: `Nada foi salvo. ${teste.erro}`, campo: "chave" }
    const semRemetente = conferirRemetente(remetenteEmail, teste)
    if (semRemetente) return { erro: semRemetente, campo: "remetente_email" }
    const r = await salvarContaEmail({ provedor, chave, remetenteEmail, remetenteNome, responderPara }, String(sessao.usuario.id))
    if (r.erro) return { erro: r.erro }
    revalidatePath(ROTA)
    return { ok: `Conta própria do ${provedor === "brevo" ? "Brevo" : "Resend"} cadastrada: os e-mails passam a sair de ${remetenteEmail} em até um minuto.` }
  }

  const atual = await credencialDaEntidade()
  if (!atual) return { erro: "Informe a chave de API da conta.", campo: "chave" }
  const teste = await testarConta(atual)
  if (teste.erro) return { erro: `A chave cadastrada não respondeu: ${teste.erro}` }
  const semRemetente = conferirRemetente(remetenteEmail, teste)
  if (semRemetente) return { erro: semRemetente, campo: "remetente_email" }
  const r = await salvarRemetenteEmail({ remetenteEmail, remetenteNome, responderPara }, String(sessao.usuario.id))
  if (r.erro) return { erro: r.erro }
  revalidatePath(ROTA)
  return { ok: "Remetente salvo." }
}

export async function testarContaEmailAction(): Promise<EstadoForm> {
  await requirePermissao("gestao_sistema")
  const c = await credencialDaEntidade()
  if (!c) return { erro: "Não há chave legível cadastrada." }
  const teste = await testarConta(c)
  await registrarTesteContaEmail(teste.erro)
  revalidatePath(ROTA)
  if (teste.erro) return { erro: teste.erro }
  const verificados = teste.dominios.filter((d) => d.verificado).map((d) => d.nome)
  return { ok: `A chave respondeu.${verificados.length ? ` Domínios verificados: ${verificados.join(", ")}.` : " Nenhum domínio verificado na conta."}` }
}

export async function removerContaEmailAction(): Promise<EstadoForm> {
  const sessao = await requirePermissao("gestao_sistema")
  const r = await removerContaEmail(String(sessao.usuario.id))
  if (r.erro) return { erro: r.erro }
  revalidatePath(ROTA)
  return { ok: "Conta própria removida: os e-mails voltam a sair pela conta da plataforma." }
}

export async function gerarTokenWebhookAction(): Promise<EstadoForm & { token?: string }> {
  const sessao = await requirePermissao("gestao_sistema")
  const r = await gerarTokenWebhookEmail(String(sessao.usuario.id))
  if (r.erro || !r.token) return { erro: r.erro ?? "Não foi possível gerar o token." }
  revalidatePath(ROTA)
  return { ok: "Token gerado. Copie agora: ele não aparece de novo.", token: r.token }
}
