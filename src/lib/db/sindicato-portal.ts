import "server-only"

import { cache } from "react"

import { cpfConfiavel } from "@/lib/cpf"
import { esquemaAusente, texto } from "@/lib/db/comum"
import { empregadoresPorIntegrante, listarGrupos, listarMandatos } from "@/lib/db/diretoria"
import { listarConvenios } from "@/lib/db/filiacao-convenios"
import { hoteisDisponiveis, hoteisParaPedido } from "@/lib/db/filiado-portal"
import { oposicaoRelevanteParaFiliado } from "@/lib/db/oposicao"
import { opcoesDaParte, rotasDesabilitadas } from "@/lib/db/portal-partes"
import { listarSedes, obterOrganizacao } from "@/lib/db/organizacao"
import { empregadoresAtivos } from "@/lib/db/votacao-portal"
import { formatarCep } from "@/lib/formato"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * O que o portal do associado mostra sobre a própria entidade (onda 5 da
 * avaliação de 11/10/2026: A55, A63, A155). Só leitura, e só o que a entidade
 * cadastrou para si — nada de dado pessoal de quem a compõe.
 *
 *  - quais seções do portal valem para esta entidade (sem hotel ou convênio
 *    vigente, Hospedagem e Convênios saem do menu e do Início);
 *  - os canais oficiais: e-mail e site da organização (Configurações ›
 *    Organização) e as sedes (`empresa_sede`: endereço e telefones);
 *  - a diretoria do mandato vigente: nome e cargo, sem CPF, e-mail ou
 *    telefone (a ficha do diretor é dado pessoal e fica na gestão).
 */

// ── Seções do portal que dependem do que a entidade oferece ─────────────────

/**
 * Hospedagem e Convênios só aparecem quando a entidade tem hotel que aceita
 * pedido hoje (ativo e com convênio em vigor — a régua do seletor, A75) ou
 * convênio vigente (A57). A rota continua aberta: links de aviso e histórico
 * de cupons seguem valendo. Na dúvida (consulta que falhou), o item aparece.
 * Somam-se as partes que a gestão desabilitou em Filiados › Área do associado
 * (essas, sim, com a rota fechada — ver GuardaParte), e a Hospedagem pode
 * ficar no menu mesmo sem hotel ("Manter no menu"). Uma leitura por
 * requisição, dividida entre quem pergunta.
 */
export const servicosOcultosDoPortal = cache(async (): Promise<string[]> => {
  const [temHotel, temConvenio, desabilitadas, hospedagem] = await Promise.all([
    hoteisDisponiveis()
      .then(hoteisParaPedido)
      .then((l) => l.length > 0)
      .catch(() => true),
    // Sem assinar o regulamento: aqui só importa se existe algum vigente.
    listarConvenios({ somenteVigentes: true, arquivos: false })
      .then((l) => l.length > 0)
      .catch(() => true),
    // Partes desabilitadas em Filiados › Área do associado (na dúvida, nenhuma).
    rotasDesabilitadas().catch(() => [] as string[]),
    opcoesDaParte("hospedagem").catch(() => ({ manter_no_menu: false })),
  ])
  const automaticas = [
    !temHotel && !hospedagem.manter_no_menu && "/portal/hospedagem",
    !temConvenio && "/portal/convenios",
  ].filter((h): h is string => typeof h === "string")
  return [...new Set([...automaticas, ...desabilitadas])]
})

/**
 * Tudo o que sai do menu para esta pessoa: as seções acima e a Contribuição
 * assistencial (Oposição), que só aparece para quem tem a ver com ela (A125).
 * É a regra que a casca (src/app/portal/layout.tsx) usa para o menu e a grade
 * do Início usa para os cartões — uma fonte só, para as duas nunca divergirem.
 */
export const secoesOcultasDoPortal = cache(async (cpf: string): Promise<string[]> => {
  const [servicos, mostraOposicao] = await Promise.all([
    servicosOcultosDoPortal(),
    // "Mostrar no menu para todos" (Área do associado) dispensa a regra A125.
    opcoesDaParte("oposicao")
      .catch(() => ({ mostrar_sempre: false }))
      .then((o) => o.mostrar_sempre || oposicaoRelevanteParaFiliado(cpf).catch(() => true)),
  ])
  return [...(mostraOposicao ? [] : ["/portal/oposicao"]), ...servicos]
})

// ── Canais oficiais ──────────────────────────────────────────────────────────

export type TelefoneDaSede = {
  /** Como a entidade escreveu, ex.: "(22) 2737-4700". */
  texto: string
  /** Link tel: quando o trecho é um número discável; null quando não é. */
  tel: string | null
}

export type CanalDaSede = {
  id: string
  nome: string | null
  /** "Rua X, 120 (sala 2) — Centro — Macaé/RJ — CEP 27.910-330" ou null. */
  endereco: string | null
  /** Busca do endereço no mapa (abre o app de mapas no celular). */
  mapa: string | null
  telefones: TelefoneDaSede[]
}

export type CanaisDoSindicato = {
  email: string | null
  /** Endereço completo, só http(s). */
  site: string | null
  /** O site sem o protocolo, para mostrar. */
  siteRotulo: string | null
  /** Sedes com algo a mostrar (endereço ou telefone). */
  sedes: CanalDaSede[]
  /** Alguma das duas leituras falhou: a página diz que pode faltar canal. */
  incompleto: boolean
}

/**
 * `empresa_sede.telefones` é texto livre ("(22) 2737-4700 / (22) 98114-3857").
 * Não há marca de WhatsApp: nenhum número vira link do WhatsApp por palpite.
 */
export function separarTelefones(bruto: string | null): TelefoneDaSede[] {
  if (!bruto) return []
  return bruto
    .split(/\s*(?:\/|;|\||,|\s+e\s+|\s+ou\s+)\s*/i)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => ({ texto: t, tel: linkTelefone(t) }))
}

/** tel: de um trecho — com DDD, no formato internacional; 0800 e 4004 como estão. */
function linkTelefone(trecho: string): string | null {
  const d = trecho.replace(/\D/g, "")
  if (/^0[358]00\d{7}$/.test(d)) return `tel:${d}`
  if (/^[34]00\d{5}$/.test(d)) return `tel:${d}`
  if (d.length === 10 || d.length === 11) return `tel:+55${d}`
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return `tel:+${d}`
  return null
}

/** Só http(s); sem protocolo, https. Qualquer outra coisa fica de fora. */
function siteSeguro(bruto: string | null): string | null {
  if (!bruto) return null
  const comProtocolo = /^[a-z][a-z0-9+.-]*:/i.test(bruto) ? bruto : `https://${bruto}`
  try {
    const url = new URL(comProtocolo)
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null
  } catch {
    return null
  }
}

function emailValido(bruto: string | null): string | null {
  return bruto && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bruto) ? bruto : null
}

export const canaisDoSindicato = cache(async (): Promise<CanaisDoSindicato> => {
  let incompleto = false
  const [org, sedes] = await Promise.all([
    obterOrganizacao().catch((e) => {
      console.error("portal, o sindicato (organização):", e instanceof Error ? e.message : e)
      incompleto = true
      return null
    }),
    listarSedes()
      .then((r) => r.sedes)
      .catch((e) => {
        console.error("portal, o sindicato (sedes):", e instanceof Error ? e.message : e)
        incompleto = true
        return []
      }),
  ])

  const site = siteSeguro(org?.siteUrl ?? null)
  return {
    email: emailValido(org?.emailContato ?? null),
    site,
    siteRotulo: site ? site.replace(/^https?:\/\//, "").replace(/\/$/, "") : null,
    sedes: sedes
      .map((s) => {
        const rua = [s.logradouro, s.numero].filter(Boolean).join(", ")
        const cidade = [s.cidade, s.estado].filter(Boolean).join("/")
        const partes = [
          rua ? (s.complemento ? `${rua} (${s.complemento})` : rua) : null,
          s.bairro,
          cidade || null,
          s.cep ? `CEP ${formatarCep(s.cep)}` : null,
        ].filter((p): p is string => Boolean(p))
        // Endereço que se acha no mapa precisa de rua ou cidade; só bairro/CEP não.
        const endereco = rua || cidade ? partes.join(" — ") : null
        return {
          id: s.id,
          nome: s.nome,
          endereco,
          mapa: endereco
            ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                [rua, s.bairro, cidade, s.cep].filter(Boolean).join(", ")
              )}`
            : null,
          telefones: separarTelefones(s.telefones),
        }
      })
      .filter((s) => s.endereco || s.telefones.length > 0),
    incompleto,
  }
})

// ── Diretoria vigente ────────────────────────────────────────────────────────

export type MembroDaDiretoria = {
  id: string
  nome: string
  cargo: string | null
  /** Trabalha numa empresa em que a pessoa também trabalha. */
  daSuaBase: boolean
}

export type DiretoriaVigente = {
  mandato: string | null
  inicio: string | null
  termino: string | null
  /** Na ordem dos grupos da gestão; grupo sem nome = integrantes sem grupo. */
  grupos: { id: string; nome: string | null; membros: MembroDaDiretoria[] }[]
  daSuaBase: MembroDaDiretoria[]
}

/**
 * Integrantes EM EXERCÍCIO do mandato, na ordem que a gestão definiu (a mesma
 * do painel: ordem, depois nome). Licenciado e excluído não aparecem. Só
 * nome, cargo e grupo saem daqui — CPF, e-mail e a ficha do diretor não.
 */
async function integrantesEmExercicio(
  mandatoId: string
): Promise<{ id: string; nome: string; cargo: string | null; grupoId: string | null }[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const ler = (colunas: string) =>
    admin
      .from("diretoria_integrantes")
      .select(colunas)
      .eq("emp_proprietaria_id", emp)
      .eq("mandato_id", mandatoId)
      .order("ordem", { ascending: true })
      .order("nome", { ascending: true })
  // Sem supabase/diretoria-situacao.sql (ou sem os grupos), todos em exercício.
  let r = await ler("id, nome, cargo, grupo_id, situacao")
  if (r.error && esquemaAusente(r.error)) r = await ler("id, nome, cargo, grupo_id")
  if (r.error && esquemaAusente(r.error)) r = await ler("id, nome, cargo")
  if (r.error) throw new Error(`diretoria vigente: ${r.error.message}`)
  const linhas = (r.data ?? []) as unknown as Record<string, unknown>[]
  return linhas
    .filter((i) => i.situacao === undefined || i.situacao === null || i.situacao === "exercicio")
    .map((i) => ({
      id: String(i.id),
      nome: texto(i.nome) ?? "",
      cargo: texto(i.cargo),
      grupoId: texto(i.grupo_id),
    }))
    .filter((i) => i.nome)
}

/**
 * Integrantes cuja empresa (vínculo ativo, pela régua de
 * empregadoresPorIntegrante) é também uma empresa ativa da pessoa (a régua da
 * votação e da Oposição). Falhou, ninguém é marcado — a lista segue.
 */
async function idsDaSuaBase(mandatoId: string, cpf: string): Promise<Set<string>> {
  if (!cpfConfiavel(cpf)) return new Set()
  try {
    const [porIntegrante, minhas] = await Promise.all([empregadoresPorIntegrante(mandatoId), empregadoresAtivos(cpf)])
    if (minhas.size === 0) return new Set()
    return new Set(
      Object.entries(porIntegrante)
        .filter(([, empresas]) => empresas.some((e) => minhas.has(e.id)))
        .map(([id]) => id)
    )
  } catch (e) {
    console.error("portal, o sindicato (diretores da base):", e instanceof Error ? e.message : e)
    return new Set()
  }
}

/**
 * null = nenhum mandato vigente cadastrado. `destacarBase: false` (Área do
 * associado, "Destacar os diretores da base") pula o cruzamento de empresas:
 * ninguém sai marcado como "da sua base".
 */
export async function diretoriaVigente(
  cpf: string,
  { destacarBase = true }: { destacarBase?: boolean } = {}
): Promise<DiretoriaVigente | null> {
  // listarMandatos já sai do mais recente para o mais antigo: com dois
  // mandatos sobrepostos, vale o mais novo.
  const atual = (await listarMandatos()).find((m) => m.vigente)
  if (!atual) return null

  const [integrantes, grupos, daBase] = await Promise.all([
    integrantesEmExercicio(atual.id),
    listarGrupos(atual.id),
    destacarBase ? idsDaSuaBase(atual.id, cpf) : Promise.resolve(new Set<string>()),
  ])
  const membro = (i: (typeof integrantes)[number]): MembroDaDiretoria => ({
    id: i.id,
    nome: i.nome,
    cargo: i.cargo,
    daSuaBase: daBase.has(i.id),
  })

  const conhecidos = new Set(grupos.map((g) => g.id))
  const blocos: DiretoriaVigente["grupos"] = grupos
    .map((g) => ({ id: g.id, nome: g.nome, membros: integrantes.filter((i) => i.grupoId === g.id).map(membro) }))
    .filter((g) => g.membros.length > 0)
  const semGrupo = integrantes.filter((i) => !i.grupoId || !conhecidos.has(i.grupoId)).map(membro)
  if (semGrupo.length > 0) blocos.push({ id: "sem-grupo", nome: null, membros: semGrupo })

  return {
    mandato: atual.mandato,
    inicio: atual.dataInicio,
    termino: atual.dataTermino,
    grupos: blocos,
    daSuaBase: integrantes.map(membro).filter((m) => m.daSuaBase),
  }
}
