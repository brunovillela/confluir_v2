/**
 * O que a tela da Oposição diz depois de mandar o código aos e-mails do
 * cadastro (27/11/2026): só os que receberam, e por que os outros não.
 */
export function mensagemDosEnvios(
  enviados: string[],
  falhas: { email: string; erro: string }[],
  /** A máscara do e-mail (lib/contas.ts, que é só do servidor). */
  mascararEmailMedio: (email: string) => string
): { ok?: string; erro?: string } {
  const naoFoi = falhas.map((f) => `${mascararEmailMedio(f.email)} (${motivoCurto(f.erro)})`)
  if (enviados.length === 0) {
    // Todos pela cadência: a mensagem dela já diz quanto esperar.
    const cadencia = falhas.find((f) => /Aguarde/.test(f.erro))
    return {
      erro: cadencia
        ? `${cadencia.erro} Use o último código que chegou, se ainda estiver valendo.`
        : `Não foi possível enviar o código agora para ${naoFoi.join(", ")}. Tente de novo em instantes; se continuar, procure o sindicato.`,
    }
  }
  const lista = enviados.map(mascararEmailMedio)
  const foi =
    lista.length === 1
      ? `Você é filiado: o código foi para o e-mail do seu cadastro, ${lista[0]}.`
      : `Você é filiado: o código foi para os e-mails do seu cadastro, ${lista.join(", ")}. Use o código de qualquer um deles.`
  return { ok: naoFoi.length ? `${foi} Não foi para ${naoFoi.join(", ")}.` : foi }
}

export function motivoCurto(erro: string): string {
  if (/um minuto/.test(erro)) return "acabou de receber um; aguarde um minuto"
  if (/uma hora/.test(erro)) return "muitos pedidos; aguarde uma hora"
  return "falha no envio; tente de novo"
}

