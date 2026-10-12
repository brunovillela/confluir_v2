"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"

/**
 * Confirmação que chega pela URL depois de um redirect (?salvo=1, ?aberta=1,
 * ?desistiu=1, ?aviso=…) — A131. Mostra o aviso que a página manda (o Alert
 * de sempre, com o texto de sempre) e tira os parâmetros da barra de endereço
 * logo em seguida: antes, F5 ou o "voltar" repetiam "Cadastro atualizado com
 * sucesso." sem nada ter sido salvo.
 *
 * O aviso continua na tela, de propósito: para quem usa o portal no celular,
 * uma confirmação que some em 4 s (toast) passa despercebida.
 *
 * A troca do endereço é por history.replaceState, que o roteador do Next
 * acompanha sem refazer a página no servidor — refazer tiraria o aviso que
 * ela acabou de mostrar. Quem volta a esta página pelo histórico chega no
 * endereço já limpo, e o aviso não reaparece: ele só aparece se a URL tinha
 * o parâmetro quando o componente montou.
 *
 * `senao`: o que fica no lugar quando o aviso não aparece. Na volta pelo
 * histórico o roteador pode reaproveitar a página que o servidor montou COM
 * o parâmetro — e a página que troca um texto pelo aviso (ex.: "Solicitação
 * concluída" × "Solicitação encerrada") ficaria sem nenhum dos dois.
 */
export function AvisoDaUrl({
  parametros,
  children,
  senao = null,
}: {
  parametros: string[]
  children: React.ReactNode
  senao?: React.ReactNode
}) {
  const busca = useSearchParams()
  const chave = parametros.join(",")
  const naUrl = chave.split(",").some((p) => busca.has(p))
  // Lido uma vez, na montagem: a limpeza abaixo muda a URL e não pode apagar o aviso.
  const [visivel] = useState(naUrl)

  // Também quando o parâmetro volta sem remontar o aviso (salvar de novo na
  // mesma página: o React reaproveita o componente que já estava na tela).
  useEffect(() => {
    if (!naUrl) return
    const url = new URL(window.location.href)
    for (const p of chave.split(",")) url.searchParams.delete(p)
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`)
  }, [chave, naUrl])

  return visivel ? children : senao
}
