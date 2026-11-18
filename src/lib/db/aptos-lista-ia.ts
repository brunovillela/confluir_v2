import "server-only"

import { conferirLinhaApto, type LinhaApto } from "@/lib/aptos-linhas"
import { lerListaTrabalhadores, MAX_LINHAS_LISTA } from "@/lib/ia-lista-trabalhadores"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Lista de aptos lida pela IA (17/11/2026), como a "Atualizar por lista" da
 * Filiação: o navegador sobe o arquivo (planilha, CSV, PDF ou imagem) ao
 * bucket `listas-trabalhadores` (criarEnvioLista), a IA transcreve
 * (lib/ia-lista-trabalhadores) e cada linha passa pela mesma conferência do
 * CSV. Nada entra na rodada aqui: a tela mostra a prévia e só a confirmação
 * inclui os aptos. O arquivo é apagado ao fim, dê certo ou não.
 */

const BUCKET = "listas-trabalhadores"
const MAX_ARQUIVO = 25 * 1024 * 1024

export type DescartadaApto = { linha: number; nome: string | null; motivo: string }

export type LeituraAptos = {
  erro?: string
  linhas?: LinhaApto[]
  descartadas?: DescartadaApto[]
  avisos?: string[]
  /** Trabalhadores que a IA transcreveu (antes da conferência). */
  lidas?: number
}

export async function lerAptosDaLista(caminho: string, nomeArquivo: string): Promise<LeituraAptos> {
  const prefixo = `${await tenantAtual()}/`
  if (!caminho.startsWith(prefixo) || !/^[0-9a-f-]{36}\.[a-z0-9]{2,5}$/i.test(caminho.slice(prefixo.length))) {
    return { erro: "Envio inválido." }
  }
  const admin = await createAdminClient()
  try {
    const { data: blob, error } = await admin.storage.from(BUCKET).download(caminho)
    if (error || !blob) return { erro: "O arquivo enviado não foi encontrado. Envie de novo." }
    if (blob.size > MAX_ARQUIVO) return { erro: "Arquivo grande demais — até 25 MB." }
    const leitura = await lerListaTrabalhadores(new File([blob], nomeArquivo.slice(0, 200), { type: blob.type }))
    if (leitura.erro || !leitura.linhas) return { erro: leitura.erro ?? "Falha na leitura." }
    if (leitura.linhas.length === 0) return { erro: "A IA não encontrou trabalhadores neste arquivo." }
    if (leitura.linhas.length > MAX_LINHAS_LISTA) {
      return {
        erro: `Lista grande demais para a IA (${leitura.linhas.length.toLocaleString("pt-BR")} trabalhadores). Divida em arquivos de até ${MAX_LINHAS_LISTA.toLocaleString("pt-BR")} ou use o CSV modelo.`,
      }
    }
    const linhas: LinhaApto[] = []
    const descartadas: DescartadaApto[] = []
    leitura.linhas.forEach((b, i) => {
      const c = conferirLinhaApto(
        {
          cpf: b.cpf,
          nome: b.nome,
          matricula: b.matricula,
          // Na rodada vale o e-mail que a empresa usa (o corporativo); sem ele, o que vier.
          email: b.email_corporativo || b.email,
          telefone: b.telefone_1 || b.telefone_2,
        },
        i + 1
      )
      if ("linha" in c) linhas.push(c.linha)
      else if ("erro" in c) descartadas.push({ linha: i + 1, nome: (b.nome ?? "").trim() || null, motivo: c.erro })
      else descartadas.push({ linha: i + 1, nome: (b.nome ?? "").trim() || null, motivo: "Linha de exemplo da planilha modelo." })
    })
    return { linhas, descartadas, avisos: leitura.avisos ?? [], lidas: leitura.linhas.length }
  } catch (e) {
    console.error("Aptos por IA — leitura:", e)
    return { erro: "A leitura falhou de forma inesperada. Envie de novo." }
  } finally {
    await admin.storage.from(BUCKET).remove([caminho])
  }
}
