import { exigeDocumentoComRegras, type ModoFormalizacao, type RegrasOposicao } from "@/lib/oposicao-constantes"

/**
 * Oposição: o que a pessoa lê antes de se opor (pedido do Bruno, 30/10/2026)
 * — as instruções da campanha, montadas pelas decisões jurídicas e pelo modo
 * de formalização; o aviso de privacidade (padrão do sistema ou o texto da
 * entidade, em Oposição › Decisões jurídicas); e as perguntas frequentes
 * gerais, que se somam às que quem cadastrou a campanha escreveu.
 *
 * Client-safe (sem import de servidor): a tela do portal, o formulário do
 * painel e a action que grava a ciência usam as mesmas funções — o texto
 * aceito (e o hash dele) é o mesmo que a pessoa viu.
 */

export type PerguntaFrequente = { pergunta: string; resposta: string }

/** O que as orientações precisam saber da campanha. */
export type CampanhaParaOrientacao = {
  prazo_inicio: string | null
  prazo_fim: string | null
  modo_formalizacao: ModoFormalizacao
  regras: Pick<RegrasOposicao, "carta_fora_prazo" | "video_minimo" | "assinaturas_aceitas" | "prova_nao_filiado">
  /** Há vídeo para este perfil e com tempo mínimo exigido? */
  videoMinimo: boolean
  temVideo: boolean
  temFontes: boolean
  temQuestionario: boolean
}

/** As etapas da oposição para o perfil, na ordem (o indicador do topo). */
export function nomesDasEtapas(filiado: boolean, comVideo: boolean): string[] {
  return ["Instruções", ...(filiado ? ["Seus dados"] : []), ...(comVideo ? ["Vídeo"] : []), "Confirmação", "Comprovante"]
}

/** Limites das perguntas frequentes da campanha. */
export const MAX_PERGUNTAS_FREQUENTES = 30
export const MAX_TAMANHO_PERGUNTA = 300
export const MAX_TAMANHO_RESPOSTA = 3000

function data(iso: string | null): string {
  if (!iso) return "—"
  const [a, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}/${a}`
}

function textoAssinatura(regras: CampanhaParaOrientacao["regras"]): string {
  return regras.assinaturas_aceitas === "govbr"
    ? "assinada pelo Assinador do gov.br (conta prata ou ouro)"
    : "assinada pelo Assinador do gov.br (conta prata ou ouro) ou com certificado digital ICP-Brasil (e-CPF)"
}

/**
 * As instruções da campanha para o perfil, na ordem em que as coisas
 * acontecem. Cada item é uma frase completa.
 */
export function instrucoesDaCampanha(c: CampanhaParaOrientacao, filiado: boolean): string[] {
  const exigeCarta = exigeDocumentoComRegras(c.modo_formalizacao, filiado, c.regras)
  const itens: string[] = []
  itens.push(
    `O prazo para registrar a oposição vai de ${data(c.prazo_inicio)} a ${data(c.prazo_fim)}, até as 23h59 do último dia (horário de Brasília). Depois disso o sistema não aceita mais o registro.`
  )
  itens.push(
    "A oposição é pessoal: só você pode registrá-la, com o seu CPF e um e-mail seu. Ninguém registra por outra pessoa, e o sindicato não registra por você."
  )
  if (filiado) {
    itens.push(
      "Antes de se opor, confira os seus dados no cadastro do sindicato. E-mail, telefone e endereço são obrigatórios; no endereço, comece pelo CEP, que preenche o resto."
    )
  }
  if (c.temVideo) {
    itens.push(
      c.videoMinimo
        ? "Assista ao vídeo da campanha até o fim do tempo indicado na tela; só então o botão para seguir é liberado."
        : "Há um vídeo sobre a campanha. Recomendamos assistir antes de decidir."
    )
  }
  if (c.temFontes) itens.push("Escolha a empresa onde você trabalha (a fonte pagadora) entre as da lista.")
  if (!filiado && c.regras.prova_nao_filiado === "matricula") {
    itens.push("Informe a sua matrícula na empresa. Sem ela, a oposição não é registrada.")
  }
  if (c.temQuestionario) itens.push("Responda às perguntas da campanha.")
  itens.push("Leia a declaração de oposição e confirme. Você recebe um comprovante com número de protocolo na tela e no e-mail.")
  if (exigeCarta) {
    itens.push(
      `A oposição só vale com a carta. Depois de confirmar, baixe a carta em PDF, assine ${textoAssinatura(c.regras)} e envie o PDF assinado pelo comprovante.`
    )
    itens.push(
      c.regras.carta_fora_prazo === "recusar"
        ? `A carta assinada precisa chegar até ${data(c.prazo_fim)}. Depois dessa data o sistema não recebe mais a carta, e a oposição sem carta pode ser encerrada como não aceita.`
        : `Envie a carta assinada até ${data(c.prazo_fim)}. A carta que chegar depois fica registrada como fora do prazo, e a entidade decide se a aceita.`
    )
    itens.push(
      "Assinatura escaneada, foto da carta, assinatura feita no celular sem o gov.br ou PDF de outra pessoa não valem."
    )
  }
  itens.push(
    "O sindicato confere cada oposição. Você acompanha a situação pelo comprovante (Em análise, Aceita ou Não aceita) e é avisado por e-mail."
  )
  itens.push(
    "As oposições aceitas vão em lista do sindicato para a empresa, que deixa de fazer o desconto. Desconto feito antes de a lista chegar à empresa é tratado entre você e a empresa."
  )
  itens.push(
    'Se preferir não se opor, use "Não quero me opor". Enquanto o prazo estiver aberto, você pode voltar e registrar a oposição.'
  )
  return itens
}

/** O aviso de privacidade padrão da oposição (a entidade pode trocar o texto). */
export function avisoPrivacidadePadrao(entidade: string): string {
  return [
    `Quem trata os seus dados: ${entidade}, responsável pelo tratamento.`,
    "",
    "O que coletamos: nome, CPF, e-mail, a empresa onde você trabalha e a matrícula, as respostas ao questionário, a carta assinada (quando a campanha pede), a data e a hora de cada passo, o endereço IP e o navegador usados. Do filiado, usamos também os dados do cadastro no sindicato.",
    "",
    "Para quê: registrar e conferir a sua oposição à contribuição assistencial, avisar você sobre o andamento e informar a empresa de que o desconto não deve ser feito. É o exercício de um direito seu e o cumprimento de obrigação da entidade (LGPD, art. 7º, II e VI, e art. 11, II, a e d).",
    "",
    "Com quem compartilhamos: com a empresa onde você trabalha, só o necessário para suspender o desconto (nome, CPF, matrícula e a situação da oposição). Os serviços que hospedam o sistema e enviam os e-mails atuam em nosso nome. Não vendemos nem usamos os seus dados para outra finalidade.",
    "",
    "Por quanto tempo: enquanto durar a campanha e pelo prazo em que a oposição pode ser questionada na Justiça; depois, os dados são eliminados ou anonimizados.",
    "",
    "Seus direitos: confirmar o tratamento, acessar, corrigir e pedir informações sobre os seus dados, pelos canais da entidade. Pedir a eliminação durante a campanha equivale a desistir da oposição.",
  ].join("\n")
}

/** O texto que a pessoa leu e aceitou — o mesmo na tela e no hash gravado. */
export function textoDaCiencia(instrucoes: string[], aviso: string): string {
  return [
    "INSTRUÇÕES DA CAMPANHA",
    ...instrucoes.map((t, i) => `${i + 1}. ${t}`),
    "",
    "AVISO DE PRIVACIDADE",
    aviso.trim(),
  ].join("\n")
}

/**
 * As perguntas frequentes do sistema: acesso, carta e o caminho entre o
 * sindicato e a empresa. As da campanha vêm depois destas.
 */
export function perguntasGerais(c: CampanhaParaOrientacao, entidade: string): PerguntaFrequente[] {
  const algumaCarta =
    exigeDocumentoComRegras(c.modo_formalizacao, true, c.regras) ||
    exigeDocumentoComRegras(c.modo_formalizacao, false, c.regras)
  const lista: PerguntaFrequente[] = [
    ...perguntasDeAcesso(entidade),
    {
      pergunta: "Posso registrar a oposição de outra pessoa?",
      resposta:
        "Não. A oposição é pessoal e fica ligada ao CPF e ao e-mail de quem a registra, com data, hora e endereço IP. Cada pessoa registra a sua.",
    },
    {
      pergunta: "Registrei, mas não recebi o comprovante por e-mail.",
      resposta:
        "O comprovante fica sempre disponível no sistema: entre de novo com o seu CPF e o código e abra a campanha. O e-mail é só uma cópia.",
    },
  ]
  if (algumaCarta) {
    lista.push(...perguntasDaCarta(c))
  }
  lista.push(...perguntasDoSindicatoEEmpresa(entidade))
  return lista
}

/** As perguntas da entrada (antes do código): servem também à tela de acesso. */
export function perguntasDeAcesso(entidade: string): PerguntaFrequente[] {
  return [
    {
      pergunta: "Sou filiado ou não filiado?",
      resposta: `Filiado é quem é associado a ${entidade} hoje. Quem nunca se filiou ou já se desfiliou usa "Não sou filiado". Se você se desfiliou e entrar como filiado, o sistema segue com você como não filiado.`,
    },
    {
      pergunta: "O código de acesso não chegou. O que faço?",
      resposta:
        'Espere 1 ou 2 minutos e procure no Spam, no Lixo eletrônico e, no Gmail, em Promoções e Atualizações. O assunto é "Confluir | Seu código de acesso". Dá para pedir outro código uma vez por minuto; vale sempre o mais recente. E-mails de empresa costumam barrar as nossas mensagens: prefira um e-mail pessoal.',
    },
    {
      pergunta: "Sou filiado, mas não tenho mais acesso ao e-mail do cadastro.",
      resposta: `Procure ${entidade} pelos canais de atendimento para atualizar o e-mail do cadastro. Depois, peça o código de novo.`,
    },
    {
      pergunta: 'Aparece "código inválido ou expirado".',
      resposta:
        "O código vale por pouco tempo e serve uma vez só. Peça um novo e use o do e-mail mais recente. Confira se digitou todos os números, sem espaços.",
    },
  ]
}

function perguntasDaCarta(c: CampanhaParaOrientacao): PerguntaFrequente[] {
  return [
      {
        pergunta: "Como assino a carta pelo gov.br?",
        resposta:
          'Baixe a carta em PDF pelo comprovante. Abra o Assinador do gov.br (assinador.iti.br) com a sua conta gov.br prata ou ouro, envie o PDF, assine e baixe o arquivo assinado. Depois, volte ao comprovante e envie esse PDF em "Enviar a carta assinada".',
      },
      {
        pergunta: "A minha conta gov.br é bronze. E agora?",
        resposta:
          "O Assinador exige conta prata ou ouro. Dá para subir o nível no aplicativo gov.br, pelo reconhecimento facial ou pelo banco. Faça isso com antecedência: o prazo da carta não muda por isso.",
      },
      {
        pergunta: 'Enviei a carta e apareceu "assinatura não confere" ou "sem assinatura".',
        resposta:
          "O sistema confere a assinatura digital do PDF. Foto, digitalização ou PDF impresso e escaneado perdem a assinatura. Assine de novo o PDF original da carta e envie o arquivo que o Assinador devolveu, sem abrir e salvar em outro programa.",
      },
      {
        pergunta: "Até quando posso enviar a carta?",
        resposta:
          c.regras.carta_fora_prazo === "recusar"
            ? `Até ${data(c.prazo_fim)}. Depois disso o sistema não recebe mais a carta, e a oposição sem carta pode ser encerrada como não aceita.`
            : `Até ${data(c.prazo_fim)}. A carta que chegar depois fica marcada como fora do prazo, e a entidade decide se a aceita.`,
      },
  ]
}

function perguntasDoSindicatoEEmpresa(entidade: string): PerguntaFrequente[] {
  return [
    {
      pergunta: "Como sei se a minha oposição foi aceita?",
      resposta:
        "Pelo comprovante, que mostra a situação (Em análise, Aceita ou Não aceita, com o motivo), e pelo e-mail que enviamos quando o sindicato avalia.",
    },
    {
      pergunta: "Depois de aceita, o que acontece?",
      resposta: `${entidade} envia à empresa a lista das oposições aceitas, e a empresa deixa de descontar a contribuição de quem está nela. O sindicato não faz o desconto: quem desconta é a empresa, na folha.`,
    },
    {
      pergunta: "O desconto veio na folha mesmo com a oposição aceita.",
      resposta: `Pode ter sido feito antes de a lista chegar à empresa. Fale primeiro com o RH, mostrando o comprovante com o protocolo. Se não resolver, procure ${entidade} com o número do protocolo.`,
    },
    {
      pergunta: "Mudei de ideia. Posso desistir da oposição?",
      resposta: `Enquanto o prazo estiver aberto, fale com ${entidade} pelos canais de atendimento. Quem escolheu "Não quero me opor" pode voltar e registrar a oposição até o fim do prazo.`,
    },
    {
      pergunta: "Me opor afeta a minha filiação ou os meus direitos?",
      resposta:
        "A oposição é só à contribuição assistencial desta campanha. Ela não desfilia ninguém e não muda a cobertura do acordo coletivo.",
    },
  ]
}

/** Lê o jsonb das perguntas da campanha: só pares com pergunta e resposta. */
export function normalizarPerguntasFrequentes(bruto: unknown): PerguntaFrequente[] {
  if (!Array.isArray(bruto)) return []
  const lista: PerguntaFrequente[] = []
  for (const item of bruto) {
    if (!item || typeof item !== "object") continue
    const p = String((item as Record<string, unknown>).pergunta ?? "").trim()
    const r = String((item as Record<string, unknown>).resposta ?? "").trim()
    if (p && r) lista.push({ pergunta: p.slice(0, MAX_TAMANHO_PERGUNTA), resposta: r.slice(0, MAX_TAMANHO_RESPOSTA) })
  }
  return lista.slice(0, MAX_PERGUNTAS_FREQUENTES)
}
