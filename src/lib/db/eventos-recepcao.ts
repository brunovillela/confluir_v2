import "server-only"

import { esquemaAusente } from "@/lib/db/comum"
import { urlArquivoEventos } from "@/lib/db/eventos"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Eventos › Recepção — a porta.
 *
 * Interface de porta é diferente de interface de escritório: quem opera está
 * de pé, com fila na frente, e precisa de UMA busca e UM toque. Por isso as
 * consultas aqui devolvem o pacote pronto (foto, situação e presença do dia)
 * em vez de deixar a tela montar em várias idas.
 */

export type EventoDaRecepcao = {
  id: string
  titulo: string | null
  inicio: string | null
  dias: { id: string; data: string; rotulo: string | null }[]
}

/** Eventos que fazem sentido na recepção: publicados, com dia hoje ou à frente. */
export async function eventosParaRecepcao(): Promise<{
  ativo: boolean
  eventos: EventoDaRecepcao[]
}> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("eventos")
    .select("id, titulo, inicio")
    .eq("emp_proprietaria_id", emp)
    .eq("situacao", "publicado")
    .order("inicio", { ascending: true })
  if (error) {
    if (esquemaAusente(error)) return { ativo: false, eventos: [] }
    throw new Error(`Falha ao listar eventos: ${error.message}`)
  }

  const ids = (data ?? []).map((e) => e.id as string)
  if (ids.length === 0) return { ativo: true, eventos: [] }

  const { data: dias } = await admin
    .from("eventos_dias")
    .select("id, evento_id, data, rotulo")
    .eq("emp_proprietaria_id", emp)
    .in("evento_id", ids)
    .order("data")

  const porEvento = new Map<
    string,
    { id: string; data: string; rotulo: string | null }[]
  >()
  for (const d of dias ?? []) {
    const eid = d.evento_id as string
    const lista = porEvento.get(eid) ?? []
    lista.push({
      id: d.id as string,
      data: d.data as string,
      rotulo: (d.rotulo as string | null) ?? null,
    })
    porEvento.set(eid, lista)
  }

  return {
    ativo: true,
    eventos: (data ?? []).map((e) => ({
      id: e.id as string,
      titulo: (e.titulo as string | null) ?? null,
      inicio: (e.inicio as string | null) ?? null,
      dias: porEvento.get(e.id as string) ?? [],
    })),
  }
}

export type PessoaNaPorta = {
  inscricaoId: string
  nome: string | null
  cpf: string | null
  situacao: string
  fotoUrl: string | null
  ehConvidado: boolean
  presenteHoje: boolean
  presencaEm: string | null
}

/**
 * Busca na porta: aceita NOME, CPF ou o TOKEN do QR. O token entra aqui porque
 * o leitor devolve a URL da pessoa — a tela extrai o identificador e manda
 * para cá, e assim QR e digitação caem no mesmo caminho.
 */
export async function buscarNaPorta(
  eventoId: string,
  diaId: string,
  termo: string
): Promise<PessoaNaPorta[]> {
  const busca = (termo ?? "").trim()
  if (busca.length < 3) return []

  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const digitos = busca.replace(/\D/g, "")
  const ehUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(busca)

  let q = admin
    .from("eventos_inscricoes")
    .select("id, nome, cpf, situacao, foto_url, titular_id, anonimizada_em")
    .eq("emp_proprietaria_id", emp)
    .eq("evento_id", eventoId)

  if (ehUuid) {
    q = q.eq("token", busca)
  } else {
    q = q.or(
      [
        `nome.ilike.%${busca}%`,
        digitos.length >= 3 ? `cpf.like.%${digitos}%` : null,
      ]
        .filter(Boolean)
        .join(",")
    )
  }

  const { data } = await q.limit(20)
  const linhas = (data ?? []).filter((i) => i.anonimizada_em === null)
  if (linhas.length === 0) return []

  const { data: presencas } = await admin
    .from("eventos_presencas")
    .select("inscricao_id, confirmada_em")
    .eq("emp_proprietaria_id", emp)
    .eq("dia_id", diaId)
    .in(
      "inscricao_id",
      linhas.map((i) => i.id as string)
    )
  const presentes = new Map(
    (presencas ?? []).map((p) => [
      p.inscricao_id as string,
      p.confirmada_em as string,
    ])
  )

  return Promise.all(
    linhas.map(async (i) => ({
      inscricaoId: i.id as string,
      nome: (i.nome as string | null) ?? null,
      cpf: (i.cpf as string | null) ?? null,
      situacao: (i.situacao as string) ?? "pendente",
      fotoUrl: await urlArquivoEventos((i.foto_url as string | null) ?? null),
      ehConvidado: i.titular_id !== null,
      presenteHoje: presentes.has(i.id as string),
      presencaEm: presentes.get(i.id as string) ?? null,
    }))
  )
}

/** Total de presentes no dia — o número que a recepção acompanha. */
export async function presentesNoDia(diaId: string): Promise<number> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { count } = await admin
    .from("eventos_presencas")
    .select("id", { count: "exact", head: true })
    .eq("emp_proprietaria_id", emp)
    .eq("dia_id", diaId)
  return count ?? 0
}

/**
 * Registra a chegada. Idempotente por índice único (inscrição + dia): ler o
 * mesmo QR duas vezes não duplica nem dá erro na cara de quem opera.
 */
export async function registrarChegada(
  inscricaoId: string,
  diaId: string,
  usuarioId: string,
  metodo: "qr" | "busca"
): Promise<{ erro?: string; jaEstava?: boolean; nome?: string | null }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const { data: insc } = await admin
    .from("eventos_inscricoes")
    .select("id, nome, situacao, anonimizada_em")
    .eq("emp_proprietaria_id", emp)
    .eq("id", inscricaoId)
    .maybeSingle()
  if (!insc) return { erro: "Inscrição não encontrada." }
  if (insc.anonimizada_em) {
    return { erro: "Os dados desta inscrição foram anonimizados." }
  }
  if (insc.situacao !== "confirmada") {
    return {
      erro: `Esta inscrição está como "${insc.situacao}". Só quem está confirmado pode entrar — chame a organização.`,
    }
  }

  const { data: existente } = await admin
    .from("eventos_presencas")
    .select("id")
    .eq("emp_proprietaria_id", emp)
    .eq("inscricao_id", inscricaoId)
    .eq("dia_id", diaId)
    .maybeSingle()
  if (existente) {
    return { jaEstava: true, nome: (insc.nome as string | null) ?? null }
  }

  const { error } = await admin.from("eventos_presencas").insert({
    emp_proprietaria_id: emp,
    inscricao_id: inscricaoId,
    dia_id: diaId,
    confirmada_por: usuarioId,
    metodo,
  })
  if (error) return { erro: `Não foi possível registrar: ${error.message}` }

  return { nome: (insc.nome as string | null) ?? null }
}
