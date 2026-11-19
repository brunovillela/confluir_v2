"use client"

import { useRouter } from "next/navigation"

import { MocaoForm } from "@/app/painel/representacao/congressos/mocoes-componentes"

/** Apresentar pelo link pessoal: ao criar, abre a moção com o QR para colher assinaturas. */
export function NovaMocaoLink({ token, tipos, bases, baseInicial }: { token: string; tipos: string[]; bases: { id: string; nome: string }[]; baseInicial: string | null }) {
  const router = useRouter()
  return (
    <MocaoForm
      origem={{ tipo: "link", token }}
      tipos={tipos}
      bases={bases}
      inicial={{ unidadeId: baseInicial }}
      aoConcluir={(r) => {
        if (r.codigo) router.push(`/congresso/eu/${token}/mocao/${r.codigo}`)
      }}
    />
  )
}
