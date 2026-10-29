import { redirect } from "next/navigation"

/**
 * O Telegram (vínculo com o bot e telefone) mora em Meu perfil → Avisos desde
 * 29/10/2026: era um segundo lugar para escolher o que chega pelo Telegram.
 * A rota fica para links antigos.
 */
export default function TelegramPerfilPage() {
  redirect("/painel/perfil/avisos#telegram")
}
