import { decisoesFaltando, type RegrasOposicao } from "@/lib/oposicao-constantes"

/**
 * Oposição: a campanha está pronta para abrir? (onda 1 das melhorias,
 * docs/plano-oposicao-melhorias-2026-10.md). Um item por coisa a conferir:
 * "impede" é o que o sistema recusa ao abrir (ou deixa a campanha sem
 * receber), "atencao" é o que costuma virar reclamação. Client-safe.
 */

export type NivelProntidao = "ok" | "atencao" | "impede"

export type ItemProntidao = {
  chave: string
  rotulo: string
  nivel: NivelProntidao
  detalhe: string
}

export type CampanhaParaProntidao = {
  prazo_inicio: string | null
  prazo_fim: string | null
  texto_declaracao: string | null
  video_filiado_url: string | null
  video_filiado_tempo: number | null
  video_nao_filiado_url: string | null
  video_nao_filiado_tempo: number | null
  fontes: unknown[]
  perguntasFrequentes: unknown[]
  /** Oposições registradas (sem desistentes). */
  total: number
}

export function prontidaoDaCampanha(
  c: CampanhaParaProntidao,
  regras: RegrasOposicao,
  avisoDaEntidade: string | null,
  hoje: string
): ItemProntidao[] {
  const itens: ItemProntidao[] = []
  const faltam = decisoesFaltando(regras)
  itens.push({
    chave: "decisoes",
    rotulo: "Decisões jurídicas",
    nivel: faltam.length ? "impede" : "ok",
    detalhe: faltam.length
      ? `Faltam: ${faltam.join("; ")}. Sem elas a campanha não abre (defina aqui ou no padrão da entidade).`
      : "Todas decididas.",
  })

  const inicio = c.prazo_inicio?.slice(0, 10) ?? null
  const fim = c.prazo_fim?.slice(0, 10) ?? null
  itens.push({
    chave: "prazo",
    rotulo: "Prazo",
    nivel: !inicio || !fim || fim < inicio ? "impede" : fim < hoje ? "atencao" : "ok",
    detalhe:
      !inicio || !fim
        ? "Preencha o início e o fim."
        : fim < inicio
          ? "O fim está antes do início."
          : fim < hoje
            ? "O prazo já terminou: o portal não recebe mais oposições."
            : "Início e fim preenchidos.",
  })

  itens.push({
    chave: "fontes",
    rotulo: "Fontes pagadoras",
    nivel: c.fontes.length ? "ok" : "atencao",
    detalhe: c.fontes.length
      ? `${c.fontes.length} marcada(s): o aviso no portal vai só a quem trabalha nelas.`
      : "Nenhuma marcada: o aviso no portal vai a todos os filiados, e cada pessoa escolhe a empresa numa lista geral.",
  })

  const videoSemEndereco = [
    regras.video_minimo === "exigir" && (c.video_filiado_tempo ?? 0) > 0 && !c.video_filiado_url ? "filiado" : null,
    regras.video_minimo === "exigir" && (c.video_nao_filiado_tempo ?? 0) > 0 && !c.video_nao_filiado_url
      ? "não filiado"
      : null,
  ].filter(Boolean)
  itens.push({
    chave: "video",
    rotulo: "Vídeo",
    nivel: videoSemEndereco.length ? "atencao" : "ok",
    detalhe: videoSemEndereco.length
      ? `Tempo mínimo sem vídeo (${videoSemEndereco.join(" e ")}): a pessoa espera o tempo olhando uma tela vazia.`
      : "Sem vídeo, ou com o endereço preenchido.",
  })

  itens.push({
    chave: "declaracao",
    rotulo: "Declaração de oposição",
    nivel: c.texto_declaracao?.trim() ? "ok" : "atencao",
    detalhe: c.texto_declaracao?.trim()
      ? "Texto próprio da campanha."
      : "Sem texto próprio: vale a declaração padrão do sistema. Confira com o jurídico.",
  })

  itens.push({
    chave: "aviso",
    rotulo: "Aviso de privacidade",
    nivel: avisoDaEntidade?.trim() ? "ok" : "atencao",
    detalhe: avisoDaEntidade?.trim()
      ? "Texto da entidade."
      : "Ainda o texto padrão do sistema. Revise com o jurídico em Decisões jurídicas.",
  })

  itens.push({
    chave: "perguntas",
    rotulo: "Perguntas frequentes da campanha",
    nivel: c.perguntasFrequentes.length ? "ok" : "atencao",
    detalhe: c.perguntasFrequentes.length
      ? `${c.perguntasFrequentes.length} pergunta(s) próprias, além das gerais.`
      : "Só as gerais. Acrescente o que é desta campanha: valor e meses do desconto, empresas, quando a lista vai ao RH.",
  })

  itens.push({
    chave: "teste",
    rotulo: "Teste completo",
    nivel: c.total > 0 ? "ok" : "atencao",
    detalhe:
      c.total > 0
        ? "A campanha já recebeu oposições."
        : "Leia tudo em “Ver como o trabalhador”. Para o fluxo inteiro (código, dados, carta, comprovante), teste na demo com as mesmas decisões: aqui, uma oposição registrada não se apaga.",
  })
  return itens
}
