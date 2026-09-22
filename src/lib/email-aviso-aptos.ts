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

function listaAssembleias(assembleias: AssembleiaDoAviso[]): string {
  const linhas = assembleias
    .map((a) => {
      const quando = periodo(a.data_inicio, a.data_termino)
      return `<tr><td style="padding:10px 12px;border-top:1px solid ${COR.borda};">
<div style="font-weight:600;color:${COR.navy};">${escaparHtml(a.nome ?? "Assembleia")}</div>
<div style="font-size:13px;color:${COR.textoSuave};">${ROTULOS_MODALIDADE[a.modalidade]}${quando ? ` · ${quando}` : ""}</div>
</td></tr>`
    })
    .join("")
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;border:1px solid ${COR.borda};border-radius:8px;border-collapse:separate;overflow:hidden;">
<tr><td style="padding:10px 12px;background-color:${COR.navyFundo};font-size:12px;letter-spacing:0.5px;text-transform:uppercase;color:${COR.textoSuave};">Onde votar</td></tr>
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
  if (quando) partes.push(caixaAviso(`A votação acontece ${quando}.`))
  if (dados.assembleias.length > 0) partes.push(listaAssembleias(dados.assembleias))

  const alvo = destino.linkPessoal ?? dados.link
  partes.push(botaoEmail(alvo, dados.temOnline ? "Ir para a votação" : "Acessar o Confluir"))

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
        "<strong>Não repasse este e-mail.</strong> O link acima é pessoal: quem o abrir vota no seu lugar."
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
            "Digite o código de 6 dígitos que chegará neste mesmo e-mail.",
            "No primeiro acesso, confirme seu CPF, nome completo e data de nascimento. É uma vez só e garante que cada pessoa vote uma única vez.",
            "Marque suas respostas e confirme o voto.",
          ])
        : passos([
            "Clique em <strong>Ir para a votação</strong>.",
            "Escolha <strong>Sou filiado (CPF)</strong> e informe seu CPF.",
            "Digite o código de 6 dígitos enviado ao e-mail cadastrado no sindicato.",
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
      "O voto é secreto: o sistema registra que você votou, nunca em quem votou. Ninguém do sindicato pede o seu código — não o repasse."
    )
  )
  partes.push(linkReserva(alvo))
  partes.push(
    textoSuave("Não reconhece esta votação ou recebeu por engano? Responda a este e-mail.")
  )
  return partes.join("\n")
}
