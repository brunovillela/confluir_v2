import { ASSUNTOS_ATENDIMENTO } from "@/lib/atendimento-constantes"

/**
 * Área do associado (Filiados › Área do associado): o catálogo das partes do
 * portal que a gestão habilita, suspende, desabilita e configura. Sem imports
 * de servidor: alimenta o formulário do painel, a casca do portal e as
 * mensagens. A leitura do que cada entidade escolheu mora em
 * src/lib/db/portal-partes.ts (tabela portal_partes).
 *
 * Estados:
 *  - habilitada: como sempre foi;
 *  - suspensa: continua no menu, a página mostra o aviso e tudo o que GRAVA
 *    fica bloqueado no servidor; o que já existe continua para consulta;
 *  - desabilitada: sai do menu, do Início, da Ajuda e dos avisos; a rota
 *    mostra "indisponível" e as ações ficam bloqueadas.
 *
 * Toda opção tem um padrão que reproduz o comportamento de antes: sem linha
 * na tabela (ou sem o SQL), nada muda para o associado.
 */

export const ESTADOS_PARTE = ["habilitada", "suspensa", "desabilitada"] as const
export type EstadoParte = (typeof ESTADOS_PARTE)[number]

export const ROTULO_ESTADO_PARTE: Record<EstadoParte, string> = {
  habilitada: "Habilitada",
  suspensa: "Suspensa",
  desabilitada: "Desabilitada",
}

export const GRUPOS_PARTES = ["Geral", "Eu", "Serviços", "Participar", "Falar com o sindicato", "Mais"] as const
export type GrupoParte = (typeof GRUPOS_PARTES)[number]

type OpcaoBase = { readonly chave: string; readonly rotulo: string; readonly ajuda?: string }
export type OpcaoParte =
  | (OpcaoBase & { readonly tipo: "booleano"; readonly padrao: boolean })
  | (OpcaoBase & {
      readonly tipo: "texto"
      readonly padrao: string
      readonly max: number
      /** Mais de uma linha (Textarea). */
      readonly linhas?: number
      readonly placeholder?: string
    })
  | (OpcaoBase & {
      readonly tipo: "numero"
      readonly padrao: number
      readonly min: number
      readonly max: number
      readonly unidade?: string
    })
  | (OpcaoBase & {
      readonly tipo: "lista"
      readonly padrao: readonly string[]
      readonly itens: readonly { readonly valor: string; readonly rotulo: string }[]
      readonly min?: number
      readonly max?: number
    })

export type DefinicaoParte = {
  readonly chave: string
  readonly titulo: string
  readonly grupo: GrupoParte
  /** O que a parte é para o associado (uma frase, no painel). */
  readonly descricao: string
  /**
   * Rotas do portal que pertencem à parte (prefixos). A primeira é a do menu.
   * Também decide a que parte um link de aviso pertence (prefixo mais longo).
   */
  readonly rotas: readonly string[]
  readonly podeSuspender: boolean
  readonly podeDesabilitar: boolean
  /** O que a suspensão bloqueia (texto do painel, junto da escolha). */
  readonly efeitoSuspensa?: string
  /** O que a desabilitação tira (texto do painel). */
  readonly efeitoDesabilitada?: string
  /** Por que não dá para desligar, ou o cuidado que a escolha pede. */
  readonly observacao?: string
  /** Onde o resto do que a parte mostra já é configurado no painel. */
  readonly configuradoEm: readonly { readonly rotulo: string; readonly href: string }[]
  readonly opcoes: readonly OpcaoParte[]
}

/** Atalhos que podem ir para a barra inferior do celular. */
const ATALHOS_BARRA = [
  { valor: "/portal/inicio", rotulo: "Início" },
  { valor: "/portal/cadastro", rotulo: "Meu cadastro" },
  { valor: "/portal/carteirinha", rotulo: "Carteirinha" },
  { valor: "/portal/contribuicao", rotulo: "Contribuição" },
  { valor: "/portal/hospedagem", rotulo: "Hospedagem" },
  { valor: "/portal/convenios", rotulo: "Convênios" },
  { valor: "/portal/saude", rotulo: "Saúde" },
  { valor: "/portal/votacao", rotulo: "Votação" },
  { valor: "/portal/eventos", rotulo: "Eventos" },
  { valor: "/portal/noticias", rotulo: "Notícias" },
  { valor: "/portal/atendimento", rotulo: "Atendimento" },
  { valor: "/portal/sindicato", rotulo: "O sindicato" },
  { valor: "/portal/avisos", rotulo: "Avisos" },
] as const

export const PARTES_PORTAL = [
  // ── Geral ────────────────────────────────────────────────────────────────
  {
    chave: "portal",
    titulo: "Portal inteiro",
    grupo: "Geral",
    descricao: "Interruptor geral do portal do associado, a tela de entrada e a barra de atalhos do celular.",
    rotas: [],
    podeSuspender: true,
    podeDesabilitar: true,
    efeitoSuspensa:
      "O portal fica em modo de consulta: o associado entra e vê tudo, mas nada é gravado (pedidos, inscrições, votos, solicitações, cadastro). Sair, desligar avisos e a contribuição assistencial continuam.",
    efeitoDesabilitada:
      "O portal sai do ar: a tela de entrada mostra a mensagem e não deixa entrar. A contribuição assistencial (oposição) continua aberta, por ter prazo legal. Os avisos por e-mail e celular para o portal param.",
    configuradoEm: [{ rotulo: "Nome e logomarca da entidade", href: "/painel/institucional/organizacao" }],
    opcoes: [
      {
        chave: "aviso_entrada",
        tipo: "texto",
        rotulo: "Aviso na tela de entrada",
        ajuda: "Aparece em destaque para quem vai entrar. Em branco, nenhum aviso.",
        padrao: "",
        max: 400,
        linhas: 2,
      },
      {
        chave: "orientacao_entrada",
        tipo: "texto",
        rotulo: "Orientação para quem não consegue entrar",
        ajuda: "Rodapé da tela de entrada. Diga como falar com a secretaria (telefone, WhatsApp, horário).",
        padrao: "Sem e-mail no cadastro, ou sem acesso a ele? Procure o sindicato para atualizar seus dados.",
        max: 300,
        linhas: 2,
      },
      {
        chave: "atalhos",
        tipo: "lista",
        rotulo: "Atalhos da barra inferior (celular)",
        ajuda: "Até 4. A barra mostra só os de partes habilitadas; o resto fica em \"Mais\".",
        padrao: ["/portal/inicio", "/portal/contribuicao", "/portal/carteirinha", "/portal/atendimento"],
        itens: ATALHOS_BARRA,
        min: 1,
        max: 4,
      },
    ],
  },
  {
    chave: "inicio",
    titulo: "Início",
    grupo: "Geral",
    descricao: "A primeira página: situação, pendências, novidades, compromissos e os atalhos das partes.",
    rotas: ["/portal/inicio"],
    podeSuspender: false,
    podeDesabilitar: false,
    observacao: "É a porta do portal: não se desliga. Cada bloco segue o estado da parte de onde vem.",
    configuradoEm: [
      { rotulo: "Notícias", href: "/painel/comunicacao/noticias" },
      { rotulo: "Agenda (caixa \"No portal do filiado\")", href: "/painel/ferramentas/agenda" },
    ],
    opcoes: [
      {
        chave: "recado",
        tipo: "texto",
        rotulo: "Recado no topo do Início",
        ajuda: "Para todos os associados (ex.: horário de fim de ano, mudança de endereço). Em branco, nenhum recado.",
        padrao: "",
        max: 500,
        linhas: 3,
      },
    ],
  },

  {
    // Pedido do Bruno (18/10/2026): depois de filiado, o associado só usa o
    // portal depois de aceitar o termo LGPD e completar o cadastro.
    chave: "primeiro_acesso",
    titulo: "Primeiro acesso",
    grupo: "Geral",
    descricao:
      "Antes de usar o portal, o associado aceita o termo de privacidade em vigor e completa os dados obrigatórios.",
    rotas: ["/portal/primeiro-acesso"],
    podeSuspender: false,
    podeDesabilitar: false,
    observacao:
      "Liga e desliga pelas opções. Vale também para quem já usa o portal (no próximo acesso) e de novo quando um termo novo entra em vigor. A contribuição assistencial, a desistência da filiação coletiva, o pedido de desfiliação, as preferências de avisos e a Ajuda continuam abertos sem ele.",
    configuradoEm: [{ rotulo: "Termo de privacidade (LGPD)", href: "/painel/filiados/termos" }],
    opcoes: [
      {
        chave: "exigir",
        tipo: "booleano",
        rotulo: "Exigir o primeiro acesso antes de usar o portal",
        padrao: true,
      },
      {
        chave: "exigir_termo",
        tipo: "booleano",
        rotulo: "Aceite do termo de privacidade em vigor",
        ajuda: "Sem termo publicado em Termos legais, este passo não é pedido.",
        padrao: true,
      },
      {
        chave: "campos_obrigatorios",
        tipo: "lista",
        rotulo: "Dados obrigatórios",
        ajuda: "Só se exige o que o associado pode alterar em Meu cadastro.",
        padrao: ["email", "telefone", "endereco"],
        itens: [
          { valor: "email", rotulo: "Um e-mail (pessoal ou corporativo)" },
          { valor: "telefone", rotulo: "Um telefone" },
          { valor: "endereco", rotulo: "Endereço completo (CEP, rua, número, bairro, cidade e UF)" },
          { valor: "contato_emergencia", rotulo: "Um contato de emergência" },
        ],
      },
    ],
  },

  // ── Eu ───────────────────────────────────────────────────────────────────
  {
    chave: "cadastro",
    titulo: "Meu cadastro",
    grupo: "Eu",
    descricao: "O associado confere e atualiza contato, endereço e contatos de emergência.",
    rotas: ["/portal/cadastro"],
    podeSuspender: true,
    podeDesabilitar: false,
    efeitoSuspensa: "O associado vê os dados, mas não salva alterações nem contatos de emergência.",
    observacao: "Não se desabilita: é o canal de correção dos dados do titular (LGPD, art. 18, III).",
    configuradoEm: [{ rotulo: "Cadastro de cada filiado", href: "/painel/filiados/lista" }],
    opcoes: [
      {
        chave: "campos_editaveis",
        tipo: "lista",
        rotulo: "O que o associado pode alterar",
        ajuda: "O que ficar de fora aparece só para consulta; a mudança é pedida à secretaria.",
        padrao: ["email_pessoal", "email_corporativo", "telefones", "endereco"],
        itens: [
          { valor: "email_pessoal", rotulo: "E-mail pessoal" },
          { valor: "email_corporativo", rotulo: "E-mail corporativo" },
          { valor: "telefones", rotulo: "Telefones" },
          { valor: "endereco", rotulo: "Endereço" },
        ],
      },
      {
        chave: "contatos_emergencia",
        tipo: "booleano",
        rotulo: "Mostrar contatos de emergência",
        ajuda: "O associado cadastra e edita quem avisar numa emergência.",
        padrao: true,
      },
    ],
  },
  {
    chave: "carteirinha",
    titulo: "Carteirinha",
    grupo: "Eu",
    descricao: "Carteira digital com QR de verificação e a declaração de filiação em PDF.",
    rotas: ["/portal/carteirinha"],
    podeSuspender: true,
    podeDesabilitar: true,
    efeitoSuspensa: "O cartão continua na tela, com o aviso; a declaração em PDF fica bloqueada.",
    efeitoDesabilitada:
      "Sai do menu, da barra e do Início. A verificação pública dos QR já apresentados continua respondendo.",
    configuradoEm: [{ rotulo: "Nome, CNPJ e logomarca da declaração", href: "/painel/institucional/organizacao" }],
    opcoes: [
      { chave: "titulo", tipo: "texto", rotulo: "Título do cartão", padrao: "Carteira de filiado(a)", max: 60 },
      {
        chave: "mostrar_fontes",
        tipo: "booleano",
        rotulo: "Mostrar o vínculo (fonte pagadora)",
        ajuda: "No cartão e na declaração.",
        padrao: true,
      },
      { chave: "declaracao_pdf", tipo: "booleano", rotulo: "Oferecer a declaração de filiação em PDF", padrao: true },
    ],
  },
  {
    chave: "contribuicao",
    titulo: "Contribuição",
    grupo: "Eu",
    descricao: "Situação da mensalidade, histórico, cobranças Pix e extrato anual.",
    rotas: ["/portal/contribuicao"],
    podeSuspender: true,
    podeDesabilitar: true,
    efeitoSuspensa: "A página mostra o aviso e o extrato em PDF fica bloqueado. O QR das cobranças Pix continua, para pagar.",
    efeitoDesabilitada:
      "Sai do menu, da barra e do Início (Minha situação). As cobranças Pix continuam sendo geradas, mas o associado deixa de ver o QR no portal.",
    observacao: "Quem paga por Pix só vê o QR aqui: com cobrança Pix em uso, prefira suspender.",
    configuradoEm: [
      { rotulo: "Cobranças Pix (valor, vencimento, mensagem)", href: "/painel/filiados/cobrancas" },
      { rotulo: "Regra de inadimplência", href: "/painel/filiados/direitos" },
    ],
    opcoes: [
      { chave: "extrato_pdf", tipo: "booleano", rotulo: "Oferecer o extrato anual em PDF", padrao: true },
      {
        chave: "texto_atraso",
        tipo: "texto",
        rotulo: "O que acontece com quem está em atraso",
        ajuda: "Aparece em Contribuição e no Início quando a situação é \"Em atraso\".",
        padrao:
          "Nada é suspenso automaticamente: a secretaria analisa cada caso e pode limitar serviços enquanto o atraso constar.",
        max: 400,
        linhas: 3,
      },
      {
        chave: "prazo_pix_dias_uteis",
        tipo: "numero",
        rotulo: "Prazo para reconhecer o pagamento Pix",
        padrao: 2,
        min: 1,
        max: 10,
        unidade: "dias úteis",
      },
      {
        chave: "lembrete_pix_dias",
        tipo: "numero",
        rotulo: "Lembrete do Pix antes do vencimento",
        ajuda: "0 desliga o lembrete.",
        padrao: 3,
        min: 0,
        max: 15,
        unidade: "dias",
      },
    ],
  },
  {
    chave: "desfiliacao",
    titulo: "Minha filiação",
    grupo: "Eu",
    descricao: "Situação da filiação, desistência da filiação coletiva e como pedir a desfiliação.",
    rotas: ["/portal/desfiliacao"],
    podeSuspender: false,
    podeDesabilitar: false,
    observacao:
      "Não se desliga: a desfiliação é direito do associado e a desistência da coletiva tem prazo. O prazo se ajusta no processo da coletiva.",
    configuradoEm: [{ rotulo: "Filiação coletiva (prazo de desistência)", href: "/painel/representacao/filiacao-coletiva" }],
    opcoes: [
      {
        chave: "texto_orientacao",
        tipo: "texto",
        rotulo: "Como pedir a desfiliação",
        padrao:
          "A desfiliação é pedida à entidade pelo Atendimento: o pedido fica registrado, a entidade comunica a sua empresa para encerrar o desconto e você acompanha a resposta por aqui.",
        max: 600,
        linhas: 3,
      },
      {
        chave: "solicitacao_online",
        tipo: "booleano",
        rotulo: "Botão para pedir a desfiliação pelo Atendimento",
        ajuda: "Desligado, fica só o texto acima.",
        padrao: true,
      },
    ],
  },

  // ── Serviços ─────────────────────────────────────────────────────────────
  {
    chave: "hospedagem",
    titulo: "Hospedagem",
    grupo: "Serviços",
    descricao: "Cupons e reservas nos hotéis de convênio, lista de espera e avaliação da estadia.",
    rotas: ["/portal/hospedagem"],
    podeSuspender: true,
    podeDesabilitar: true,
    efeitoSuspensa:
      "Novos pedidos, lista de espera e ofertas de vaga ficam bloqueados. Cancelar o que já foi pedido continua (senão vira falta).",
    efeitoDesabilitada:
      "Sai do menu e do Início, e a fila de espera para de ofertar vagas. Reservas já confirmadas continuam valendo no hotel.",
    configuradoEm: [
      { rotulo: "Condições de uso, cotas e não comparecimento", href: "/painel/filiados/direitos" },
      { rotulo: "Hotéis", href: "/painel/hospedagem/hoteis" },
    ],
    opcoes: [
      {
        chave: "mostrar_pago",
        tipo: "booleano",
        rotulo: "Mostrar quanto o sindicato pagou",
        ajuda: "Coluna \"Pago pelo sindicato\" e o total dos últimos 12 meses.",
        padrao: true,
      },
      {
        chave: "manter_no_menu",
        tipo: "booleano",
        rotulo: "Manter no menu mesmo sem hotel com convênio vigente",
        ajuda: "Desligado (padrão), a Hospedagem some sozinha quando nenhum hotel aceita pedido.",
        padrao: false,
      },
    ],
  },
  {
    chave: "convenios",
    titulo: "Convênios",
    grupo: "Serviços",
    descricao: "Descontos e serviços negociados para o associado, com unidades e regulamentos.",
    rotas: ["/portal/convenios"],
    podeSuspender: true,
    podeDesabilitar: true,
    efeitoSuspensa: "A lista continua visível, com o aviso (ex.: convênios em renegociação).",
    efeitoDesabilitada: "Sai do menu e do Início, e convênio novo deixa de avisar os associados.",
    configuradoEm: [
      { rotulo: "Convênios", href: "/painel/filiados/convenios" },
      { rotulo: "Categorias", href: "/painel/filiados/convenios/categorias" },
    ],
    opcoes: [
      {
        chave: "texto_topo",
        tipo: "texto",
        rotulo: "Orientação no topo da página",
        padrao: "Descontos e serviços negociados pelo sindicato para você. Apresente sua carteira de associado no atendimento.",
        max: 300,
        linhas: 2,
      },
      {
        chave: "avisar_novo",
        tipo: "booleano",
        rotulo: "Avisar os associados quando um convênio passa a valer",
        padrao: true,
      },
    ],
  },
  {
    chave: "saude",
    titulo: "Saúde",
    grupo: "Serviços",
    descricao: "Agendamentos, histórico de atendimentos e CATs do associado.",
    rotas: ["/portal/saude"],
    podeSuspender: true,
    podeDesabilitar: true,
    efeitoSuspensa: "A página mostra o aviso e os pedidos ao serviço de saúde pelo Atendimento ficam bloqueados.",
    efeitoDesabilitada: "Sai do menu e do Início, e o assunto Saúde some do Atendimento.",
    configuradoEm: [
      { rotulo: "Agenda e atendimentos de saúde", href: "/painel/saude" },
      { rotulo: "Profissionais", href: "/painel/saude/profissionais" },
    ],
    opcoes: [
      { chave: "mostrar_agendamentos", tipo: "booleano", rotulo: "Mostrar os próximos agendamentos", padrao: true },
      { chave: "mostrar_cats", tipo: "booleano", rotulo: "Mostrar as CATs (acidentes de trabalho)", padrao: true },
    ],
  },

  // ── Participar ───────────────────────────────────────────────────────────
  {
    chave: "votacao",
    titulo: "Votação",
    grupo: "Participar",
    descricao: "Assembleias com voto online no portal, histórico e resultado.",
    rotas: ["/portal/votacao"],
    podeSuspender: true,
    podeDesabilitar: true,
    efeitoSuspensa: "O voto e o cadastro do e-mail de votação pelo portal ficam bloqueados; o histórico continua.",
    efeitoDesabilitada: "Sai do menu, do Início e dos avisos do portal.",
    observacao:
      "Vale só para o portal: o link pessoal de voto (/votar), a urna e o comprovante de cada assembleia continuam. Para pausar uma votação, use a própria assembleia.",
    configuradoEm: [{ rotulo: "Votações (assembleias, janelas e aptos)", href: "/painel/representacao/votacoes" }],
    opcoes: [
      { chave: "mostrar_resultado", tipo: "booleano", rotulo: "Mostrar o resultado apurado no histórico", padrao: true },
      {
        chave: "email_votacao",
        tipo: "booleano",
        rotulo: "Permitir cadastrar um e-mail de votação",
        ajuda: "Seção recolhida em Votação, para quem vota com outro e-mail.",
        padrao: true,
      },
      { chave: "lembrete_ultimo_dia", tipo: "booleano", rotulo: "Lembrete no último dia para votar", padrao: true },
    ],
  },
  {
    chave: "eventos",
    titulo: "Eventos",
    grupo: "Participar",
    descricao: "Inscrição em eventos, minhas inscrições, presença e calendário.",
    rotas: ["/portal/eventos"],
    podeSuspender: true,
    podeDesabilitar: true,
    efeitoSuspensa: "Novas inscrições e confirmações de presença ficam bloqueadas; as inscrições feitas continuam visíveis.",
    efeitoDesabilitada: "Sai do menu, do Início e dos avisos do portal. A página pública de cada evento continua.",
    configuradoEm: [
      { rotulo: "Eventos", href: "/painel/eventos" },
      { rotulo: "Foto e retenção (LGPD)", href: "/painel/eventos/configuracao" },
    ],
    opcoes: [
      {
        chave: "permitir_cancelar",
        tipo: "booleano",
        rotulo: "Permitir cancelar a inscrição pelo portal",
        padrao: true,
      },
      { chave: "lembrete_vespera", tipo: "booleano", rotulo: "Lembrete na véspera do evento", padrao: true },
    ],
  },
  {
    chave: "agenda",
    titulo: "Agenda de atividades",
    grupo: "Participar",
    descricao: "Compromissos da entidade marcados para o portal.",
    rotas: ["/portal/agenda", "/portal/eventos/agenda"],
    podeSuspender: false,
    podeDesabilitar: true,
    efeitoDesabilitada: "A agenda sai do Início e da página de Eventos.",
    configuradoEm: [{ rotulo: "Agenda (caixa \"No portal do filiado\")", href: "/painel/ferramentas/agenda" }],
    opcoes: [{ chave: "mostrar_no_inicio", tipo: "booleano", rotulo: "Mostrar a agenda no Início", padrao: true }],
  },
  {
    chave: "noticias",
    titulo: "Notícias",
    grupo: "Participar",
    descricao: "Notícias publicadas pela entidade.",
    rotas: ["/portal/noticias"],
    podeSuspender: false,
    podeDesabilitar: true,
    efeitoDesabilitada: "Sai do menu e do Início, e notícia publicada deixa de avisar no sino.",
    configuradoEm: [{ rotulo: "Notícias", href: "/painel/comunicacao/noticias" }],
    opcoes: [
      { chave: "avisar_no_sino", tipo: "booleano", rotulo: "Avisar no sino quando sai notícia", padrao: true },
      { chave: "permitir_compartilhar", tipo: "booleano", rotulo: "Botão de compartilhar a notícia", padrao: true },
    ],
  },

  // ── Falar com o sindicato ────────────────────────────────────────────────
  {
    chave: "atendimento",
    titulo: "Atendimento",
    grupo: "Falar com o sindicato",
    descricao: "Solicitações do associado à entidade, com anexos e conversa.",
    rotas: ["/portal/atendimento"],
    podeSuspender: true,
    podeDesabilitar: true,
    efeitoSuspensa: "Novas solicitações, respostas e reaberturas ficam bloqueadas; a conversa continua para leitura.",
    efeitoDesabilitada: "Sai do menu, da barra e do Início; os botões \"Avisar o sindicato\" das outras páginas somem.",
    observacao: "Atendimento e O sindicato não ficam desabilitados ao mesmo tempo: o associado precisa de um canal.",
    configuradoEm: [{ rotulo: "Atendimentos (respostas e prazos)", href: "/painel/filiados/atendimentos" }],
    opcoes: [
      {
        chave: "assuntos",
        tipo: "lista",
        rotulo: "Assuntos que o associado pode escolher",
        padrao: ASSUNTOS_ATENDIMENTO.map((a) => a.chave),
        itens: ASSUNTOS_ATENDIMENTO.map((a) => ({ valor: a.chave, rotulo: a.rotulo })),
        min: 1,
      },
      { chave: "permitir_anexo", tipo: "booleano", rotulo: "Permitir anexos", padrao: true },
      {
        chave: "prazo_reabrir_dias",
        tipo: "numero",
        rotulo: "Prazo para o associado reabrir uma solicitação concluída",
        ajuda: "0: não reabre pelo portal.",
        padrao: 15,
        min: 0,
        max: 90,
        unidade: "dias",
      },
    ],
  },
  {
    chave: "sindicato",
    titulo: "O sindicato",
    grupo: "Falar com o sindicato",
    descricao: "Canais oficiais, sedes e diretoria vigente.",
    rotas: ["/portal/sindicato"],
    podeSuspender: false,
    podeDesabilitar: true,
    efeitoDesabilitada: "Sai do menu e do Início.",
    configuradoEm: [
      { rotulo: "E-mail, site e sedes", href: "/painel/institucional/organizacao" },
      { rotulo: "Diretoria", href: "/painel/institucional/diretoria" },
    ],
    opcoes: [
      { chave: "mostrar_diretoria", tipo: "booleano", rotulo: "Mostrar a diretoria vigente", padrao: true },
      {
        chave: "destacar_base",
        tipo: "booleano",
        rotulo: "Destacar os diretores da base do associado",
        padrao: true,
      },
      {
        chave: "texto_canais",
        tipo: "texto",
        rotulo: "Horário e outros canais",
        ajuda: "Ex.: horário de atendimento, WhatsApp. Em branco, nada a mais.",
        padrao: "",
        max: 500,
        linhas: 3,
      },
    ],
  },
  {
    chave: "avisos",
    titulo: "Avisos",
    grupo: "Falar com o sindicato",
    descricao: "Sino, lista de avisos e as preferências de e-mail e celular do associado.",
    rotas: ["/portal/avisos"],
    podeSuspender: false,
    podeDesabilitar: false,
    observacao:
      "Não se desliga: as preferências de e-mail e celular precisam continuar ao alcance. Os avisos seguem as partes: parte desabilitada não manda aviso.",
    configuradoEm: [{ rotulo: "Comunicados (mala direta)", href: "/painel/comunicacao/mensagens" }],
    opcoes: [],
  },

  // ── Mais ─────────────────────────────────────────────────────────────────
  {
    chave: "oposicao",
    titulo: "Contribuição assistencial",
    grupo: "Mais",
    descricao: "Oposição à contribuição assistencial, comprovante e carta.",
    rotas: ["/portal/oposicao"],
    podeSuspender: false,
    podeDesabilitar: false,
    observacao:
      "Não se desliga: é direito do trabalhador, com prazo. Para pausar, use a situação e os prazos da própria campanha.",
    configuradoEm: [{ rotulo: "Campanhas de oposição", href: "/painel/representacao/oposicao" }],
    opcoes: [
      {
        chave: "mostrar_sempre",
        tipo: "booleano",
        rotulo: "Mostrar no menu para todos",
        ajuda: "Desligado (padrão), só aparece para quem tem campanha aberta ou histórico de oposição.",
        padrao: false,
      },
    ],
  },
  {
    chave: "lgpd",
    titulo: "Privacidade e dados",
    grupo: "Mais",
    descricao: "Termo de privacidade, cópia dos dados e preferências de comunicados.",
    rotas: ["/portal/lgpd"],
    podeSuspender: false,
    podeDesabilitar: false,
    observacao: "Não se desliga: é o canal dos direitos do titular (LGPD).",
    configuradoEm: [
      { rotulo: "Termos legais", href: "/painel/filiados/termos" },
      { rotulo: "E-mail de contato da entidade", href: "/painel/institucional/organizacao" },
    ],
    opcoes: [
      {
        chave: "encarregado_nome",
        tipo: "texto",
        rotulo: "Encarregado pelo tratamento de dados (nome)",
        ajuda: "Em branco, a página mostra só o e-mail de contato da entidade.",
        padrao: "",
        max: 120,
      },
      {
        chave: "encarregado_email",
        tipo: "texto",
        rotulo: "E-mail do encarregado",
        padrao: "",
        max: 160,
      },
    ],
  },
  {
    chave: "ajuda",
    titulo: "Ajuda",
    grupo: "Mais",
    descricao: "Artigos de ajuda do portal.",
    rotas: ["/portal/ajuda"],
    podeSuspender: false,
    podeDesabilitar: false,
    observacao: "Sempre ligada. Os artigos das partes desabilitadas saem do índice e da busca.",
    configuradoEm: [],
    opcoes: [],
  },
] as const satisfies readonly DefinicaoParte[]

type Partes = (typeof PARTES_PORTAL)[number]
export type ChaveParte = Partes["chave"]
export type DefinicaoDe<K extends ChaveParte> = Extract<Partes, { chave: K }>

type ValorOpcao<O> = O extends { tipo: "booleano" }
  ? boolean
  : O extends { tipo: "numero" }
    ? number
    : O extends { tipo: "lista" }
      ? string[]
      : string

/** As opções de uma parte, já com o tipo de cada uma. */
export type OpcoesDe<K extends ChaveParte> = {
  [O in DefinicaoDe<K>["opcoes"][number] as O["chave"]]: ValorOpcao<O>
}

export const CHAVES_PARTES = PARTES_PORTAL.map((p) => p.chave) as ChaveParte[]

export function definicaoDaParte<K extends ChaveParte>(chave: K): DefinicaoDe<K> {
  return PARTES_PORTAL.find((p) => p.chave === chave) as DefinicaoDe<K>
}

export function ehChaveParte(v: unknown): v is ChaveParte {
  return typeof v === "string" && (CHAVES_PARTES as string[]).includes(v)
}

/** Estados que a gestão pode escolher para a parte (habilitada sempre). */
export function estadosPermitidos(def: DefinicaoParte): EstadoParte[] {
  return ESTADOS_PARTE.filter(
    (e) => e === "habilitada" || (e === "suspensa" && def.podeSuspender) || (e === "desabilitada" && def.podeDesabilitar)
  )
}

/**
 * Opções gravadas → opções válidas. Valor ausente, de outro tipo ou fora dos
 * limites vira o padrão; lista guarda só os itens conhecidos, sem repetir.
 */
export function normalizarOpcoes<K extends ChaveParte>(chave: K, bruto: unknown): OpcoesDe<K> {
  const def: DefinicaoParte = definicaoDaParte(chave)
  const obj = bruto && typeof bruto === "object" && !Array.isArray(bruto) ? (bruto as Record<string, unknown>) : {}
  const saida: Record<string, unknown> = {}
  for (const o of def.opcoes) {
    const v = obj[o.chave]
    switch (o.tipo) {
      case "booleano":
        saida[o.chave] = typeof v === "boolean" ? v : o.padrao
        break
      case "texto":
        saida[o.chave] = typeof v === "string" ? v.trim().slice(0, o.max) : o.padrao
        break
      case "numero": {
        const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN
        saida[o.chave] = Number.isInteger(n) && n >= o.min && n <= o.max ? n : o.padrao
        break
      }
      case "lista": {
        if (!Array.isArray(v)) {
          saida[o.chave] = [...o.padrao]
          break
        }
        const validos = o.itens.map((i) => i.valor)
        const lista = [...new Set(v.filter((x): x is string => typeof x === "string" && validos.includes(x)))]
        const cabe = lista.length >= (o.min ?? 0) && (o.max === undefined || lista.length <= o.max)
        saida[o.chave] = cabe ? lista : [...o.padrao]
        break
      }
    }
  }
  return saida as OpcoesDe<K>
}

/** As opções padrão (o comportamento de antes) de uma parte. */
export function opcoesPadrao<K extends ChaveParte>(chave: K): OpcoesDe<K> {
  return normalizarOpcoes(chave, {})
}

/**
 * A que parte um link do portal pertence ("/portal/eventos#inscricao-x" →
 * eventos; "/portal/eventos/agenda/1/calendario" → agenda). Prefixo mais
 * longo; null para o que não é de nenhuma parte (/portal, links de fora).
 */
export function parteDoLink(link: string | null | undefined): ChaveParte | null {
  if (!link) return null
  const caminho = link.split(/[?#]/)[0]
  let melhor: { chave: ChaveParte; tamanho: number } | null = null
  for (const p of PARTES_PORTAL) {
    for (const rota of p.rotas as readonly string[]) {
      if ((caminho === rota || caminho.startsWith(`${rota}/`)) && (!melhor || rota.length > melhor.tamanho)) {
        melhor = { chave: p.chave, tamanho: rota.length }
      }
    }
  }
  return melhor?.chave ?? null
}

/** Rota do menu da parte (a primeira), ou null para a parte "portal". */
export function rotaDoMenu(chave: ChaveParte): string | null {
  const rotas = definicaoDaParte(chave).rotas as readonly string[]
  return rotas[0] ?? null
}

/** Hoje em São Paulo, AAAA-MM-DD (sem depender do servidor). */
function hojeEmSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())
}

/**
 * O estado que vale hoje: com retorno previsto já alcançado, a parte volta
 * sozinha (a linha fica gravada como estava, para o painel mostrar).
 */
export function estadoEfetivo(estado: EstadoParte, retornoPrevisto: string | null, hoje = hojeEmSaoPaulo()): EstadoParte {
  if (estado !== "habilitada" && retornoPrevisto && retornoPrevisto <= hoje) return "habilitada"
  return estado
}

function dataBR(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

/**
 * O texto que o associado lê (na faixa, na página "indisponível" e na recusa
 * das ações): a mensagem da gestão ou a frase padrão, e a volta prevista.
 */
export function mensagemDaSituacao(
  chave: ChaveParte,
  situacao: { estado: EstadoParte; mensagem: string | null; retornoPrevisto: string | null }
): string {
  if (situacao.estado === "habilitada") return ""
  const padrao =
    chave === "portal"
      ? situacao.estado === "suspensa"
        ? "O portal está em modo de consulta: dá para ver tudo, mas nada pode ser enviado agora."
        : "O portal do associado está fora do ar no momento."
      : situacao.estado === "suspensa"
        ? "Esta parte do portal está suspensa no momento."
        : "Esta parte do portal não está disponível."
  const texto = situacao.mensagem?.trim() || padrao
  const volta = situacao.retornoPrevisto ? ` Previsão de retorno: ${dataBR(situacao.retornoPrevisto)}.` : ""
  return `${texto}${volta}`
}
