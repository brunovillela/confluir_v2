"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { extractText, getDocumentProxy } from "unpdf"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  ataValida,
  atualizarReuniao,
  baixarAta,
  criarReuniao,
  excluirReuniao,
  prepararEnvioAta,
  type Participante,
} from "@/lib/db/representacao-reunioes"
import { gerarJsonIA, gerarJsonIADePdf } from "@/lib/ia"
import {
  modalidadeReuniao,
  separarNomeCargo,
  situacaoReuniaoRep,
  tipoReuniaoRep,
  type TipoReuniaoRep,
} from "@/lib/representacao-reunioes-constantes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATA = /^\d{4}-\d{2}-\d{2}$/
const HORA = /^\d{1,2}:\d{2}$/
// Quebras de linha do formulário chegam como \r\n: gravamos só \n.
const txt = (fd: FormData, n: string) => String(fd.get(n) ?? "").replace(/\r\n?/g, "\n").trim()
const ouNull = (v: string) => v || null
const linhas = (v: string) =>
  v
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-•*\d.)\s]+/, "").trim())
    .filter(Boolean)

async function requireGestao() {
  return requirePermissao("empregadores")
}

const base = (empresaId: string) => `/painel/representacao/empregadores/${empresaId}`

// ── Ata ──────────────────────────────────────────────────────────────────────

export async function prepararEnvioAtaAction(): Promise<{ caminho?: string; token?: string; erro?: string }> {
  await requireGestao()
  return prepararEnvioAta()
}

export type LeituraAta = {
  valores?: Record<string, string>
  erro?: string
}

function sistema(tipo: TipoReuniaoRep): string {
  const outraParte =
    tipo === "setorial"
      ? `- "trabalhadores": nomes dos trabalhadores presentes que a ata citar, um por linha ("Nome — função/matrícula"), ou "".
- "presentes_total": quantos trabalhadores participaram, só o número, se a ata disser; senão "".
- "unidade": a unidade, plataforma, base, setor ou turno onde foi a setorial, se houver.`
      : `- "participantes_empresa": representantes da empresa, um por linha, no formato "Nome — cargo".`
  return `Você lê a ata de uma ${tipo === "setorial" ? "SETORIAL (reunião do sindicato com trabalhadores de uma empresa)" : "REUNIÃO ENTRE O SINDICATO E UMA EMPRESA"} e devolve um objeto JSON com os campos abaixo.
Regras:
- Use só o que está no documento; campo ausente = "" (string vazia). NÃO invente.
- "titulo": curto, ex.: "${tipo === "setorial" ? "Setorial na P-50 — turno A" : "Reunião sobre escala de embarque"}".
- "data": AAAA-MM-DD. "hora_inicio" e "hora_fim": HH:MM.
- "modalidade": "presencial", "online" ou "hibrida".
- "local": onde foi (endereço, sala, plataforma) ou a plataforma on-line.
- "pauta": os assuntos tratados, um por linha.
- "resumo": resumo objetivo do que foi discutido, em 3 a 8 frases, na terceira pessoa, com posições do sindicato e ${tipo === "setorial" ? "dos trabalhadores" : "da empresa"}.
- "encaminhamentos": decisões, compromissos e prazos, um por linha, com o responsável quando houver.
- "participantes_sindicato": dirigentes/representantes do sindicato presentes, um por linha, "Nome — cargo".
${outraParte}
- Responda APENAS com o objeto JSON.`
}

/** Lê a ata já enviada (PDF digital pelo texto; escaneado, pela imagem) e devolve os campos. */
export async function lerAtaAction(caminho: string, tipoBruto: string): Promise<LeituraAta> {
  await requireGestao()
  const tipo = tipoReuniaoRep(tipoBruto)
  const bytes = await baixarAta(caminho)
  if (!bytes) return { erro: "Ata não encontrada. Envie o PDF de novo." }

  let texto = ""
  try {
    const pdf = await getDocumentProxy(bytes.slice())
    texto = (await extractText(pdf, { mergePages: true })).text.trim()
  } catch {
    // PDF só-imagem: segue para a leitura visual.
  }
  const { dados, erro } =
    texto.length >= 80
      ? await gerarJsonIA({ system: sistema(tipo), prompt: `Texto da ata:\n\n${texto.slice(0, 60000)}` })
      : bytes.length > 20 * 1024 * 1024
        ? { dados: undefined, erro: "PDF escaneado grande demais para a leitura por IA (máximo 20 MB)." }
        : await gerarJsonIADePdf({
            system: sistema(tipo),
            prompt: "Leia a ata contida neste PDF (pode ser escaneada) e extraia os campos.",
            pdfBase64: Buffer.from(bytes).toString("base64"),
          })
  if (erro || !dados) return { erro: erro ?? "A IA não conseguiu ler a ata." }

  const valores: Record<string, string> = {}
  for (const [campo, bruto] of Object.entries(dados)) {
    const valor = Array.isArray(bruto) ? bruto.map(String).join("\n") : typeof bruto === "number" ? String(bruto) : typeof bruto === "string" ? bruto.trim() : ""
    if (!valor) continue
    if (campo === "data" && !DATA.test(valor)) continue
    if ((campo === "hora_inicio" || campo === "hora_fim") && !HORA.test(valor)) continue
    if (campo === "modalidade" && !["presencial", "online", "hibrida"].includes(valor)) continue
    if (campo === "presentes_total" && !/^\d+$/.test(valor)) continue
    valores[campo] = valor
  }
  if (!Object.keys(valores).length) return { erro: "A IA não encontrou os dados da reunião neste PDF." }
  return { valores }
}

// ── Salvar / excluir ─────────────────────────────────────────────────────────

async function participantesDoForm(fd: FormData, tipo: TipoReuniaoRep): Promise<Participante[]> {
  const ps: Participante[] = []
  // Do sindicato com conta: só usuários deste tenant.
  const ids = fd.getAll("sindicato_usuario").map(String).filter((v) => UUID.test(v))
  if (ids.length) {
    const admin = await createAdminClient()
    const { data } = await admin
      .from("usuarios")
      .select("id, nome_completo, nome_guerra")
      .in("id", ids)
      .eq("emp_proprietaria_id", await tenantAtual())
    for (const id of ids) {
      const u = (data ?? []).find((x) => String(x.id) === id)
      if (u) ps.push({ lado: "sindicato", usuarioId: id, nome: String(u.nome_completo ?? u.nome_guerra ?? ""), cargo: null })
    }
  }
  for (const l of linhas(txt(fd, "sindicato_outros"))) ps.push({ lado: "sindicato", usuarioId: null, ...separarNomeCargo(l) })
  const outro = tipo === "setorial" ? "trabalhadores" : "participantes_empresa"
  for (const l of linhas(txt(fd, outro))) {
    ps.push({ lado: tipo === "setorial" ? "trabalhador" : "empresa", usuarioId: null, ...separarNomeCargo(l) })
  }
  return ps
}

export async function salvarReuniaoAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requireGestao()
  const empresaId = txt(fd, "empresa_id")
  const reuniaoId = txt(fd, "reuniao_id")
  if (!UUID.test(empresaId) || (reuniaoId && !UUID.test(reuniaoId))) return { erro: "Dados inválidos." }
  const tipo = tipoReuniaoRep(txt(fd, "tipo"))
  const titulo = txt(fd, "titulo")
  const data = txt(fd, "data")
  if (!titulo) return { erro: "Dê um título à reunião." }
  if (!DATA.test(data)) return { erro: "Informe a data." }
  const horaInicio = txt(fd, "hora_inicio")
  const horaFim = txt(fd, "hora_fim")
  if (horaInicio && horaFim && horaFim <= horaInicio) return { erro: "O término precisa ser depois do início." }
  const presentes = Number.parseInt(txt(fd, "presentes_total"), 10)

  // Ata: caminho novo enviado pelo navegador (validado), "remover", ou nada.
  let ata: { caminho: string; nome: string } | null | undefined
  const ataCaminho = txt(fd, "ata_caminho")
  if (ataCaminho) {
    if (!(await ataValida(ataCaminho))) return { erro: "A ata enviada não foi encontrada. Envie o PDF de novo." }
    ata = { caminho: ataCaminho, nome: txt(fd, "ata_nome").slice(0, 200) || "ata.pdf" }
  } else if (txt(fd, "ata_remover") === "1") {
    ata = null
  }

  const dados = {
    tipo,
    situacao: situacaoReuniaoRep(txt(fd, "situacao")),
    titulo: titulo.slice(0, 200),
    data,
    horaInicio: HORA.test(horaInicio) ? horaInicio : null,
    horaFim: HORA.test(horaFim) ? horaFim : null,
    modalidade: modalidadeReuniao(txt(fd, "modalidade")),
    local: ouNull(txt(fd, "local")),
    linkOnline: /^https?:\/\//i.test(txt(fd, "link_online")) ? txt(fd, "link_online") : null,
    unidade: tipo === "setorial" ? ouNull(txt(fd, "unidade")) : null,
    presentesTotal: tipo === "setorial" && Number.isFinite(presentes) && presentes >= 0 ? presentes : null,
    pauta: ouNull(txt(fd, "pauta")),
    resumo: ouNull(txt(fd, "resumo")),
    encaminhamentos: ouNull(txt(fd, "encaminhamentos")),
    resumoPorIA: txt(fd, "resumo_por_ia") === "1",
    participantes: await participantesDoForm(fd, tipo),
    ...(ata !== undefined ? { ata } : {}),
  }

  if (reuniaoId) {
    const { erro } = await atualizarReuniao(reuniaoId, empresaId, dados)
    if (erro) return { erro }
    revalidatePath(base(empresaId))
    redirect(`${base(empresaId)}/reunioes/${reuniaoId}?salvo=1`)
  }
  const { id, erro } = await criarReuniao(empresaId, dados, String(sessao.usuario.id))
  if (erro || !id) return { erro: erro ?? "Não foi possível salvar." }
  revalidatePath(base(empresaId))
  redirect(`${base(empresaId)}/reunioes/${id}?salvo=1`)
}

export async function excluirReuniaoAction(fd: FormData): Promise<void> {
  await requireGestao()
  const empresaId = txt(fd, "empresa_id")
  const reuniaoId = txt(fd, "reuniao_id")
  const tipo = tipoReuniaoRep(txt(fd, "tipo"))
  if (!UUID.test(empresaId) || !UUID.test(reuniaoId)) return
  await excluirReuniao(reuniaoId, empresaId)
  revalidatePath(base(empresaId))
  redirect(`${base(empresaId)}?aba=${tipo === "setorial" ? "setoriais" : "reunioes"}&excluida=1`)
}
