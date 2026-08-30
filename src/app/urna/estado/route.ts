import { NextResponse, type NextRequest } from "next/server"

import { estadoTerminal } from "@/lib/db/votacao-mesarios"

const NO_STORE = { "Cache-Control": "no-store" }

/** Estado atual do terminal, consultado por polling do kiosk (token na query). */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")
  if (!token) {
    return NextResponse.json({ status: "novo" }, { headers: NO_STORE })
  }
  const estado = await estadoTerminal(token)
  return NextResponse.json(estado ?? { status: "novo" }, { headers: NO_STORE })
}
