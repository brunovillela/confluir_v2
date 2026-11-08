/**
 * Constantes e helpers de Oposição à Contribuição Assistencial, compartilhados
 * entre client e server (FORA de `server-only` — badges e forms importam daqui).
 */

// ── Modo de formalização (por campanha) ─────────────────────────────────────
export const MODOS_FORMALIZACAO = [
  { chave: "tela", rotulo: "Só confirmação na tela" },
  { chave: "assinatura", rotulo: "Confirmação + assinatura gov.br + upload" },
  { chave: "hibrido", rotulo: "Híbrido (filiado só confirma; não-filiado assina)" },
] as const

export type ModoFormalizacao = (typeof MODOS_FORMALIZACAO)[number]["chave"]

/** O trabalhador precisa assinar/enviar documento neste modo+perfil? */
export function exigeDocumento(
  modo: ModoFormalizacao,
  ehFiliado: boolean
): boolean {
  if (modo === "assinatura") return true
  if (modo === "hibrido") return !ehFiliado
  return false
}

// ── Situação da campanha ─────────────────────────────────────────────────────
export const SITUACOES_CAMPANHA = [
  { chave: "rascunho", rotulo: "Rascunho" },
  { chave: "aberta", rotulo: "Aberta" },
  { chave: "encerrada", rotulo: "Encerrada" },
] as const

export type SituacaoCampanha = (typeof SITUACOES_CAMPANHA)[number]["chave"]

// ── Situação do opositor (as 5) ──────────────────────────────────────────────
export const SITUACOES_OPOSITOR = [
  { chave: "aguardando_documento", rotulo: "Aguardando documento" },
  { chave: "nao_avaliada", rotulo: "Não avaliada" },
  { chave: "aprovada", rotulo: "Aprovada" },
  { chave: "reprovada", rotulo: "Reprovada" },
  { chave: "desistente", rotulo: "Desistente" },
] as const

export type SituacaoOpositor = (typeof SITUACOES_OPOSITOR)[number]["chave"]

export const ROTULO_SITUACAO_OPOSITOR: Record<SituacaoOpositor, string> =
  Object.fromEntries(
    SITUACOES_OPOSITOR.map((s) => [s.chave, s.rotulo])
  ) as Record<SituacaoOpositor, string>

/**
 * Deriva a situação a partir dos campos legados (avaliacao/desistente) — usada
 * na migração e como fallback de exibição. `aguardando_documento` só existe no
 * fluxo novo, então não é derivável do legado.
 */
export function derivarSituacaoOpositor(o: {
  avaliacao?: boolean | null
  avaliacao_data?: string | null
  desistente?: boolean | null
}): SituacaoOpositor {
  if (o.desistente === true) return "desistente"
  if (o.avaliacao === true) return "aprovada"
  if (o.avaliacao === false && o.avaliacao_data) return "reprovada"
  return "nao_avaliada"
}

// ── Prazo ────────────────────────────────────────────────────────────────────
export type EstadoPrazo = "antes" | "aberto" | "depois" | "sem_prazo"

/**
 * Estado da janela de oposição (datas AAAA-MM-DD, `hoje` no fuso de SP passado
 * pelo servidor). Fora da janela o portal mostra informe e bloqueia o registro.
 */
export function estadoPrazo(
  inicio: string | null,
  fim: string | null,
  hoje: string
): EstadoPrazo {
  if (!inicio || !fim) return "sem_prazo"
  const h = hoje.slice(0, 10)
  if (h < inicio.slice(0, 10)) return "antes"
  if (h > fim.slice(0, 10)) return "depois"
  return "aberto"
}

/**
 * O que a pessoa aceita quando a campanha não tem texto de declaração: a
 * frase da caixa de confirmação. Fica gravado no opositor (declaracao_aceita)
 * junto com o hash, como o texto de qualquer campanha (onda 0, 27/10/2026).
 */
export const DECLARACAO_PADRAO = "Confirmo a minha oposição à contribuição."

/**
 * Motivos prontos da avaliação (onda 2 das melhorias, 31/10/2026): o texto
 * vai ao trabalhador como está (e pode ser editado antes de salvar).
 * "devolver" = dá para corrigir mandando outra carta ("Pedir nova carta");
 * "reprovar" = a oposição não vale.
 */
export const MOTIVOS_AVALIACAO = [
  {
    chave: "sem_assinatura",
    tipo: "devolver",
    rotulo: "Carta sem assinatura digital válida",
    texto:
      "A carta enviada não tem uma assinatura digital válida — foto, digitalização ou PDF salvo de novo em outro programa perdem a assinatura. Assine o PDF original da carta no Assinador do gov.br e envie o arquivo que ele devolver, sem abrir e salvar em outro programa.",
  },
  {
    chave: "outra_pessoa",
    tipo: "devolver",
    rotulo: "Assinada por outra pessoa (CPF não confere)",
    texto:
      "A carta foi assinada com a conta gov.br ou o certificado de outra pessoa. A assinatura precisa ser feita com a sua própria conta, no seu CPF. Assine de novo e envie.",
  },
  {
    chave: "arquivo_errado",
    tipo: "devolver",
    rotulo: "O arquivo não é a carta da campanha",
    texto:
      "O arquivo enviado não é a carta de oposição desta campanha. Baixe a carta pelo comprovante, assine no Assinador do gov.br e envie esse PDF.",
  },
  {
    chave: "ecpf_nao_aceito",
    tipo: "devolver",
    rotulo: "e-CPF não aceito nesta campanha",
    texto: "Esta campanha aceita só a assinatura do gov.br. Assine a carta pelo Assinador do gov.br e envie de novo.",
  },
  {
    chave: "fora_prazo",
    tipo: "reprovar",
    rotulo: "Fora do prazo",
    texto: "A oposição (ou a carta assinada) chegou depois do prazo da campanha.",
  },
  {
    chave: "empresa_fora",
    tipo: "reprovar",
    rotulo: "Empresa fora da campanha",
    texto: "A empresa informada não está entre as abrangidas por esta campanha de contribuição assistencial.",
  },
  {
    chave: "duplicada",
    tipo: "reprovar",
    rotulo: "Oposição em duplicidade",
    texto: "Já existe outra oposição sua registrada nesta campanha; vale a primeira.",
  },
  {
    chave: "identidade",
    tipo: "reprovar",
    rotulo: "Identidade não confirmada",
    texto:
      "Não foi possível confirmar que a oposição foi registrada pelo próprio trabalhador. Procure a entidade, informando o protocolo.",
  },
] as const

export type MotivoAvaliacao = (typeof MOTIVOS_AVALIACAO)[number]

/** Meio do envio da relação de oposições ao empregador (onda 2). */
export const MEIOS_ENVIO = [
  { chave: "email", rotulo: "E-mail" },
  { chave: "oficio", rotulo: "Ofício" },
  { chave: "em_maos", rotulo: "Entregue em mãos" },
  { chave: "sistema_rh", rotulo: "Sistema do RH" },
  { chave: "outro", rotulo: "Outro" },
] as const
export type MeioEnvio = (typeof MEIOS_ENVIO)[number]["chave"]

/**
 * Tamanho máximo da carta assinada (onda 3, M3): o corpo de uma server action
 * vai até 4 MB (next.config.ts) e o formulário leva mais que o arquivo. Acima
 * disso, o envio falhava com erro genérico; agora a tela avisa antes.
 */
export const TAMANHO_MAX_CARTA = 3.8 * 1024 * 1024

// ── Decisões jurídicas (28/10/2026) ──────────────────────────────────────────
// Cada entidade tem um padrão (oposicao_regras) e cada campanha pode decidir
// diferente (oposicao_campanha.regra_*; nulo = padrão da entidade). A
// campanha só abre com todas decididas.

export const DECISOES_JURIDICAS = [
  {
    chave: "carta_fora_prazo",
    rotulo: "Carta assinada depois do prazo",
    ajuda: "Quem registrou a oposição no prazo, mas manda a carta assinada depois dele.",
    opcoes: [
      { chave: "aceitar", rotulo: "Aceitar e marcar no checklist", efeito: "A carta é recebida; a avaliação mostra que chegou fora do prazo." },
      { chave: "recusar", rotulo: "Recusar", efeito: "Depois do prazo, o portal não recebe mais a carta." },
    ],
  },
  {
    chave: "video_minimo",
    rotulo: "Vídeo da campanha",
    ajuda: "Quando a campanha tem vídeo com tempo mínimo cadastrado.",
    opcoes: [
      { chave: "exigir", rotulo: "Exigir o tempo mínimo", efeito: "O botão de confirmar só libera depois do tempo cadastrado." },
      { chave: "dispensar", rotulo: "Mostrar sem exigir", efeito: "O vídeo aparece, mas a pessoa pode confirmar na hora." },
    ],
  },
  {
    chave: "assinaturas_aceitas",
    rotulo: "Assinaturas aceitas na carta",
    ajuda:
      "Pelo Confluir, a pessoa assina na própria página, sem baixar nem reenviar arquivo: fica um certificado com QR code que os dois lados podem conferir. O Assinador gov.br pede conta prata ou ouro; o e-CPF (ICP-Brasil) é a alternativa para quem não tem.",
    opcoes: [
      {
        chave: "confluir",
        rotulo: "Só pelo Confluir",
        efeito: "A carta é assinada na página da oposição, com certificado e verificação pública. Não se baixa nem se envia PDF.",
      },
      {
        chave: "confluir_ou_carta",
        rotulo: "Confluir ou carta assinada no gov.br/e-CPF",
        efeito: "O Confluir vem primeiro; quem preferir ainda pode assinar a carta no gov.br (ou com e-CPF) e enviar o PDF.",
      },
      { chave: "govbr", rotulo: "Só gov.br", efeito: "Carta assinada com e-CPF fica como pendência na avaliação." },
      { chave: "govbr_icp", rotulo: "gov.br ou e-CPF (ICP-Brasil)", efeito: "As duas valem." },
    ],
  },
  {
    chave: "prova_nao_filiado",
    rotulo: "Prova exigida do não filiado",
    ajuda: "Além do nome, do CPF e do e-mail confirmado por código.",
    opcoes: [
      { chave: "nenhuma", rotulo: "Nenhuma além do e-mail confirmado", efeito: "Segue o modo de formalização da campanha." },
      { chave: "matricula", rotulo: "Matrícula na fonte pagadora", efeito: "O campo da matrícula passa a ser obrigatório para o não filiado." },
      { chave: "carta_govbr", rotulo: "Carta assinada", efeito: "O não filiado precisa mandar a carta assinada, em qualquer modo de formalização." },
    ],
  },
  {
    chave: "segregacao",
    rotulo: "Permissões no painel",
    ajuda: "Quem pode configurar a campanha e quem pode avaliar as oposições.",
    opcoes: [
      { chave: "unica", rotulo: "Uma permissão só", efeito: "Quem tem “Oposição” configura, avalia e consulta." },
      { chave: "separada", rotulo: "Separadas", efeito: "Configurar exige “Oposição — configurar”; avaliar exige “Oposição — avaliar”; “Oposição” só consulta." },
    ],
  },
] as const

export type ChaveDecisao = (typeof DECISOES_JURIDICAS)[number]["chave"]

/** As decisões; nulo = não decidido (na campanha: segue o padrão da entidade). */
export type RegrasOposicao = Record<ChaveDecisao, string | null>

export const CHAVES_DECISAO: ChaveDecisao[] = DECISOES_JURIDICAS.map((d) => d.chave)

export const REGRAS_VAZIAS: RegrasOposicao = Object.fromEntries(CHAVES_DECISAO.map((c) => [c, null])) as RegrasOposicao

/** A decisão que vale: a da campanha, ou o padrão da entidade. */
export function regrasEfetivas(campanha: RegrasOposicao, entidade: RegrasOposicao): RegrasOposicao {
  return Object.fromEntries(CHAVES_DECISAO.map((c) => [c, campanha[c] ?? entidade[c] ?? null])) as RegrasOposicao
}

/** As decisões ainda em branco (rótulos), para a mensagem que impede abrir. */
export function decisoesFaltando(regras: RegrasOposicao): string[] {
  return DECISOES_JURIDICAS.filter((d) => !regras[d.chave]).map((d) => d.rotulo)
}

export function rotuloOpcao(chave: ChaveDecisao, valor: string | null): string | null {
  if (!valor) return null
  const d = DECISOES_JURIDICAS.find((x) => x.chave === chave)
  return (d?.opcoes as readonly { chave: string; rotulo: string }[] | undefined)?.find((o) => o.chave === valor)?.rotulo ?? valor
}

/** Valor válido para a decisão (o que vem do formulário é conferido aqui). */
export function valorDecisao(chave: ChaveDecisao, valor: string | null | undefined): string | null {
  const d = DECISOES_JURIDICAS.find((x) => x.chave === chave)
  return (d?.opcoes as readonly { chave: string }[] | undefined)?.some((o) => o.chave === valor) ? (valor as string) : null
}

/** A carta pode ser assinada pelo próprio Confluir (08/11/2026)? */
export function assinaPeloConfluir(aceitas: string | null | undefined): boolean {
  return aceitas === "confluir" || aceitas === "confluir_ou_carta"
}

/** A carta assinada fora (gov.br/e-CPF) e enviada em PDF ainda é aceita? */
export function aceitaCartaEnviada(aceitas: string | null | undefined): boolean {
  return aceitas !== "confluir"
}

/**
 * O documento assinado é exigido? O modo da campanha e, para o não filiado,
 * a decisão "prova do não filiado = carta assinada".
 */
export function exigeDocumentoComRegras(modo: ModoFormalizacao, ehFiliado: boolean, regras: Pick<RegrasOposicao, "prova_nao_filiado">): boolean {
  return exigeDocumento(modo, ehFiliado) || (!ehFiliado && regras.prova_nao_filiado === "carta_govbr")
}
