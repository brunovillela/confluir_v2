import "server-only"

import { texto } from "@/lib/db/comum"
import { listarAcessos, type AcessoLinha } from "@/lib/db/acessos"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Revisão de acessos (Gestão › Usuários, 19/11/2026): quem continua com
 * acesso ao painel sem, aparentemente, precisar dele. Cruza o acesso
 * (`permissoes`) com
 *  - o Pessoal: vínculos trabalhistas com a entidade, todos encerrados;
 *  - a Diretoria: quem está no quadro como diretor e não é integrante em
 *    exercício de um mandato vigente;
 *  - o login (auth.users, pela função acessos_ultimo_login): parado há 90
 *    dias, ou criado há mais de 30 e nunca usado.
 * É uma lista para conferir, não uma regra: a revogação é sempre manual.
 */

export const DIAS_SEM_LOGIN = 90
export const DIAS_CONVITE_PARADO = 30

export type MotivoRevisao = "desligado" | "diretor_fora" | "sem_login" | "nunca_entrou"

export const ROTULO_MOTIVO: Record<MotivoRevisao, string> = {
  desligado: "Desligado no Pessoal",
  diretor_fora: "Diretor fora do mandato em exercício",
  sem_login: `Sem entrar há mais de ${DIAS_SEM_LOGIN} dias`,
  nunca_entrou: "Login criado e nunca usado",
}

export type ItemRevisao = {
  acesso: AcessoLinha
  motivos: MotivoRevisao[]
  /** Detalhe legível de cada motivo (data de desligamento, último login…). */
  detalhes: string[]
}

export type RevisaoAcessos = {
  disponivel: boolean
  itens: ItemRevisao[]
  contagem: Record<MotivoRevisao, number>
  totalAcessos: number
  /** Todos os acessos, para quem precisa da lista inteira (painel da Gestão). */
  acessos: AcessoLinha[]
}

function hojeISO(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
}

function dataBR(iso: string | null): string {
  if (!iso) return "—"
  const [a, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}/${a}`
}

/** Último vínculo trabalhista por pessoa: ativo hoje ou a data do desligamento. */
async function situacaoTrabalhista(ids: string[]): Promise<Map<string, { ativo: boolean; demissao: string | null }>> {
  const mapa = new Map<string, { ativo: boolean; demissao: string | null }>()
  if (ids.length === 0) return mapa
  const admin = await createAdminClient()
  const { data } = await admin
    .from("vinculos_trabalhistas")
    .select("trabalhador_id, contrato_demissao")
    .eq("empregador_id", await tenantAtual())
    .in("trabalhador_id", ids)
  const hoje = hojeISO()
  for (const v of (data ?? []) as Record<string, unknown>[]) {
    const id = String(v.trabalhador_id)
    const dem = texto(v.contrato_demissao)
    const ativoAqui = !dem || dem.slice(0, 10) > hoje
    const atual = mapa.get(id) ?? { ativo: false, demissao: null }
    atual.ativo = atual.ativo || ativoAqui
    if (!ativoAqui && dem && (!atual.demissao || dem > atual.demissao)) atual.demissao = dem
    mapa.set(id, atual)
  }
  return mapa
}

/** Usuários que são integrantes em exercício de um mandato vigente (por conta ou CPF). */
async function diretoresEmExercicio(): Promise<{ porUsuario: Set<string>; porCpf: Set<string> }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const hoje = hojeISO()
  const { data: mandatos } = await admin
    .from("diretoria_mandatos")
    .select("id, data_inicio, data_termino")
    .eq("emp_proprietaria_id", emp)
  const vigentes = ((mandatos ?? []) as Record<string, unknown>[])
    .filter((m) => {
      const ini = texto(m.data_inicio)
      const fim = texto(m.data_termino)
      return (!ini || ini <= hoje) && (!fim || fim >= hoje)
    })
    .map((m) => String(m.id))
  const porUsuario = new Set<string>()
  const porCpf = new Set<string>()
  if (vigentes.length === 0) return { porUsuario, porCpf }
  const { data } = await admin
    .from("diretoria_integrantes")
    .select("usuario_id, cpf, situacao")
    .in("mandato_id", vigentes)
  for (const i of (data ?? []) as Record<string, unknown>[]) {
    const situacao = texto(i.situacao)
    if (situacao && situacao !== "exercicio") continue
    if (i.usuario_id) porUsuario.add(String(i.usuario_id))
    const cpf = texto(i.cpf)?.replace(/\D/g, "")
    if (cpf) porCpf.add(cpf)
  }
  return { porUsuario, porCpf }
}

async function cadastros(ids: string[]): Promise<Map<string, { vinculo: string | null; cpf: string | null }>> {
  const mapa = new Map<string, { vinculo: string | null; cpf: string | null }>()
  if (ids.length === 0) return mapa
  const admin = await createAdminClient()
  const { data } = await admin.from("usuarios").select("id, vinculo_instituicao, cpf").in("id", ids)
  for (const u of (data ?? []) as Record<string, unknown>[]) {
    mapa.set(String(u.id), { vinculo: texto(u.vinculo_instituicao), cpf: texto(u.cpf)?.replace(/\D/g, "") ?? null })
  }
  return mapa
}

async function ultimosLogins(): Promise<{ ok: boolean; mapa: Map<string, { ultimo: string | null; criado: string | null }> }> {
  const mapa = new Map<string, { ultimo: string | null; criado: string | null }>()
  const admin = await createAdminClient()
  const { data, error } = await admin.rpc("acessos_ultimo_login", { p_emp: await tenantAtual() })
  if (error) return { ok: false, mapa }
  for (const l of (data ?? []) as Record<string, unknown>[]) {
    mapa.set(String(l.usuario_id), { ultimo: texto(l.ultimo_login), criado: texto(l.conta_criada) })
  }
  return { ok: true, mapa }
}

export async function revisarAcessos(): Promise<RevisaoAcessos> {
  const acessos = await listarAcessos()
  const ids = acessos.map((a) => a.usuarioId).filter((v): v is string => Boolean(v))
  const [trabalho, diretoria, cad, logins] = await Promise.all([
    situacaoTrabalhista(ids),
    diretoresEmExercicio(),
    cadastros(ids),
    ultimosLogins(),
  ])

  const agora = Date.now()
  const dia = 24 * 3600_000
  const contagem: Record<MotivoRevisao, number> = { desligado: 0, diretor_fora: 0, sem_login: 0, nunca_entrou: 0 }
  const itens: ItemRevisao[] = []

  for (const a of acessos) {
    if (!a.usuarioId) continue
    const motivos: MotivoRevisao[] = []
    const detalhes: string[] = []
    const t = trabalho.get(a.usuarioId)
    const c = cad.get(a.usuarioId)

    // Conta de função (posto como Recepção) não tem vínculo próprio: só o login conta.
    if (!a.contaFuncao) {
      if (t && !t.ativo) {
        motivos.push("desligado")
        detalhes.push(`desligamento em ${dataBR(t.demissao)}`)
      }
      const ehDiretor = c?.vinculo === "Diretor(a)"
      const emExercicio =
        diretoria.porUsuario.has(a.usuarioId) || Boolean(c?.cpf && diretoria.porCpf.has(c.cpf))
      if (ehDiretor && !emExercicio && !(t && t.ativo)) {
        motivos.push("diretor_fora")
        detalhes.push("no quadro como diretor, sem mandato em exercício")
      }
    }

    const l = logins.mapa.get(a.usuarioId)
    if (a.temLogin && l) {
      if (l.ultimo) {
        const dias = Math.floor((agora - new Date(l.ultimo).getTime()) / dia)
        if (dias > DIAS_SEM_LOGIN) {
          motivos.push("sem_login")
          detalhes.push(`último acesso em ${dataBR(l.ultimo)}`)
        }
      } else if (l.criado && agora - new Date(l.criado).getTime() > DIAS_CONVITE_PARADO * dia) {
        motivos.push("nunca_entrou")
        detalhes.push(`login criado em ${dataBR(l.criado)}`)
      }
    }

    if (motivos.length) {
      for (const m of motivos) contagem[m]++
      itens.push({ acesso: a, motivos, detalhes })
    }
  }

  // Quem tem mais motivos (e os mais graves) primeiro.
  const peso: Record<MotivoRevisao, number> = { desligado: 8, diretor_fora: 4, sem_login: 2, nunca_entrou: 1 }
  itens.sort(
    (x, y) =>
      y.motivos.reduce((s, m) => s + peso[m], 0) - x.motivos.reduce((s, m) => s + peso[m], 0) ||
      (x.acesso.nome ?? "").localeCompare(y.acesso.nome ?? "", "pt-BR")
  )
  return { disponivel: logins.ok, itens, contagem, totalAcessos: acessos.length, acessos }
}
