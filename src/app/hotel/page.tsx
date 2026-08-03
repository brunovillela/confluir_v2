import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { AuthShell } from "@/components/auth/auth-shell"
import { getSessaoHotel } from "@/lib/auth"

import { HotelLoginForm } from "./hotel-login-form"

export const metadata: Metadata = {
  title: "Área do hotel — Confluir",
}

export default async function HotelPage() {
  const sessao = await getSessaoHotel()
  if (sessao) redirect("/hotel/inicio")

  return (
    <AuthShell
      rodape={
        <>
          É funcionário do sindicato?{" "}
          <Link
            href="/login"
            className="text-foreground font-medium underline-offset-4 hover:underline"
          >
            Entre pelo painel
          </Link>
        </>
      }
    >
      <HotelLoginForm />
    </AuthShell>
  )
}
