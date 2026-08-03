import {
  BookOpen,
  BriefcaseBusiness,
  Building2,
  Car,
  FileSignature,
  HeartPulse,
  Hotel,
  Landmark,
  Megaphone,
  Newspaper,
  Scale,
  ShoppingCart,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react"

/**
 * Mapa nome→componente dos ícones usados na seção de Ajuda. Fica separado do
 * manifesto para que este possa ser importado por Client Components (a
 * navegação lateral) sem arrastar referências de componente não serializáveis.
 */
export const ICONES_AJUDA: Record<string, LucideIcon> = {
  BookOpen,
  BriefcaseBusiness,
  Building2,
  Car,
  FileSignature,
  HeartPulse,
  Hotel,
  Landmark,
  Megaphone,
  Newspaper,
  Scale,
  ShoppingCart,
  Users,
  Wrench,
}

export function iconeAjuda(nome: string): LucideIcon {
  return ICONES_AJUDA[nome] ?? BookOpen
}
