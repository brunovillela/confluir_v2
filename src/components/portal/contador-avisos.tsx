"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

type ContadorAvisos = { naoLidos: number; zerar: () => void }

const Contexto = createContext<ContadorAvisos | null>(null)

/**
 * Fonte única dos avisos não lidos na casca do portal: o sino do cabeçalho,
 * o selo da lateral e o da folha "Mais" leem daqui e mudam juntos.
 *
 * Por que um provedor: o layout do portal NÃO re-renderiza ao navegar, então
 * o número que ele contou na entrada ficaria velho. Dois caminhos o
 * atualizam, sem consulta extra:
 *  - em /portal/avisos, "Marcar todos como lidos" monta <AvisosLidos />, que
 *    zera o selo na hora (sem recarregar); os avisos lidos um a um (ao abrir
 *    ou rolar a lista, onda 5) descontam no próximo render do layout;
 *  - quando o layout volta a renderizar (envio de formulário que redireciona,
 *    recarga), o valor novo do servidor vence — ajuste durante a
 *    renderização, como no ContadoresProvider do painel.
 * Aviso que chega com a pessoa navegando aparece na próxima recarga.
 */
export function ContadorAvisosProvider({ naoLidos, children }: { naoLidos: number; children: React.ReactNode }) {
  const [valor, setValor] = useState(naoLidos)
  const [doServidor, setDoServidor] = useState(naoLidos)
  if (doServidor !== naoLidos) {
    setDoServidor(naoLidos)
    setValor(naoLidos)
  }

  const zerar = useCallback(() => setValor(0), [])
  const contexto = useMemo(() => ({ naoLidos: valor, zerar }), [valor, zerar])

  return <Contexto.Provider value={contexto}>{children}</Contexto.Provider>
}

/** Avisos não lidos do associado (0 fora da casca). */
export function useNaoLidos(): number {
  return useContext(Contexto)?.naoLidos ?? 0
}

/**
 * true quando o componente está dentro da casca do portal (filiado logado ou
 * gestão em "Ver como filiado"). Fora dela — tela de entrada e Oposição do
 * trabalhador não filiado — o esqueleto e a tela de erro se viram sozinhos.
 */
export function useDentroDaCasca(): boolean {
  return useContext(Contexto) !== null
}

/**
 * Montado pela lista de avisos depois de "Marcar todos como lidos": zera o
 * selo da casca sem recarregar a página. Não desenha nada.
 */
export function AvisosLidos() {
  const contador = useContext(Contexto)
  const zerar = contador?.zerar
  useEffect(() => {
    zerar?.()
  }, [zerar])
  return null
}
