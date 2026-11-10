"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { cpfDaCelula, gradeDoArquivo, lerGrade, type LinhaConferida, type LinhaImportada } from "@/lib/congressos/importacao"
import { conferirImportacao, gravarImportacao } from "@/lib/db/congressos-inscricao"
import { gerarJsonIA, gerarJsonIADeImagem, gerarJsonIADePdf } from "@/lib/ia"
import { imagemNaoSuportada, mimeDeImagem, textoDoArquivo } from "@/lib/ia-arquivo"

/**
 * Congressos — importar participantes de uma planilha ou de uma ata.
 *
 * Planilha com cabeçalho reconhecível é lida sem IA. Ata em PDF, foto ou
 * planilha sem cabeçalho vai para a IA (src/lib/ia.ts, store: false), que só
 * devolve a lista; nada é gravado antes da conferência na tela.
 */

export type EstadoImportacao = {
  erro?: string
  ok?: string
  origem?: "planilha" | "ata"
  linhas?: LinhaConferida[]
  papelPadrao?: string
  unidadePadrao?: string
}

const MAX_LINHAS = 2000
const MAX_TEXTO = 120000

const SISTEMA =
  "Você extrai listas de pessoas de documentos de congressos sindicais (atas de eleição de delegados, listas de inscrição, relações de delegação). " +
  "Responda só com JSON no formato {\"pessoas\":[{\"nome\":\"\",\"cpf\":\"\",\"base\":\"\",\"condicao\":\"\",\"email\":\"\",\"telefone\":\"\",\"genero\":\"\"}]}. " +
  "nome: como está no documento. cpf: só se constar. base: local de trabalho, base, entidade, sindicato ou segmento que a pessoa representa, se constar. " +
  "condicao: titular, suplente, delegado, delegado nato, observador ou convidado, se constar. genero: feminino ou masculino, só se constar explicitamente. " +
  "Use string vazia quando não houver. Não invente pessoas nem dados; não inclua quem só assina a ata sem ser eleito ou indicado, a menos que a lista seja de participantes."

function lerPessoas(dados: Record<string, unknown> | undefined): LinhaImportada[] {
  const pessoas = Array.isArray(dados?.pessoas) ? (dados!.pessoas as Record<string, unknown>[]) : []
  const s = (v: unknown) => {
    const x = String(v ?? "").trim()
    return x || null
  }
  return pessoas.slice(0, MAX_LINHAS).map((p, i) => ({
    linha: i + 1,
    nome: s(p.nome) ?? "",
    cpf: s(p.cpf) ? cpfDaCelula(String(p.cpf)) : null,
    email: s(p.email),
    telefone: s(p.telefone),
    genero: s(p.genero),
    base: s(p.base),
    papel: s(p.condicao),
  }))
}

export async function conferirImportacaoAction(_p: EstadoImportacao, fd: FormData): Promise<EstadoImportacao> {
  await requirePermissao("congressos_gestao")
  const congressoId = String(fd.get("congresso_id") ?? "")
  const papelPadrao = String(fd.get("papel_padrao") ?? "") || undefined
  const unidadePadrao = String(fd.get("unidade_padrao") ?? "") || undefined
  const arquivo = fd.get("arquivo")
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Escolha o arquivo." }
  if (arquivo.size > 4 * 1024 * 1024) return { erro: "Arquivo grande demais: o máximo é 4 MB." }

  let linhas: LinhaImportada[] | null = null
  let origem: "planilha" | "ata" = "planilha"
  const nome = arquivo.name.toLowerCase()

  if (/\.(xlsx|xls|ods|csv)$/.test(nome)) {
    const grade = gradeDoArquivo(new Uint8Array(await arquivo.arrayBuffer()))
    if (grade === null) return { erro: "Não consegui abrir a planilha." }
    linhas = lerGrade(grade)
  }

  if (!linhas) {
    // Sem cabeçalho reconhecível, PDF ou foto: leitura pela IA.
    origem = "ata"
    const mime = mimeDeImagem(arquivo.type, arquivo.name)
    let r
    if (mime) {
      r = await gerarJsonIADeImagem({
        system: SISTEMA,
        prompt: "Extraia a lista de pessoas desta imagem.",
        imagemBase64: Buffer.from(await arquivo.arrayBuffer()).toString("base64"),
        mimeType: mime,
      })
    } else if (imagemNaoSuportada(arquivo.name)) {
      return { erro: "Formato de imagem não suportado: use JPG, PNG ou WebP." }
    } else {
      const { texto, ehPdf, pdf, erro } = await textoDoArquivo(arquivo)
      if (erro) return { erro }
      if (texto.length >= 20) {
        r = await gerarJsonIA({ system: SISTEMA, prompt: `Documento:\n\n${texto.slice(0, MAX_TEXTO)}` })
      } else if (ehPdf && pdf) {
        r = await gerarJsonIADePdf({
          system: SISTEMA,
          prompt: "Extraia a lista de pessoas deste documento (pode ser escaneado).",
          pdfBase64: Buffer.from(pdf).toString("base64"),
        })
      } else {
        return { erro: "O arquivo está vazio ou não tem texto legível." }
      }
    }
    if (r.erro) return { erro: r.erro }
    linhas = lerPessoas(r.dados)
  }

  if (!linhas.length) return { erro: "Não encontrei nenhuma pessoa no arquivo." }
  if (linhas.length > MAX_LINHAS) return { erro: `O arquivo tem mais de ${MAX_LINHAS} linhas.` }
  const conferidas = await conferirImportacao(congressoId, linhas, {
    papelId: papelPadrao ?? null,
    unidadeId: unidadePadrao ?? null,
  })
  return { origem, linhas: conferidas, papelPadrao, unidadePadrao }
}

export async function gravarImportacaoAction(_p: EstadoImportacao, fd: FormData): Promise<EstadoImportacao> {
  const sessao = await requirePermissao("congressos_gestao")
  const congressoId = String(fd.get("congresso_id") ?? "")
  const origem = fd.get("origem") === "ata" ? "ata" : "planilha"
  let linhas: LinhaImportada[]
  try {
    const bruto = JSON.parse(String(fd.get("linhas") ?? "[]")) as LinhaImportada[]
    linhas = bruto.slice(0, MAX_LINHAS).map((l, i) => ({
      linha: Number(l.linha) || i + 1,
      nome: String(l.nome ?? ""),
      cpf: l.cpf ? cpfDaCelula(String(l.cpf)) : null,
      email: l.email ? String(l.email) : null,
      telefone: l.telefone ? String(l.telefone) : null,
      genero: l.genero ? String(l.genero) : null,
      base: l.base ? String(l.base) : null,
      papel: l.papel ? String(l.papel) : null,
    }))
  } catch {
    return { erro: "Lista inválida. Confira o arquivo de novo." }
  }
  const r = await gravarImportacao(
    congressoId,
    linhas,
    { papelId: String(fd.get("papel_padrao") ?? "") || null, unidadeId: String(fd.get("unidade_padrao") ?? "") || null },
    origem,
    sessao.usuario.id
  )
  if (r.erro) return { erro: r.erro }
  revalidatePath(`/painel/representacao/congressos/${congressoId}`)
  return { ok: r.ok }
}
