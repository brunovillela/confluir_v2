# Design System Confluir

Referência viva: **/style-guide** (dois temas lado a lado).
Arquivo único de tokens: [`src/app/globals.css`](src/app/globals.css).

## Regra de ouro

**Nenhuma cor crua fora do `globals.css`.** Componentes usam apenas tokens
semânticos (via utilitários Tailwind). Se precisar de uma cor que não existe,
crie/ajuste um token — não escreva hex, `oklch()` nem classes tipo
`text-emerald-700` em componente.

## Camadas de cor

1. **Paleta bruta** (`--primary-500`, `--navy-900`, `--success-400`…) — só o
   `globals.css` usa. Bases exatas: laranja `#FF5722` (primary-500) e navy
   `#091747` (navy-900); tudo o mais deriva delas em OKLCH.
2. **Tokens semânticos** (light **e** dark): superfícies (`--bg-base`,
   `--bg-surface`, `--bg-elevated`, `--bg-inset`), texto (`--text-primary`,
   `--text-secondary`, `--text-muted`, `--text-inverse`, `--text-on-action`),
   bordas (`--border-subtle/-default/-strong`), ação (`--action*`), feedback
   (`--success/-fg` etc.), utilitários (`--focus-ring`, `--overlay`,
   `--link`).
3. **Variáveis shadcn** (`--background`, `--card`, `--primary`…) mapeadas
   para os tokens semânticos — é o que os componentes consomem via classes
   (`bg-card`, `text-muted-foreground`, `border-input`…).

### Classes mais usadas

| Preciso de… | Use |
|---|---|
| Fundo de página / card / popover / input rebaixado | `bg-background` / `bg-card` / `bg-popover` / `bg-inset` |
| Texto padrão / apoio / discreto | `text-foreground` / — / `text-muted-foreground` |
| Ação primária (laranja) | `bg-primary text-primary-foreground` (Button `default`) |
| Status positivo / atenção / erro / informativo | `text-success-fg`, `border-success/40`, `bg-success/10` (idem `warning`, `error`, `info`) — ou `<Badge variant="success">`, `<Alert variant="warning">` |
| Foco visível | já vem dos componentes (`ring-ring`); nunca remova `focus-visible` |
| Gráficos | `bg-chart-1..5` (categóricas validadas nos dois temas) |

## Uso das cores (regra de marca)

- **Laranja = ação/destaque**: botão primário, link ativo, indicadores, foco.
  Nunca como fundo de grandes áreas.
- **Navy = estrutura**: sidebar (nos dois temas) e base do tema escuro.
- Feedback tem croma contido de propósito para não competir com o laranja.

## Tema light/dark/system

- `next-themes` com `attribute="data-theme"` no `<html>`; modo `system` segue
  o SO, escolha manual persiste em `localStorage`, sem flash (script inline).
- Para forçar um tema num subtree (ex.: style guide): `<div data-theme="dark">`.
- Variante `dark:` do Tailwind segue `[data-theme="dark"]` — mas prefira
  tokens que já mudam sozinhos (ex.: `text-success-fg` em vez de
  `text-X dark:text-Y`).

## Tokens não-cor

- **Tipografia**: Poppins (400 corpo · 500 UI · 600 títulos · 700 destaque),
  escala `text-xs`…`text-5xl` (12→48px) com line-height e tracking embutidos.
  Exceção: **tabelas** usam 13px (`text-[0.8125rem]`, definido em
  `ui/table.tsx`) — um degrau abaixo do corpo, para densidade.
- **Tabelas longas**: paginar com `<Paginacao>` (components/paginacao.tsx) +
  `lerPaginacao`/`paginar` (lib/paginacao.ts), dirigido por URL
  (`?pagina=`/`?porPagina=`, prefixo quando há 2+ tabelas na página).
  Padrões: **30** itens em página dedicada à lista, **10** em página
  concorrida (lista dividindo espaço com cards/formulários).
- **Espaçamento**: escala de 4px (utilitários padrão: `p-1` = 4px…).
- **Raio**: `rounded-sm/md/lg/xl` derivados de `--radius`.
- **Elevação**: `shadow-xs/md/lg/xl` (mais sutil no dark — lá a separação é
  por borda).
- **Z-index**: `z-(--z-sticky|dropdown|overlay|modal|toast)`.
- **Movimento**: `--duration-fast/base`, `--ease-standard`;
  `prefers-reduced-motion` é respeitado globalmente.
- **Breakpoints**: `sm` 640 (mobile→) · `md` 768 (tablet) · `lg` 1024
  (desktop) · `xl` 1280 / `2xl` 1536 (wide).

## Como adicionar um componente novo sem quebrar o sistema

1. `npx shadcn add <componente>` (registro `radix-nova`) — ele já sai usando
   as variáveis mapeadas.
2. Estados obrigatórios: default, hover, active, focus-visible, disabled e,
   quando couber, loading/error/selected/read-only — sempre com tokens.
3. Contraste AA: texto ≥ 4.5:1, texto grande/UI ≥ 3:1 (os pares
   `*-fg`/superfícies do tema já garantem isso; valide se sair deles).
4. Estados nunca só por cor (ícone/label junto) e hit target ≥ 44px no touch.
5. Adicione o componente ao `/style-guide` nos dois temas.
