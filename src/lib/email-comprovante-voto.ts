import { ROTULOS_MODALIDADE } from "@/lib/assembleias-constantes"
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
import { formatarData, formatarDataHora } from "@/lib/formato"

/**
 * Comprovante de votação por e-mail. Diz que o voto foi computado, quando e
 * por onde — e em nenhum lugar o que foi votado. O código e o resumo (hash)
 * vêm do registro de PARTICIPAÇÃO, que é uma tabela separada das escolhas.
 */

type Assembleia = {
  assembleia: string | null
  rodada: string | null
  campanhaTema: string | null
  modalidade: keyof typeof ROTULOS_MODALIDADE
  inicio: string | null
  termino: string | null
  horaInicio: string | null
  horaTermino: string | null
}

export function assuntoComprovante(a: Pick<Assembleia, "assembleia">): string {
  return `Comprovante de votação — ${a.assembleia ?? "assembleia"}`
}

function linha(rotulo: string, valor: string): string {
  return `<tr>
<td style="padding:8px 12px;border-top:1px solid ${COR.borda};font-size:13px;color:${COR.textoSuave};white-space:nowrap;">${rotulo}</td>
<td style="padding:8px 12px;border-top:1px solid ${COR.borda};font-size:14px;color:${COR.texto};font-weight:600;">${valor}</td>
</tr>`
}

function quadro(linhas: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;border:1px solid ${COR.borda};border-radius:8px;border-collapse:separate;overflow:hidden;">
<tr><td colspan="2" style="padding:10px 12px;background-color:${COR.navyFundo};font-size:12px;letter-spacing:0.5px;text-transform:uppercase;color:${COR.textoSuave};">Dados do comprovante</td></tr>
${linhas}
</table>`
}

function periodoTexto(a: Assembleia): string | null {
  if (!a.inicio && !a.termino) return null
  const ini = a.inicio ? `${formatarData(a.inicio)}${a.horaInicio ? ` às ${a.horaInicio}` : ""}` : null
  const fim = a.termino ? `${formatarData(a.termino)}${a.horaTermino ? ` às ${a.horaTermino}` : ""}` : null
  if (ini && fim) return ini === fim ? ini : `${ini} a ${fim}`
  return ini ?? fim
}

export function montarEmailComprovante(dados: {
  assembleia: Assembleia
  comprovante: { codigo: string; hash: string; quando: string }
  canal: "online" | "urna_digital" | "urna_fisica"
  nome: string | null
  urlConferencia: string
}): string {
  const { assembleia: a, comprovante: c } = dados
  const rotuloCanal = {
    online: "Votação online",
    urna_digital: "Urna digital (terminal)",
    urna_fisica: "Urna física (cédula em papel)",
  }[dados.canal]
  const periodo = periodoTexto(a)
  const partes: string[] = []

  partes.push(tituloEmail("Seu voto foi computado"))
  const primeiro = (dados.nome ?? "").trim().split(/\s+/)[0]
  partes.push(
    paragrafo(
      primeiro
        ? `Olá, ${escaparHtml(primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase())}.`
        : "Olá."
    )
  )
  partes.push(
    paragrafo(
      `Confirmamos a sua participação na votação da assembleia <strong>${escaparHtml(a.assembleia ?? "")}</strong>` +
        (a.rodada ? `, da ${escaparHtml(a.rodada)}` : "") +
        ". Guarde este comprovante."
    )
  )
  partes.push(
    quadro(
      [
        linha("Código", `<span style="font-family:ui-monospace,Menlo,Consolas,monospace;letter-spacing:1px;">${escaparHtml(c.codigo)}</span>`),
        linha("Voto computado em", formatarDataHora(c.quando)),
        linha("Canal", escaparHtml(rotuloCanal)),
        linha("Assembleia", escaparHtml(a.assembleia ?? "—")),
        a.rodada ? linha("Rodada", escaparHtml(a.rodada)) : "",
        a.campanhaTema ? linha("Campanha", escaparHtml(a.campanhaTema)) : "",
        linha("Modalidade", ROTULOS_MODALIDADE[a.modalidade]),
        periodo ? linha("Período da votação", escaparHtml(periodo)) : "",
        linha(
          "Resumo (SHA-256)",
          `<span style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;font-weight:400;word-break:break-all;">${escaparHtml(c.hash)}</span>`
        ),
      ].join("")
    )
  )

  partes.push(botaoEmail(dados.urlConferencia, "Conferir o comprovante"))
  partes.push(
    caixaAviso(
      "<strong>Este comprovante não mostra em quem você votou — e nunca vai mostrar.</strong> Ele prova apenas que a sua participação foi registrada."
    )
  )

  partes.push(
    `<h2 style="margin:0 0 12px;font-size:17px;line-height:1.4;font-weight:600;color:${COR.navy};">Como a votação é protegida</h2>`
  )
  partes.push(
    `<ul style="margin:0 0 20px;padding-left:22px;">
<li style="margin:0 0 8px;"><strong>Voto secreto.</strong> As suas escolhas são gravadas separadas do seu cadastro. O comprovante nasce do registro de participação, que não guarda as respostas — nem o sindicato consegue ligar uma coisa à outra.</li>
<li style="margin:0 0 8px;"><strong>Um voto por pessoa.</strong> A participação fica registrada na rodada: quem vota online não vota na urna, e o mesmo CPF ou e-mail não vota duas vezes.</li>
<li style="margin:0 0 8px;"><strong>Identidade confirmada.</strong> Só foi possível votar depois do código enviado ao seu e-mail.</li>
<li style="margin:0 0 8px;"><strong>Registro lacrado.</strong> O resumo SHA-256 acima é calculado a partir do código, da assembleia e do momento do voto: se algo no registro mudasse, ele deixaria de conferir.</li>
<li style="margin:0 0 8px;"><strong>Resultado.</strong> A apuração só aparece depois do término da rodada, e você a vê na área do filiado, em Votação.</li>
</ul>`
  )
  partes.push(linkReserva(dados.urlConferencia))
  partes.push(
    textoSuave(
      "Não foi você quem votou? Responda a este e-mail imediatamente para o sindicato apurar."
    )
  )
  return partes.join("\n")
}
