import { redirect } from "next/navigation"

/** A lista de reuniões mora numa aba da página do empregador (a trilha aponta para cá). */
export default async function ReunioesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/painel/representacao/empregadores/${id}?aba=reunioes`)
}
