import {
  BedDouble,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Car,
  FileSignature,
  Globe,
  HeartPulse,
  Hotel,
  IdCard,
  Landmark,
  Megaphone,
  Newspaper,
  Receipt,
  Scale,
  ShieldCheck,
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
  BedDouble,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Car,
  FileSignature,
  Globe,
  HeartPulse,
  Hotel,
  IdCard,
  Landmark,
  Megaphone,
  Newspaper,
  Receipt,
  Scale,
  ShieldCheck,
  ShoppingCart,
  Users,
  Wrench,
}

export function iconeAjuda(nome: string): LucideIcon {
  return ICONES_AJUDA[nome] ?? BookOpen
}
