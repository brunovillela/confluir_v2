import { EsqueletoPortal } from "@/components/portal/esqueleto-portal"

/**
 * Entre o toque no menu e a página do portal, o esqueleto — dentro da casca,
 * que é do layout e não sai da tela (A65). Antes nada acontecia até o
 * servidor responder e a tela parecia travada.
 */
export default function CarregandoPortal() {
  return <EsqueletoPortal />
}
