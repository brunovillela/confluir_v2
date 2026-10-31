"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

type ResultadoLote = { lidos: number; erros: number; faltam: number }

/**
 * Leitura pela IA em lotes, chamada pela tela até não faltar nada
 * (importações do Pessoal: relatório de ponto, folha de contracheques).
 *
 * Cada chamada ao servidor lê UM lote (lerItensPendentes / lerPendentesCC) —
 * vários lotes numa chamada estouravam o tempo da função, e o erro parava a
 * leitura no meio (31/10: sobravam 5 a 10 de 25). Falha de uma chamada não
 * para mais: tenta de novo, e só desiste depois de 3 falhas seguidas, avisando
 * quantos ficaram. Começa sozinha ao abrir a página quando há pendentes.
 */
export function useLeituraEmLotes(lerLote: () => Promise<ResultadoLote>, pendentes: number) {
  const router = useRouter()
  const [lendo, iniciar] = useTransition()
  const [andamento, setAndamento] = useState<{ feitos: number; total: number } | null>(null)
  const [parou, setParou] = useState<string | null>(null)
  const comecou = useRef(false)

  const ler = () => {
    setParou(null)
    iniciar(async () => {
      let feitos = 0
      let falhas = 0
      let faltam = pendentes
      // Teto de voltas só contra laço infinito: cada volta é um lote de até 4.
      for (let volta = 0; volta < 500 && faltam > 0; volta++) {
        setAndamento({ feitos, total: pendentes })
        try {
          const r = await lerLote()
          falhas = 0
          feitos += r.lidos + r.erros
          faltam = r.faltam
          router.refresh()
          // Nada lido nem com erro e ainda faltando: outra aba está lendo os mesmos.
          if (r.lidos + r.erros === 0) break
        } catch {
          falhas++
          if (falhas >= 3) {
            setParou(`A leitura parou depois de 3 tentativas sem resposta do servidor; ${faltam} ficaram por ler. Clique em Ler agora para continuar.`)
            break
          }
        }
      }
      setAndamento(null)
      router.refresh()
    })
  }

  useEffect(() => {
    if (pendentes > 0 && !comecou.current) {
      comecou.current = true
      ler()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- começa uma vez ao abrir
  }, [])

  return { lendo, andamento, parou, ler }
}
