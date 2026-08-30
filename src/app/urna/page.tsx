import type { Metadata } from "next"

import { TerminalVotacao } from "./terminal"

export const metadata: Metadata = { title: "Terminal de votação — Confluir" }

export default function UrnaTerminalPage() {
  return (
    <div className="mx-auto grid min-h-screen max-w-lg content-center gap-6 px-4 py-10">
      <TerminalVotacao />
    </div>
  )
}
