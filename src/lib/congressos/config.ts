/**
 * Congressos — catálogo de ajustes da configuração.
 *
 * Cada congresso guarda um mapa plano `chave → valor` (mais a origem de cada
 * valor). O catálogo abaixo é a única fonte de verdade: tipos, opções, padrão,
 * texto de ajuda e quando o ajuste aparece. A tela de configuração, a
 * normalização ao gravar, os modelos e a conferência de consistência leem
 * daqui. Desenho em docs/plano-congressos-configuracao.md.
 *
 * Sem "server-only": as regras são puras e testadas em tests/unidade.
 */

export type ValorAjuste = string | number | boolean | null

export type OrigemAjuste = "padrao" | "modelo" | "copia" | "comissao" | "regimento"

export const ROTULO_ORIGEM: Record<OrigemAjuste, string> = {
  padrao: "Padrão",
  modelo: "Modelo",
  copia: "Edição anterior",
  comissao: "Comissão",
  regimento: "Regimento",
}

export type ConfigCongresso = {
  valores: Record<string, ValorAjuste>
  origem: Record<string, OrigemAjuste>
  /** Artigo do regimento de onde o valor veio, quando houver. */
  artigos: Record<string, string>
  modelo: string | null
}

type Opcao = { valor: string; rotulo: string }

type Condicao = { chave: string; igual?: ValorAjuste | ValorAjuste[]; diferente?: ValorAjuste }

export type Ajuste = {
  chave: string
  secao: SecaoId
  rotulo: string
  ajuda?: string
  tipo: "escolha" | "numero" | "booleano" | "texto" | "datahora"
  opcoes?: Opcao[]
  padrao: ValorAjuste
  min?: number
  max?: number
  /** Sufixo exibido ao lado do número (%, min, s…). */
  unidade?: string
  /** Só aparece quando todas as condições valem. */
  visivelSe?: Condicao[]
}

export type SecaoId =
  | "identidade"
  | "regimento"
  | "delegacao"
  | "cotas"
  | "elegibilidade"
  | "inscricao"
  | "credenciamento"
  | "presenca"
  | "programa"
  | "propostas"
  | "plenaria"
  | "mocoes"
  | "local"
  | "divulgacao"
  | "encerramento"

export type Secao = {
  id: SecaoId
  titulo: string
  descricao: string
  /** O sistema já aplica as regras da seção (true) ou só as registra (false). */
  aplicada: boolean
}

export const SECOES: Secao[] = [
  { id: "identidade", titulo: "Identidade", descricao: "Natureza e abrangência do evento.", aplicada: true },
  { id: "regimento", titulo: "Regimento", descricao: "Aprovação, trava e casos omissos.", aplicada: true },
  { id: "delegacao", titulo: "Delegação", descricao: "Como se define quem é delegado e quantas vagas cada base tem.", aplicada: true },
  { id: "cotas", titulo: "Cotas e paridade", descricao: "Mínimos por gênero conferidos na delegação.", aplicada: true },
  { id: "elegibilidade", titulo: "Quem pode participar", descricao: "Exigências de filiação, de entidade e de taxa.", aplicada: true },
  { id: "inscricao", titulo: "Inscrição", descricao: "Prazo, aprovação e dados pedidos.", aplicada: true },
  { id: "programa", titulo: "Programa e grupos", descricao: "Grupos de trabalho e como se entra neles.", aplicada: true },
  { id: "credenciamento", titulo: "Credenciamento", descricao: "Prazos, suplentes e crachá.", aplicada: false },
  { id: "presenca", titulo: "Presença e quórum", descricao: "Registro por sessão e quórum.", aplicada: false },
  { id: "local", titulo: "Local da decisão", descricao: "O que pode ser feito a distância e como se prova a presença.", aplicada: false },
  { id: "propostas", titulo: "Propostas", descricao: "De onde vêm, limites por grupo e trava do relatório.", aplicada: false },
  { id: "plenaria", titulo: "Plenária", descricao: "Rito de fala, maioria e forma de votar.", aplicada: false },
  { id: "mocoes", titulo: "Moções", descricao: "Como uma moção chega à plenária.", aplicada: false },
  { id: "divulgacao", titulo: "Divulgação", descricao: "O que é público e o que é reservado.", aplicada: false },
  { id: "encerramento", titulo: "Encerramento", descricao: "Certificados, relatório e resoluções.", aplicada: false },
]


export const AJUSTES: Ajuste[] = [
  // ── Identidade ──
  {
    chave: "identidade.natureza", secao: "identidade", rotulo: "Natureza", tipo: "escolha", padrao: "congresso",
    opcoes: [
      { valor: "congresso", rotulo: "Congresso" },
      { valor: "plenaria", rotulo: "Plenária" },
      { valor: "conferencia", rotulo: "Conferência" },
      { valor: "encontro", rotulo: "Encontro" },
      { valor: "seminario", rotulo: "Seminário deliberativo" },
    ],
  },
  {
    chave: "identidade.abrangencia", secao: "identidade", rotulo: "Abrangência", tipo: "escolha", padrao: "regional",
    opcoes: [
      { valor: "local", rotulo: "Local" },
      { valor: "municipal", rotulo: "Municipal" },
      { valor: "regional", rotulo: "Regional" },
      { valor: "estadual", rotulo: "Estadual" },
      { valor: "nacional", rotulo: "Nacional" },
      { valor: "internacional", rotulo: "Internacional" },
    ],
  },
  {
    chave: "identidade.formato", secao: "identidade", rotulo: "Formato", tipo: "escolha", padrao: "presencial",
    opcoes: [
      { valor: "presencial", rotulo: "Presencial" },
      { valor: "virtual", rotulo: "Virtual" },
      { valor: "hibrido", rotulo: "Híbrido" },
    ],
  },

  // ── Regimento ──
  {
    chave: "regimento.aprovacao", secao: "regimento", rotulo: "Quem aprova o regimento", tipo: "escolha", padrao: "plenaria",
    opcoes: [
      { valor: "plenaria", rotulo: "A plenária, na abertura" },
      { valor: "orgao_externo", rotulo: "Outro órgão, antes do evento" },
    ],
  },
  {
    chave: "regimento.trava", secao: "regimento", rotulo: "Depois de aprovado", tipo: "escolha", padrao: "trava",
    ajuda: "Com a trava, mudar a configuração exige registrar a deliberação que autorizou.",
    opcoes: [
      { valor: "trava", rotulo: "Só muda com deliberação registrada" },
      { valor: "livre", rotulo: "A comissão pode ajustar" },
    ],
  },
  {
    chave: "regimento.maioria_alteracao", secao: "regimento", rotulo: "Maioria para alterar o regimento", tipo: "escolha", padrao: "simples",
    opcoes: [
      { valor: "simples", rotulo: "Simples" },
      { valor: "absoluta", rotulo: "Absoluta" },
      { valor: "dois_tercos", rotulo: "2/3" },
    ],
  },
  {
    chave: "regimento.assinatura_eletronica", secao: "regimento", rotulo: "Regimento aceita assinatura eletrônica", tipo: "booleano", padrao: true,
    ajuda: "Necessário para a assinatura digital de moções valer (MP 2.200-2, art. 10, §2º).",
  },
  {
    chave: "regimento.casos_omissos", secao: "regimento", rotulo: "Casos omissos", tipo: "escolha", padrao: "mesa_plenaria",
    opcoes: [
      { valor: "mesa_plenaria", rotulo: "Mesa, com recurso à plenária" },
      { valor: "comissao_plenaria", rotulo: "Comissão organizadora, com recurso à plenária" },
      { valor: "comissao_direcao", rotulo: "Comissão, depois a direção, depois a plenária" },
      { valor: "mesa", rotulo: "Mesa, sem recurso" },
    ],
  },

  // ── Delegação ──
  {
    chave: "delegacao.forma", secao: "delegacao", rotulo: "Como se define quem é delegado", tipo: "escolha", padrao: "ordem_inscricao",
    opcoes: [
      { valor: "ordem_inscricao", rotulo: "Por ordem de inscrição, até o limite da base" },
      { valor: "indicacao", rotulo: "Indicado pela entidade ou base" },
      { valor: "eleicao_base", rotulo: "Eleito em assembleia de base" },
      { valor: "inscricao_livre", rotulo: "Todo inscrito é delegado" },
    ],
  },
  {
    chave: "delegacao.calculo_vagas", secao: "delegacao", rotulo: "Vagas por base", tipo: "escolha", padrao: "fixo",
    opcoes: [
      { valor: "sem_limite", rotulo: "Sem limite" },
      { valor: "fixo", rotulo: "Número definido em cada base" },
      { valor: "coeficiente", rotulo: "Calculadas pelo número de sócios" },
    ],
    visivelSe: [{ chave: "delegacao.forma", diferente: "inscricao_livre" }],
  },
  {
    chave: "delegacao.coef_minimo", secao: "delegacao", rotulo: "Delegados mínimos por base", tipo: "numero", padrao: 0, min: 0,
    ajuda: "Parte fixa do cálculo. Ex.: FUP, 16 + 1 a cada 360.",
    visivelSe: [{ chave: "delegacao.calculo_vagas", igual: "coeficiente" }],
  },
  {
    chave: "delegacao.coef_a_cada", secao: "delegacao", rotulo: "Mais 1 delegado a cada", tipo: "numero", padrao: 1000, min: 1, unidade: "sócios",
    visivelSe: [{ chave: "delegacao.calculo_vagas", igual: "coeficiente" }],
  },
  {
    chave: "delegacao.coef_fracao", secao: "delegacao", rotulo: "Fração que sobra", tipo: "escolha", padrao: "despreza",
    opcoes: [
      { valor: "despreza", rotulo: "Despreza" },
      { valor: "metade_mais_um", rotulo: "Conta 1 se passar da metade" },
      { valor: "arredonda_cima", rotulo: "Sempre conta 1" },
    ],
    visivelSe: [{ chave: "delegacao.calculo_vagas", igual: "coeficiente" }],
  },
  {
    chave: "delegacao.lista_espera", secao: "delegacao", rotulo: "Quem passa do limite", tipo: "escolha", padrao: "lista_espera",
    opcoes: [
      { valor: "lista_espera", rotulo: "Vai para a lista de espera, na ordem" },
      { valor: "recusa", rotulo: "Inscrição recusada" },
      { valor: "comissao", rotulo: "A comissão decide" },
    ],
    visivelSe: [{ chave: "delegacao.forma", igual: "ordem_inscricao" }],
  },
  {
    chave: "delegacao.natos", secao: "delegacao", rotulo: "Delegados natos", tipo: "escolha", padrao: "nenhum",
    opcoes: [
      { valor: "nenhum", rotulo: "Não há" },
      { valor: "diretoria", rotulo: "Diretoria em exercício" },
      { valor: "lista", rotulo: "Lista definida pela comissão" },
    ],
  },
  {
    chave: "delegacao.natos_ocupam_vaga", secao: "delegacao", rotulo: "Nato ocupa vaga da base", tipo: "booleano", padrao: false,
    visivelSe: [{ chave: "delegacao.natos", diferente: "nenhum" }],
  },
  {
    chave: "delegacao.suplentes_por_titular", secao: "delegacao", rotulo: "Suplentes por titular", tipo: "numero", padrao: 1, min: 0, max: 10,
  },
  {
    chave: "delegacao.documento_indicacao", secao: "delegacao", rotulo: "Indicação exige", tipo: "escolha", padrao: "nada",
    opcoes: [
      { valor: "nada", rotulo: "Nada" },
      { valor: "ficha_assinada", rotulo: "Ficha assinada pelo representante legal" },
      { valor: "ata", rotulo: "Ata da eleição" },
    ],
    visivelSe: [{ chave: "delegacao.forma", igual: ["indicacao", "eleicao_base"] }],
  },
  {
    chave: "delegacao.observadores", secao: "delegacao", rotulo: "Vagas de observador", tipo: "escolha", padrao: "livre",
    opcoes: [
      { valor: "livre", rotulo: "Livre" },
      { valor: "percentual", rotulo: "Percentual da delegação de cada base" },
      { valor: "nao_ha", rotulo: "Não há observadores" },
    ],
  },
  {
    chave: "delegacao.observadores_percentual", secao: "delegacao", rotulo: "Observadores por base", tipo: "numero", padrao: 10, min: 0, max: 100, unidade: "% da delegação",
    visivelSe: [{ chave: "delegacao.observadores", igual: "percentual" }],
  },
  {
    chave: "delegacao.dupla_representacao", secao: "delegacao", rotulo: "Mesma pessoa por mais de uma base", tipo: "booleano", padrao: false,
  },

  // ── Cotas ──
  {
    chave: "cotas.genero_minimo", secao: "cotas", rotulo: "Mínimo de cada gênero na delegação", tipo: "numero", padrao: 0, min: 0, max: 50, unidade: "%",
    ajuda: "0 desliga. Ex.: CUT, 30%.",
  },
  {
    chave: "cotas.arredondamento", secao: "cotas", rotulo: "Arredondamento do mínimo", tipo: "escolha", padrao: "cima",
    opcoes: [
      { valor: "cima", rotulo: "Para cima" },
      { valor: "baixo", rotulo: "Para baixo" },
      { valor: "proximo", rotulo: "Para o mais próximo" },
    ],
    visivelSe: [{ chave: "cotas.genero_minimo", diferente: 0 }],
  },
  {
    chave: "cotas.onde", secao: "cotas", rotulo: "Onde vale", tipo: "escolha", padrao: "por_base",
    opcoes: [
      { valor: "por_base", rotulo: "Em cada base" },
      { valor: "total", rotulo: "Na delegação inteira" },
    ],
    visivelSe: [{ chave: "cotas.genero_minimo", diferente: 0 }],
  },
  {
    chave: "cotas.efeito", secao: "cotas", rotulo: "Se não cumprir", tipo: "escolha", padrao: "alerta",
    opcoes: [
      { valor: "alerta", rotulo: "Avisa a comissão" },
      { valor: "bloqueia", rotulo: "Bloqueia a confirmação" },
    ],
    visivelSe: [{ chave: "cotas.genero_minimo", diferente: 0 }],
  },

  // ── Elegibilidade ──
  {
    chave: "elegibilidade.filiacao", secao: "elegibilidade", rotulo: "Filiação exigida do delegado", tipo: "escolha", padrao: "em_dia",
    opcoes: [
      { valor: "nao", rotulo: "Não exige" },
      { valor: "filiado", rotulo: "Ser filiado" },
      { valor: "em_dia", rotulo: "Ser filiado em dia" },
    ],
  },
  {
    chave: "elegibilidade.efeito", secao: "elegibilidade", rotulo: "Se a conferência falhar", tipo: "escolha", padrao: "alerta",
    ajuda: "Há exceções previstas em regimentos (ex.: demitido sub judice).",
    opcoes: [
      { valor: "alerta", rotulo: "Avisa e a comissão decide" },
      { valor: "bloqueia", rotulo: "Bloqueia" },
    ],
  },
  {
    chave: "elegibilidade.taxa", secao: "elegibilidade", rotulo: "Taxa de inscrição", tipo: "escolha", padrao: "nenhuma",
    opcoes: [
      { valor: "nenhuma", rotulo: "Nenhuma" },
      { valor: "pessoa", rotulo: "Por pessoa" },
      { valor: "rateio", rotulo: "Rateio por entidade" },
    ],
  },
  {
    chave: "elegibilidade.despesas", secao: "elegibilidade", rotulo: "Quem paga as despesas", tipo: "escolha", padrao: "promotora",
    opcoes: [
      { valor: "promotora", rotulo: "A entidade que promove" },
      { valor: "cada_entidade", rotulo: "Cada entidade paga a sua delegação" },
      { valor: "rateio", rotulo: "Rateio entre as entidades" },
    ],
  },

  // ── Inscrição ──
  { chave: "inscricao.abre", secao: "inscricao", rotulo: "Inscrições abrem", tipo: "datahora", padrao: null },
  { chave: "inscricao.fecha", secao: "inscricao", rotulo: "Inscrições fecham", tipo: "datahora", padrao: null },
  {
    chave: "inscricao.aprovacao", secao: "inscricao", rotulo: "Aprovação da inscrição", tipo: "escolha", padrao: "automatica",
    opcoes: [
      { valor: "automatica", rotulo: "Automática, pelas regras" },
      { valor: "comissao", rotulo: "A comissão confirma cada uma" },
    ],
  },
  { chave: "inscricao.pede_acessibilidade", secao: "inscricao", rotulo: "Pergunta sobre acessibilidade", tipo: "booleano", padrao: true },
  { chave: "inscricao.pede_nome_social", secao: "inscricao", rotulo: "Pergunta o nome social", tipo: "booleano", padrao: true },
  { chave: "inscricao.pede_genero", secao: "inscricao", rotulo: "Pergunta o gênero", tipo: "booleano", padrao: false, ajuda: "Ligue quando houver cota." },
  { chave: "inscricao.pede_criancas", secao: "inscricao", rotulo: "Pergunta sobre crianças (creche)", tipo: "booleano", padrao: false },
  { chave: "inscricao.pede_hospedagem", secao: "inscricao", rotulo: "Pergunta sobre hospedagem", tipo: "booleano", padrao: false },

  // ── Programa ──
  { chave: "programa.tem_grupos", secao: "programa", rotulo: "Há grupos de trabalho", tipo: "booleano", padrao: true },
  {
    chave: "programa.entrada_grupo", secao: "programa", rotulo: "Como se entra no grupo", tipo: "escolha", padrao: "escolha",
    opcoes: [
      { valor: "escolha", rotulo: "A pessoa escolhe, respeitando as vagas" },
      { valor: "indicacao", rotulo: "A comissão indica" },
      { valor: "presenca", rotulo: "Sem inscrição: a presença define" },
    ],
    visivelSe: [{ chave: "programa.tem_grupos", igual: true }],
  },
  {
    chave: "programa.varios_grupos", secao: "programa", rotulo: "Pode participar de mais de um grupo", tipo: "booleano", padrao: false,
    visivelSe: [{ chave: "programa.tem_grupos", igual: true }],
  },
  {
    chave: "programa.funcoes_grupo", secao: "programa", rotulo: "Coordenação e relatoria do grupo", tipo: "escolha", padrao: "eleitas",
    opcoes: [
      { valor: "eleitas", rotulo: "Eleitas no grupo" },
      { valor: "indicadas", rotulo: "Indicadas pela comissão" },
    ],
    visivelSe: [{ chave: "programa.tem_grupos", igual: true }],
  },

  // ── Credenciamento (registrado; aplicado na Fase 2) ──
  { chave: "credenciamento.titular_ate", secao: "credenciamento", rotulo: "Titulares se credenciam até", tipo: "datahora", padrao: null },
  { chave: "credenciamento.suplente_ate", secao: "credenciamento", rotulo: "Suplentes se credenciam até", tipo: "datahora", padrao: null },
  {
    chave: "credenciamento.apos_prazo", secao: "credenciamento", rotulo: "Depois do prazo", tipo: "escolha", padrao: "bloqueia",
    opcoes: [
      { valor: "bloqueia", rotulo: "Sem exceção" },
      { valor: "justificativa", rotulo: "Permite com justificativa" },
    ],
  },
  {
    chave: "credenciamento.suplente_assume", secao: "credenciamento", rotulo: "Suplente assume", tipo: "escolha", padrao: "titular_ausente",
    opcoes: [
      { valor: "titular_ausente", rotulo: "No lugar de titular ausente" },
      { valor: "ordem", rotulo: "Na ordem da lista da base" },
      { valor: "livre", rotulo: "Livremente" },
    ],
  },
  {
    chave: "credenciamento.autoriza_troca", secao: "credenciamento", rotulo: "Quem autoriza a troca", tipo: "escolha", padrao: "coordenacao_base",
    opcoes: [
      { valor: "ninguem", rotulo: "Não precisa" },
      { valor: "coordenacao_base", rotulo: "Coordenação da base ou delegação" },
      { valor: "comissao", rotulo: "Comissão organizadora" },
    ],
  },
  { chave: "credenciamento.documento_foto", secao: "credenciamento", rotulo: "Exige documento com foto", tipo: "booleano", padrao: true },
  {
    chave: "credenciamento.segunda_via", secao: "credenciamento", rotulo: "Segunda via do crachá", tipo: "escolha", padrao: "invalida_anterior",
    opcoes: [
      { valor: "invalida_anterior", rotulo: "Permitida, invalidando a anterior" },
      { valor: "proibida", rotulo: "Proibida" },
    ],
  },

  // ── Presença ──
  { chave: "presenca.por_sessao", secao: "presenca", rotulo: "Registrar presença por sessão", tipo: "booleano", padrao: true },
  { chave: "presenca.saida", secao: "presenca", rotulo: "Registrar saída", tipo: "booleano", padrao: false },
  { chave: "presenca.quorum_instalacao", secao: "presenca", rotulo: "Quórum de instalação", tipo: "numero", padrao: 0, min: 0, max: 100, unidade: "% dos credenciados", ajuda: "0 = não há." },
  { chave: "presenca.frequencia_certificado", secao: "presenca", rotulo: "Frequência mínima para certificado", tipo: "numero", padrao: 75, min: 0, max: 100, unidade: "%" },

  // ── Local da decisão ──
  {
    chave: "local.voto_plenaria", secao: "local", rotulo: "Voto em plenária", tipo: "escolha", padrao: "so_local",
    opcoes: [
      { valor: "so_local", rotulo: "Só no local" },
      { valor: "local_ou_distancia", rotulo: "No local ou a distância" },
      { valor: "distancia_autorizados", rotulo: "A distância só para autorizados" },
      { valor: "so_distancia", rotulo: "Só a distância" },
    ],
  },
  {
    chave: "local.assinatura_mocao", secao: "local", rotulo: "Assinatura de moção", tipo: "escolha", padrao: "so_local",
    opcoes: [
      { valor: "so_local", rotulo: "Só no local" },
      { valor: "local_ou_distancia", rotulo: "No local ou a distância" },
      { valor: "distancia_autorizados", rotulo: "A distância só para autorizados" },
      { valor: "so_distancia", rotulo: "Só a distância" },
    ],
  },
  {
    chave: "local.eleicao", secao: "local", rotulo: "Voto em eleição", tipo: "escolha", padrao: "so_local",
    opcoes: [
      { valor: "so_local", rotulo: "Só no local" },
      { valor: "local_ou_distancia", rotulo: "No local ou a distância" },
      { valor: "distancia_autorizados", rotulo: "A distância só para autorizados" },
      { valor: "so_distancia", rotulo: "Só a distância" },
    ],
  },
  {
    chave: "local.prova_voto", secao: "local", rotulo: "Prova de presença para votar", tipo: "escolha", padrao: "B",
    opcoes: [
      { valor: "A", rotulo: "A — credenciado no local" },
      { valor: "B", rotulo: "B — presente na sessão" },
      { valor: "C", rotulo: "C — código da sala" },
      { valor: "D", rotulo: "D — estação da mesa" },
      { valor: "E", rotulo: "E — meio físico (crachá, cédula)" },
    ],
  },
  {
    chave: "local.prova_assinatura", secao: "local", rotulo: "Prova de presença para assinar moção", tipo: "escolha", padrao: "C",
    opcoes: [
      { valor: "A", rotulo: "A — credenciado no local" },
      { valor: "B", rotulo: "B — presente na sessão" },
      { valor: "C", rotulo: "C — código da sala" },
      { valor: "D", rotulo: "D — estação da mesa" },
      { valor: "E", rotulo: "E — papel" },
    ],
  },
  { chave: "local.codigo_segundos", secao: "local", rotulo: "Validade do código da sala", tipo: "numero", padrao: 20, min: 10, max: 60, unidade: "s" },
  { chave: "local.distancia_quorum", secao: "local", rotulo: "Quem está a distância conta no quórum", tipo: "booleano", padrao: true },

  // ── Propostas ──
  {
    chave: "propostas.novas_grupo", secao: "propostas", rotulo: "Propostas novas no grupo", tipo: "escolha", padrao: "livres",
    opcoes: [
      { valor: "livres", rotulo: "Livres" },
      { valor: "limitadas", rotulo: "Até um número por grupo" },
      { valor: "proibidas", rotulo: "Proibidas" },
    ],
  },
  {
    chave: "propostas.novas_grupo_max", secao: "propostas", rotulo: "Máximo de propostas novas por grupo", tipo: "numero", padrao: 2, min: 1,
    visivelSe: [{ chave: "propostas.novas_grupo", igual: "limitadas" }],
  },
  { chave: "propostas.max_por_grupo", secao: "propostas", rotulo: "Máximo de propostas que o grupo entrega", tipo: "numero", padrao: 0, min: 0, ajuda: "0 = sem limite. Ex.: Resende, 20." },
  { chave: "propostas.max_por_eixo", secao: "propostas", rotulo: "Máximo por eixo", tipo: "numero", padrao: 0, min: 0, ajuda: "0 = sem limite." },
  {
    chave: "propostas.novas_plenaria", secao: "propostas", rotulo: "Propostas novas em plenária", tipo: "escolha", padrao: "acordo_texto",
    opcoes: [
      { valor: "proibidas", rotulo: "Só matéria dos grupos" },
      { valor: "acordo_texto", rotulo: "Só fusão de textos (acordo de texto)" },
      { valor: "assinaturas", rotulo: "Com assinaturas de delegados" },
    ],
  },
  { chave: "propostas.trava_relatorio", secao: "propostas", rotulo: "Relatório do grupo trava em", tipo: "datahora", padrao: null },

  // ── Plenária ──
  { chave: "plenaria.tempo_fala", secao: "plenaria", rotulo: "Tempo de fala", tipo: "numero", padrao: 3, min: 1, max: 30, unidade: "min" },
  { chave: "plenaria.oradores", secao: "plenaria", rotulo: "Inscrições encerram após", tipo: "numero", padrao: 3, min: 1, max: 20, unidade: "oradores" },
  {
    chave: "plenaria.maioria", secao: "plenaria", rotulo: "Maioria para aprovar", tipo: "escolha", padrao: "simples",
    opcoes: [
      { valor: "simples", rotulo: "Simples dos presentes votantes" },
      { valor: "absoluta", rotulo: "Absoluta dos credenciados" },
      { valor: "dois_tercos", rotulo: "2/3" },
    ],
  },
  { chave: "plenaria.sem_oposicao", secao: "plenaria", rotulo: "Aprova se ninguém se opuser", tipo: "booleano", padrao: true },
  { chave: "plenaria.em_bloco", secao: "plenaria", rotulo: "Votação em bloco do que é consenso", tipo: "booleano", padrao: true },
  { chave: "plenaria.destaque_nome", secao: "plenaria", rotulo: "Destaque registra quem pediu", tipo: "booleano", padrao: true },
  {
    chave: "plenaria.forma_voto", secao: "plenaria", rotulo: "Forma de votar", tipo: "escolha", padrao: "cracha",
    opcoes: [
      { valor: "cracha", rotulo: "Crachá erguido" },
      { valor: "contagem", rotulo: "Contagem individual" },
      { valor: "urna", rotulo: "Secreta, em urna" },
    ],
  },
  {
    chave: "plenaria.duvida", secao: "plenaria", rotulo: "Na dúvida da contagem", tipo: "escolha", padrao: "repete_conta",
    opcoes: [
      { valor: "repete_conta", rotulo: "Repete e, se persistir, conta" },
      { valor: "conta", rotulo: "Conta voto a voto" },
    ],
  },
  { chave: "plenaria.declaracao_voto_max", secao: "plenaria", rotulo: "Declarações de voto por votação", tipo: "numero", padrao: 2, min: 0, max: 20 },

  // ── Moções ──
  {
    chave: "mocoes.habilitacao", secao: "mocoes", rotulo: "Como a moção chega à plenária", tipo: "escolha", padrao: "assinaturas",
    opcoes: [
      { valor: "assinaturas", rotulo: "Por assinaturas" },
      { valor: "voto_grupo", rotulo: "Aprovada por maioria no grupo" },
      { valor: "comissao", rotulo: "Aceita pela comissão" },
    ],
  },
  {
    chave: "mocoes.minimo_numero", secao: "mocoes", rotulo: "Mínimo de assinaturas (número)", tipo: "numero", padrao: 0, min: 0,
    ajuda: "0 = não usa. Combina com o percentual: basta atingir um dos dois.",
    visivelSe: [{ chave: "mocoes.habilitacao", igual: "assinaturas" }],
  },
  {
    chave: "mocoes.minimo_percentual", secao: "mocoes", rotulo: "Mínimo de assinaturas (percentual)", tipo: "numero", padrao: 10, min: 0, max: 100, unidade: "%",
    visivelSe: [{ chave: "mocoes.habilitacao", igual: "assinaturas" }],
  },
  {
    chave: "mocoes.percentual_de", secao: "mocoes", rotulo: "Percentual calculado sobre", tipo: "escolha", padrao: "congresso",
    opcoes: [
      { valor: "congresso", rotulo: "Todos os delegados credenciados" },
      { valor: "base_origem", rotulo: "Delegados da base de origem" },
    ],
    visivelSe: [{ chave: "mocoes.habilitacao", igual: "assinaturas" }],
  },
  { chave: "mocoes.prazo", secao: "mocoes", rotulo: "Prazo de entrega", tipo: "datahora", padrao: null },
  {
    chave: "mocoes.nomes_visiveis", secao: "mocoes", rotulo: "Quem vê os nomes de quem assinou", tipo: "escolha", padrao: "credenciados",
    opcoes: [
      { valor: "comissao", rotulo: "Só a comissão" },
      { valor: "credenciados", rotulo: "Os credenciados" },
      { valor: "publico", rotulo: "O público" },
    ],
  },

  // ── Divulgação ──
  { chave: "divulgacao.resolucoes", secao: "divulgacao", rotulo: "Resoluções públicas", tipo: "booleano", padrao: true, ajuda: "Resoluções marcadas como reservadas ficam de fora." },
  { chave: "divulgacao.lista_delegados", secao: "divulgacao", rotulo: "Lista de delegados pública", tipo: "booleano", padrao: false },

  // ── Encerramento ──
  {
    chave: "encerramento.certificado", secao: "encerramento", rotulo: "Certificado", tipo: "escolha", padrao: "todos",
    opcoes: [
      { valor: "todos", rotulo: "Para todos, com a condição de participação" },
      { valor: "pedido", rotulo: "A pedido" },
      { valor: "nao", rotulo: "Não emite" },
    ],
  },
  { chave: "encerramento.relatorio_dias", secao: "encerramento", rotulo: "Prazo do relatório final", tipo: "numero", padrao: 60, min: 1, unidade: "dias" },
]


export const AJUSTE_POR_CHAVE: Map<string, Ajuste> = new Map(AJUSTES.map((a) => [a.chave, a]))

/** Valores padrão de todo o catálogo. */
export function valoresPadrao(): Record<string, ValorAjuste> {
  return Object.fromEntries(AJUSTES.map((a) => [a.chave, a.padrao]))
}

/** Converte e valida um valor bruto (do formulário ou do banco). Inválido → padrão. */
export function normalizarValor(a: Ajuste, bruto: unknown): ValorAjuste {
  if (bruto === undefined) return a.padrao
  switch (a.tipo) {
    case "booleano":
      if (typeof bruto === "boolean") return bruto
      if (bruto === "on" || bruto === "true" || bruto === "sim") return true
      if (bruto === "" || bruto === "false" || bruto === "nao" || bruto === null) return false
      return a.padrao
    case "numero": {
      if (bruto === null || bruto === "") return a.padrao
      const n = typeof bruto === "number" ? bruto : Number(String(bruto).replace(",", "."))
      if (!Number.isFinite(n)) return a.padrao
      let v = n
      if (a.min !== undefined) v = Math.max(a.min, v)
      if (a.max !== undefined) v = Math.min(a.max, v)
      return v
    }
    case "escolha": {
      const s = String(bruto ?? "")
      return a.opcoes?.some((o) => o.valor === s) ? s : a.padrao
    }
    case "datahora":
    case "texto": {
      if (bruto === null) return null
      const s = String(bruto).trim()
      return s === "" ? null : s
    }
  }
}

/** Configuração completa: todo o catálogo, com valor válido e origem. */
export function normalizarConfig(bruta: unknown): ConfigCongresso {
  const obj = (bruta && typeof bruta === "object" ? bruta : {}) as Record<string, unknown>
  const valoresBrutos = (obj.valores && typeof obj.valores === "object" ? obj.valores : {}) as Record<string, unknown>
  const origemBruta = (obj.origem && typeof obj.origem === "object" ? obj.origem : {}) as Record<string, unknown>
  const artigosBrutos = (obj.artigos && typeof obj.artigos === "object" ? obj.artigos : {}) as Record<string, unknown>
  const valores: Record<string, ValorAjuste> = {}
  const origem: Record<string, OrigemAjuste> = {}
  const artigos: Record<string, string> = {}
  for (const a of AJUSTES) {
    const tem = Object.prototype.hasOwnProperty.call(valoresBrutos, a.chave)
    valores[a.chave] = normalizarValor(a, tem ? valoresBrutos[a.chave] : undefined)
    const o = origemBruta[a.chave]
    origem[a.chave] =
      tem && typeof o === "string" && o in ROTULO_ORIGEM ? (o as OrigemAjuste) : tem ? "comissao" : "padrao"
    const art = artigosBrutos[a.chave]
    if (typeof art === "string" && art.trim()) artigos[a.chave] = art.trim()
  }
  return {
    valores,
    origem,
    artigos,
    modelo: typeof obj.modelo === "string" ? obj.modelo : null,
  }
}

/** Valor tipado de um ajuste (com padrão). */
export function valor<T extends ValorAjuste = ValorAjuste>(c: ConfigCongresso, chave: string): T {
  const v = c.valores[chave]
  if (v === undefined) return (AJUSTE_POR_CHAVE.get(chave)?.padrao ?? null) as T
  return v as T
}

export function ajusteVisivel(a: Ajuste, valores: Record<string, ValorAjuste>): boolean {
  return (a.visivelSe ?? []).every((c) => {
    const v = valores[c.chave] ?? AJUSTE_POR_CHAVE.get(c.chave)?.padrao ?? null
    if (c.igual !== undefined) {
      return Array.isArray(c.igual) ? c.igual.includes(v) : v === c.igual
    }
    if (c.diferente !== undefined) return v !== c.diferente
    return true
  })
}

/**
 * Aplica mudanças vindas da comissão. Só marca como "comissao" o que mudou de
 * fato; o restante mantém a origem (modelo, edição anterior, regimento).
 * Devolve também a lista de chaves alteradas, para o histórico.
 */
export function aplicarMudancas(
  atual: ConfigCongresso,
  brutos: Record<string, unknown>,
  artigos: Record<string, string> = {}
): { config: ConfigCongresso; alteradas: string[] } {
  const valores = { ...atual.valores }
  const origem = { ...atual.origem }
  const novosArtigos = { ...atual.artigos }
  const alteradas: string[] = []
  for (const [chave, bruto] of Object.entries(brutos)) {
    const a = AJUSTE_POR_CHAVE.get(chave)
    if (!a) continue
    const novo = normalizarValor(a, bruto)
    if (novo !== valores[chave]) {
      valores[chave] = novo
      origem[chave] = "comissao"
      alteradas.push(chave)
    }
  }
  for (const [chave, art] of Object.entries(artigos)) {
    if (!AJUSTE_POR_CHAVE.has(chave)) continue
    const limpo = art.trim()
    const antes = novosArtigos[chave] ?? ""
    if (limpo) novosArtigos[chave] = limpo
    else delete novosArtigos[chave]
    if (antes !== limpo && !alteradas.includes(chave)) alteradas.push(chave)
  }
  // Valor com artigo citado vem do regimento; sem artigo, quem decidiu foi a comissão.
  for (const chave of alteradas) {
    if (novosArtigos[chave]) origem[chave] = "regimento"
    else if (origem[chave] === "regimento") origem[chave] = "comissao"
  }
  return { config: { ...atual, valores, origem, artigos: novosArtigos }, alteradas }
}

/** Texto curto de um valor, para resumos e histórico. */
export function descreverValor(a: Ajuste, v: ValorAjuste): string {
  if (v === null || v === "") return "—"
  if (a.tipo === "booleano") return v ? "Sim" : "Não"
  if (a.tipo === "escolha") return a.opcoes?.find((o) => o.valor === v)?.rotulo ?? String(v)
  if (a.tipo === "numero") return a.unidade ? `${v} ${a.unidade}` : String(v)
  if (a.tipo === "datahora") {
    const d = new Date(String(v))
    if (Number.isNaN(d.getTime())) return String(v)
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      dateStyle: "short",
      timeStyle: "short",
    }).format(d)
  }
  return String(v)
}
