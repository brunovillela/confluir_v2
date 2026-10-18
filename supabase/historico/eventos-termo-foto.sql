-- Confluir — Eventos: correção do termo de biometria (2026-09-05)
--
-- O texto semeado em `eventos.sql` dizia que a pessoa pode recusar a foto "sem
-- prejuízo à sua participação". Isso é FALSO quando o evento exige a foto — e
-- um termo que promete o que não se cumpre é pior do que termo nenhum.
--
-- A correção separa dois planos:
--   • o TERMO descreve a NATUREZA do tratamento (estável, versionado);
--   • a TELA diz a CONSEQUÊNCIA neste evento (varia com `eventos.exige_foto`).
--
-- Nota sobre consentimento livre (LGPD art. 5º, XII): quando recusar significa
-- ficar de fora, a liberdade do consentimento é discutível. O caminho
-- defensável é a transparência — dizer antes da captura que sem a foto não há
-- inscrição, e que a exigência vem do controle de acesso do local. É o que a
-- tela passa a fazer.
--
-- Seguro rodar mesmo que alguém já tenha aceitado: cria a VERSÃO 2 e aposenta a
-- 1, preservando o rastro de quem aceitou o texto anterior.

do $$
declare r record;
begin
  for r in
    select emp_proprietaria_id, max(versao) as v
      from eventos_termos
     where tipo = 'foto_biometrica'
     group by emp_proprietaria_id
  loop
    update eventos_termos
       set em_vigor = false, updated_at = now()
     where emp_proprietaria_id = r.emp_proprietaria_id
       and tipo = 'foto_biometrica';

    insert into eventos_termos (emp_proprietaria_id, tipo, versao, texto, em_vigor)
    values (
      r.emp_proprietaria_id,
      'foto_biometrica',
      r.v + 1,
      'ATENÇÃO — LEIA COM CUIDADO. A foto que você enviar será usada para RECONHECIMENTO FACIAL no sistema de controle de acesso do local, para liberar sua entrada na catraca. Imagem de rosto usada para identificar uma pessoa é DADO PESSOAL SENSÍVEL (dado biométrico), e por isso pedimos seu consentimento específico para esta finalidade — ele não vale para nenhum outro uso. A foto será enviada ao sistema de controle de acesso da entidade e apagada do Confluir no prazo informado nesta tela, após o fim do evento. A remoção no sistema de controle de acesso é feita separadamente, mediante seu pedido, e registramos quando foi executada. Você pode pedir acesso, correção ou exclusão dos seus dados a qualquer momento, pelo endereço indicado no rodapé desta inscrição.',
      true
    );
  end loop;
end $$;
