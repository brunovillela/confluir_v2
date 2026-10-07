import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Service role só onde não há UM tenant: plataforma, proxy, auth pré-tenant,
// os ticks do agendador e o webhook do Telegram. Em código de tenant o certo
// é createAdminClient() (lê sob o JWT do tenant, com RLS) — onda 1, S10.
const PODEM_USAR_SERVICE_ROLE = [
  "src/proxy.ts",
  "src/lib/supabase/admin.ts",
  "src/lib/plataforma.ts",
  "src/lib/db/plataforma.ts",
  "src/lib/auth-diagnostico.ts",
  "src/lib/db/comunicacao.ts",
  "src/lib/db/comunicacao-mensagens.ts",
  "src/lib/db/filiacao-coletiva.ts",
  "src/lib/db/veiculos-avisos.ts",
  "src/lib/db/pendencias-lembrete.ts",
  "src/lib/db/vencimentos.ts",
  "src/lib/db/analitica.ts",
  "src/lib/db/resumo-semanal.ts",
  "src/lib/db/hospedagem-avaliacoes.ts",
  "src/lib/db/telegram.ts",
  // Confirmação do link único pelo bot: o webhook atende todas as entidades
  // e a tabela não tem política (o token carrega a entidade).
  "src/lib/db/votacao-telegram.ts",
  "src/lib/api-publica.ts",
  "src/lib/db/webhooks.ts",
  "src/app/api/**",
  "src/app/admin/**",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/supabase/admin",
              importNames: ["createServiceClient"],
              message:
                "createServiceClient ignora o RLS: use createAdminClient() em código de tenant. Só plataforma, proxy, ticks e webhook podem usá-lo (lista em eslint.config.mjs).",
            },
          ],
        },
      ],
    },
  },
  {
    files: PODEM_USAR_SERVICE_ROLE,
    rules: { "no-restricted-imports": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
