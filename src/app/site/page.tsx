import type { Metadata } from "next"

import { Landing } from "./landing"
import "./site.css"

export const metadata: Metadata = {
  title: "Confluir — A gestão do seu sindicato em um só lugar",
  description:
    "Plataforma de gestão sindical: filiados, financeiro, pessoal, jurídico, saúde, assembleias e mais — com portal do associado, votação online e IA embarcada.",
}

export default function SitePage() {
  return <Landing />
}
