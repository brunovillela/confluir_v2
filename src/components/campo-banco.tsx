"use client"

import { Input } from "@/components/ui/input"
import { BANCOS, rotuloBanco } from "@/lib/bancos"

/**
 * Campo "Banco" com a lista dos bancos (código - nome) como sugestão. Ao
 * escolher uma opção, o campo fica com o nome e, se o formulário tiver o campo
 * do código (`campoCodigo`), ele é preenchido. Banco fora da lista pode ser
 * digitado; o servidor padroniza o nome pelo código ou apelido (lib/bancos).
 */
export function CampoBanco({
  id,
  name = "banco",
  defaultValue,
  campoCodigo,
  required,
}: {
  id: string
  name?: string
  defaultValue?: string | null
  /** Nome do campo do código do banco no mesmo formulário. */
  campoCodigo?: string
  required?: boolean
}) {
  const lista = `${id}-lista`
  return (
    <>
      <Input
        id={id}
        name={name}
        list={lista}
        autoComplete="off"
        required={required}
        defaultValue={defaultValue ?? ""}
        placeholder="Digite o nome ou o código"
        onChange={(e) => {
          const m = e.currentTarget.value.match(/^(\d{3}) - (.+)$/)
          if (!m) return
          e.currentTarget.value = m[2]
          const codigo = campoCodigo ? e.currentTarget.form?.elements.namedItem(campoCodigo) : null
          if (codigo instanceof HTMLInputElement) codigo.value = m[1]
        }}
      />
      <datalist id={lista}>
        {BANCOS.map((b) => (
          <option key={b.codigo} value={rotuloBanco(b)} />
        ))}
      </datalist>
    </>
  )
}
