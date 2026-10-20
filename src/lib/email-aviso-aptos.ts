import { ROTULOS_MODALIDADE, type Modalidade } from "@/lib/assembleias-constantes"
import {
  botaoEmail,
  caixaAviso,
  COR,
  escaparHtml,
  linkReserva,
  paragrafo,
  textoSuave,
  tituloEmail,
} from "@/lib/email-layout"
import { formatarData } from "@/lib/formato"

/**
 * E-mail "você está habilitado a votar", enviado aos aptos de uma rodada.
 * Só monta o MIOLO — `enviarEmail` põe a moldura do Confluir. O como-votar
 * muda com a porta de entrada da pessoa: quem veio pelo e-mail corporativo
 * entra por ele (e confirma CPF, nome e nascimento no primeiro acesso); quem
 * foi achado pelo CPF de filiado entra pelo CPF ou pela área do filiado.
 */

export type AssembleiaDoAviso = {
  nome: string | null
  modalidade: Modalidade
  data_inicio: string | null
  data_termino: string | null
  /** Horas de abertura e encerramento (HH:MM), quando houver. */
  hora_inicio?: string | null
  hora_termino?: string | null
  /** Sala da assembleia virtual (link, data, hora HH:MM), quando houver. */
  sala_link?: string | null
  sala_data?: string | null
  sala_hora?: string | null
}

export type DadosAvisoAptos = {
  rodadaNome: string
  campanhaTema: string | null
  inicio: string | null
  termino: string | null
  assembleias: AssembleiaDoAviso[]
  /** Endereço do botão: a cédula online (/votar/…) ou a área do filiado. */
  link: string
  /** Assembleia online da rodada — base do link pessoal de cada eleitor. */
  assembleiaOnlineId: string | null
  /** Há assembleia com voto online (online ou híbrida)? */
  temOnline: boolean
  /** Há assembleia presencial (urna, híbrida ou reunião)? */
  temPresencial: boolean
}

export type DestinatarioAviso = {
  nome: string | null
  email: string
  /** "email" = entra pelo e-mail corporativo; "cpf" = filiado, entra pelo CPF. */
  porta: "email" | "cpf"
  /**
   * Link PESSOAL que abre a cédula direto, sem código (o código por e-mail
   * não chega em parte das caixas). Quando existe, é ele o botão.
   */
  linkPessoal?: string | null
  /** Endereço do "Não sou eu" — desativa o link e avisa o sindicato. */
  linkNaoSouEu?: string | null
}

const ESTILO_LISTA = `margin:0 0 20px;padding-left:22px;`
const ESTILO_ITEM = `margin:0 0 8px;`

function periodo(inicio: string | null, termino: string | null): string | null {
  if (inicio && termino && inicio.slice(0, 10) === termino.slice(0, 10)) {
    return `em <strong>${formatarData(inicio)}</strong>`
  }
  if (inicio && termino) return `de <strong>${formatarData(inicio)}</strong> a <strong>${formatarData(termino)}</strong>`
  if (termino) return `até <strong>${formatarData(termino)}</strong>`
  if (inicio) return `a partir de <strong>${formatarData(inicio)}</strong>`
  return null
}

function primeiroNome(nome: string | null): string | null {
  const p = (nome ?? "").trim().split(/\s+/)[0]
  if (!p) return null
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
}

const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"]

/** "quarta, 21/10/2026" — a data sozinha (YYYY-MM-DD), sem fuso. */
function diaPorExtenso(data: string): string {
  const [a, m, d] = data.slice(0, 10).split("-").map(Number)
  return `${DIAS_SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]}, ${formatarData(data)}`
}

/** "quarta, 21/10/2026 às 10:40" (hora opcional). */
function diaHora(data: string | null, hora: string | null | undefined): string | null {
  if (!data) return null
  return `${diaPorExtenso(data)}${hora ? ` às ${hora}` : ""}`
}

/** Linha "rótulo  valor" do quadro de horários. */
function linhaHorario(rotulo: string, valor: string): string {
  return `<tr>
<td style="padding:2px 12px 2px 0;font-size:13px;color:${COR.textoSuave};white-space:nowrap;vertical-align:top;">${rotulo}</td>
<td style="padding:2px 0;font-size:15px;font-weight:600;color:${COR.navy};">${valor}</td>
</tr>`
}

/**
 * Quadro da VOTAÇÃO: cada assembleia com abertura e encerramento (data e hora)
 * e o botão logo abaixo, dentro do mesmo quadro — o botão é da votação, não da
 * reunião por vídeo, que vem num quadro separado (e-mail de 21/10/2026).
 */
function quadroVotacao(assembleias: AssembleiaDoAviso[], botao: string): string {
  const linhas = assembleias
    .map((a, i) => {
      const abre = diaHora(a.data_inicio, a.hora_inicio)
      const fecha = diaHora(a.data_termino, a.hora_termino)
      const online = a.modalidade === "online"
      const mesmoDia = a.data_inicio && a.data_termino && a.data_inicio.slice(0, 10) === a.data_termino.slice(0, 10)
      const horarios =
        online || !mesmoDia
          ? [abre && linhaHorario(online ? "Abre" : "Início", abre), fecha && linhaHorario(online ? "Encerra" : "Fim", fecha)]
          : [
              abre &&
                linhaHorario(
                  "Quando",
                  `${diaPorExtenso(a.data_inicio as string)}${a.hora_inicio ? `, das ${a.hora_inicio}` : ""}${a.hora_termino ? ` às ${a.hora_termino}` : ""}`
                ),
            ]
      const tabela = horarios.filter(Boolean).join("")
      return `<tr><td style="padding:${i === 0 ? "4px" : "14px"} 0 0;${i === 0 ? "" : `border-top:1px solid ${COR.borda};`}">
<div style="font-weight:600;color:${COR.navy};">${escaparHtml(a.nome ?? "Assembleia")}</div>
<div style="font-size:13px;color:${COR.textoSuave};margin:0 0 8px;">${online ? "Voto pela internet" : ROTULOS_MODALIDADE[a.modalidade]}</div>
${tabela ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 4px;">${tabela}</table>` : ""}
</td></tr>`
    })
    .join("")
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;border:1px solid ${COR.laranja};border-radius:10px;border-collapse:separate;overflow:hidden;">
<tr><td style="padding:10px 16px;background-color:${COR.laranjaFundo};font-size:12px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;color:${COR.laranjaAcao};">🗳️&nbsp; Votação · horário de Brasília</td></tr>
<tr><td style="padding:12px 16px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${linhas}</table>
</td></tr>
<tr><td style="padding:8px 16px 0;">${botao}</td></tr>
</table>`
}

/**
 * Reunião por vídeo (a "assembleia virtual"): o link da sala com data e hora,
 * num quadro neutro e com o aviso de que ali não se vota. Não é ação
 * destrutiva — scanner de e-mail que abrir o link não muda nada.
 */
function salasVirtuais(assembleias: AssembleiaDoAviso[], temOnline: boolean): string {
  const comSala = assembleias.filter((a) => a.sala_link)
  if (comSala.length === 0) return ""
  const linhas = comSala
    .map((a) => {
      const quando = diaHora(a.sala_data ?? null, a.sala_hora)
      return `<tr><td style="padding:12px 16px;border-top:1px solid ${COR.navyBorda};">
${comSala.length > 1 ? `<div style="font-weight:600;color:${COR.navy};margin:0 0 4px;">${escaparHtml(a.nome ?? "Assembleia")}</div>` : ""}
${quando ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px;">${linhaHorario("Quando", quando)}</table>` : ""}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
<tr><td style="border:1px solid ${COR.navy};border-radius:8px;">
<a href="${escaparHtml(a.sala_link as string)}" target="_blank" style="display:inline-block;padding:9px 18px;font-size:14px;font-weight:600;line-height:18px;color:${COR.navy};text-decoration:none;">Entrar na sala da reunião</a>
</td></tr>
</table>
</td></tr>`
    })
    .join("")
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;background-color:${COR.navyFundo};border:1px solid ${COR.navyBorda};border-radius:10px;border-collapse:separate;overflow:hidden;">
<tr><td style="padding:10px 16px;font-size:12px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;color:${COR.navy};">🎥&nbsp; Reunião por vídeo</td></tr>
<tr><td style="padding:0 16px 10px;font-size:13px;line-height:1.5;color:${COR.texto};">Encontro online para apresentar e debater a proposta. Participar é opcional${
    temOnline ? " e <strong>não registra o seu voto</strong>: para votar, use o botão <strong>Ir para a votação</strong> acima." : "."
  }</td></tr>
${linhas}
</table>`
}

function passos(itens: string[]): string {
  return `<ol style="${ESTILO_LISTA}">${itens.map((i) => `<li style="${ESTILO_ITEM}">${i}</li>`).join("")}</ol>`
}

export function assuntoAvisoAptos(dados: Pick<DadosAvisoAptos, "rodadaNome">): string {
  return `Você está habilitado a votar — ${dados.rodadaNome}`
}

export function montarEmailAvisoAptos(
  dados: DadosAvisoAptos,
  destino: DestinatarioAviso
): string {
  const nome = primeiroNome(destino.nome)
  const quando = periodo(dados.inicio, dados.termino)
  const partes: string[] = []

  partes.push(tituloEmail("Você está habilitado a votar"))
  partes.push(paragrafo(nome ? `Olá, ${escaparHtml(nome)}.` : "Olá."))
  partes.push(
    paragrafo(
      `Seu nome está na lista de aptos a votar da <strong>${escaparHtml(dados.rodadaNome)}</strong>` +
        (dados.campanhaTema ? ` (${escaparHtml(dados.campanhaTema)})` : "") +
        `, promovida por {ENTIDADE}. Sua participação é importante: é o voto da categoria que decide.`
    )
  )
  const alvo = destino.linkPessoal ?? dados.link
  const botao = botaoEmail(alvo, dados.temOnline ? "Ir para a votação" : "Acessar o Confluir")
  const comDatas = dados.assembleias.some((a) => a.data_inicio || a.data_termino)
  // Sem data nas assembleias, vale o período da rodada (caixa de antes).
  if (quando && !comDatas) partes.push(caixaAviso(`A votação acontece ${quando}.`))
  if (dados.assembleias.length > 0) {
    partes.push(quadroVotacao(dados.assembleias, botao.replace("margin:8px 0 24px", "margin:4px 0 16px")))
  } else {
    partes.push(botao)
  }
  const salas = salasVirtuais(dados.assembleias, dados.temOnline)
  if (salas) partes.push(salas)

  partes.push(
    `<h2 style="margin:0 0 12px;font-size:17px;line-height:1.4;font-weight:600;color:${COR.navy};">Como votar</h2>`
  )
  if (dados.temOnline && destino.linkPessoal) {
    partes.push(
      passos([
        "Clique em <strong>Ir para a votação</strong>. O link é seu e abre a cédula direto, sem código.",
        "Se for a sua primeira vez, confirme CPF, nome completo e data de nascimento — é uma vez só e garante que cada pessoa vote uma única vez.",
        "Marque suas respostas e confirme o voto.",
      ])
    )
    partes.push(
      caixaAviso(
        `<strong>Não repasse este e-mail.</strong> O link acima é pessoal e vota em nome de <strong>${escaparHtml(
          destino.nome ?? "você"
        )}</strong>: quem o abrir vota no seu lugar.` +
          (destino.linkNaoSouEu
            ? ` Este e-mail não é seu? <a href="${destino.linkNaoSouEu}" style="color:${COR.laranjaAcao};font-weight:600;">Clique aqui em “Não sou eu”</a> — o link é desativado na hora e o sindicato confere o cadastro.`
            : "")
      )
    )
    if (dados.temPresencial) {
      partes.push(
        paragrafo(
          "Prefere votar presencialmente? Compareça a uma das assembleias presenciais listadas acima, com um documento com foto. O voto é um só: quem vota online não vota na urna, e vice-versa."
        )
      )
    }
  } else if (dados.temOnline) {
    partes.push(
      destino.porta === "email"
        ? passos([
            "Clique em <strong>Ir para a votação</strong>.",
            `Escolha <strong>Não sou filiado (e-mail)</strong> e informe este e-mail: <strong>${escaparHtml(destino.email)}</strong>.`,
            "Digite o código que chegará neste mesmo e-mail.",
            "No primeiro acesso, confirme seu CPF, nome completo e data de nascimento. É uma vez só e garante que cada pessoa vote uma única vez.",
            "Marque suas respostas e confirme o voto.",
          ])
        : passos([
            "Clique em <strong>Ir para a votação</strong>.",
            "Escolha <strong>Sou filiado (CPF)</strong> e informe seu CPF.",
            "Digite o código enviado ao e-mail cadastrado no sindicato.",
            "Marque suas respostas e confirme o voto.",
          ])
    )
    partes.push(
      textoSuave(
        destino.porta === "email"
          ? "É filiado? Você também pode entrar com o CPF ou pela área do filiado, no menu Votação."
          : "Se preferir, entre pela área do filiado e abra o menu Votação."
      )
    )
    if (dados.temPresencial) {
      partes.push(
        paragrafo(
          "Prefere votar presencialmente? Compareça a uma das assembleias presenciais listadas acima, com um documento com foto. O voto é um só: quem vota online não vota na urna, e vice-versa."
        )
      )
    }
  } else {
    partes.push(
      passos([
        "Compareça a uma das assembleias listadas acima, no período indicado.",
        "Leve um documento oficial com foto.",
        "Na mesa, o mesário confere o seu nome na lista e libera o seu voto.",
      ])
    )
  }

  partes.push(
    textoSuave(
      "O voto é secreto: o sistema registra que você votou, nunca em quem votou. Ninguém do sindicato pede o seu código nem o seu link de votação — não repasse a ninguém."
    )
  )
  partes.push(linkReserva(alvo))
  partes.push(
    textoSuave("Não reconhece esta votação ou recebeu por engano? Responda a este e-mail.")
  )
  return partes.join("\n")
}
