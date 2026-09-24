-- Confluir — Cessão de espaços, FASE 4 (2026-09-24)
--
-- O termo de cessão: um MODELO padrão versionado por tenant, e a cópia
-- renderizada que fica presa a cada cessão. A assinatura das duas partes é a
-- fase 5.
--
-- ── POR QUE MODELO E CÓPIA ──────────────────────────────────────────────────
-- O texto é institucional: quem redige é a entidade (com ajuda da IA), uma vez,
-- e ele vale para todas as cessões. O que muda de uma cessão para outra são os
-- DADOS — horários, liberação para montagem, responsáveis, exigências,
-- custeio —, e eles entram por marcadores.
--
-- Fazer a IA escrever um termo novo a cada cessão seria pedir para ela variar
-- justamente onde não se pode variar: obrigação de parte, responsabilidade
-- civil, prazo. Ela ajuda a escrever o PADRÃO; os dados vêm do registro.
--
-- Espelha `filiacao_tl_lgpd`: no máximo UM `em_vigor` por tenant, e o
-- histórico são as versões anteriores. Cada cessão guarda o texto JÁ
-- RENDERIZADO e o CÓDIGO da versão usada — revisar o modelo não reescreve o
-- que já foi acordado.
--
-- Requer as fases 1 a 3. Idempotente. Executar UMA VEZ.

-- ── 1. O modelo, versionado ──────────────────────────────────────────────────

create table if not exists cessao_termos (id uuid primary key default gen_random_uuid());
alter table cessao_termos add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table cessao_termos add column if not exists texto text;
-- Código da versão, AAAAMMDDHHmm (mesma convenção dos termos de filiação).
alter table cessao_termos add column if not exists codigo text;
alter table cessao_termos add column if not exists em_vigor boolean not null default false;
alter table cessao_termos add column if not exists criado_por_id uuid references usuarios(id);
alter table cessao_termos add column if not exists created_at timestamptz not null default now();
alter table cessao_termos add column if not exists updated_at timestamptz;

create index if not exists idx_cessao_termos_emp
  on cessao_termos (emp_proprietaria_id, em_vigor, created_at desc);

comment on table cessao_termos is
  'Modelo padrão do termo de cessão, versionado por tenant. No máximo um em vigor; os demais são o histórico.';

alter table cessao_termos enable row level security;
drop policy if exists tenant_isolation on cessao_termos;
create policy tenant_isolation on cessao_termos for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on cessao_termos to authenticated;
drop trigger if exists set_emp_from_jwt on cessao_termos;
create trigger set_emp_from_jwt before insert on cessao_termos
  for each row execute function public.set_emp_from_jwt();

-- ── 2. O termo daquela cessão ────────────────────────────────────────────────

alter table cessao_solicitacoes add column if not exists termo_texto text;
alter table cessao_solicitacoes add column if not exists termo_codigo text;
alter table cessao_solicitacoes add column if not exists termo_gerado_em timestamptz;
alter table cessao_solicitacoes add column if not exists termo_gerado_por_id uuid references usuarios(id);

comment on column cessao_solicitacoes.termo_texto is
  'Modelo renderizado com os dados desta cessão, congelado. Revisar o modelo não altera termos já gerados.';

-- ── 3. Um modelo inicial por tenant ──────────────────────────────────────────
--
-- ATENÇÃO: é um PONTO DE PARTIDA, escrito em linguagem simples. Peça revisão
-- do jurídico da entidade antes da primeira cessão — especialmente as
-- cláusulas de responsabilidade e de danos.
--
-- Data-driven: percorre os tenants, não cita nenhum.

insert into cessao_termos (emp_proprietaria_id, codigo, em_vigor, texto)
select
  e.id,
  to_char(now() at time zone 'America/Sao_Paulo', 'YYYYMMDDHH24MI'),
  true,
  'TERMO DE CESSÃO DE USO DE ESPAÇO

Pelo presente instrumento, {{entidade}}, doravante CEDENTE, cede a {{concessionario}}, doravante CONCESSIONÁRIO, o uso do espaço {{espaco}}, localizado em {{sede}}, nas condições abaixo.

1. FINALIDADE
O espaço será utilizado para: {{finalidade}}
Público estimado: {{publico}} pessoas.

2. PERÍODO
Início: {{inicio}}
Término: {{termino}}
{{montagem}}
{{desmontagem}}
O espaço deve ser devolvido nas mesmas condições em que foi recebido, dentro do período acima.

3. RESPONSÁVEIS
Pelo CONCESSIONÁRIO: {{representante}}
Pela visita técnica (CEDENTE): {{responsavel_visita}}

4. EXIGÊNCIAS DE SEGURANÇA
{{exigencias}}
A contratação e o pagamento desses profissionais e itens são de responsabilidade do CONCESSIONÁRIO, que deve comprová-los antes do início do evento.

5. CUSTEIO
{{custeio}}

6. OBRIGAÇÕES DO CONCESSIONÁRIO
a) Utilizar o espaço exclusivamente para a finalidade declarada.
b) Zelar pelo patrimônio, respondendo por danos causados por si, por seus prepostos ou pelo público do evento.
c) Cumprir as exigências de segurança e a legislação aplicável, inclusive quanto a lotação, saídas de emergência e acessibilidade.
d) Não ceder, sublocar ou transferir o espaço a terceiros.
e) Devolver o espaço limpo e desocupado ao final do período.

7. OBRIGAÇÕES DO CEDENTE
a) Disponibilizar o espaço no período acordado, nas condições apresentadas na visita técnica.
b) Informar previamente as regras de uso, acesso e segurança do local.
c) Comunicar, com a maior antecedência possível, qualquer impedimento superveniente.

8. CANCELAMENTO
Qualquer das partes pode desistir da cessão, por escrito, informando a outra com a maior antecedência possível. O CEDENTE pode cancelar a cessão a qualquer tempo em caso de descumprimento deste termo, de risco à segurança ou de necessidade institucional justificada.

9. DISPOSIÇÕES FINAIS
Este termo não gera vínculo societário, trabalhista ou de representação entre as partes. Os casos omissos serão resolvidos entre CEDENTE e CONCESSIONÁRIO.

{{local_data}}'
from (select distinct emp_proprietaria_id as id from usuarios where emp_proprietaria_id is not null) e
where not exists (select 1 from cessao_termos x where x.emp_proprietaria_id = e.id);

notify pgrst, 'reload schema';
