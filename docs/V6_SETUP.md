# ResearchFlow V6 — Pessoas, Estrutura Institucional e Invites

## Ordem de aplicação no Supabase

Execute no SQL Editor, nesta ordem:

1. `supabase/researchflow_v6_people_invites_structure.sql`
2. `supabase/researchflow_v6_1_people_management.sql`

As migrations anteriores não devem ser executadas novamente se já estiverem aplicadas.

## Diretor atual

Por decisão mais recente do projeto, o login de Diretoria ativo permanece:

`institutofotonmais@gmail.com`

O membership antigo de `leonardo.rossato@institutofoton.com.br` permanece revogado.

## Estrutura institucional sem login obrigatório

V6 separa `people` de `memberships`:

- `people`: identidade institucional e organograma, inclusive pessoas sem e-mail/login;
- `memberships`: autorização efetiva do ResearchFlow para identidades autenticadas;
- `laboratory_coordinators`: relação N:N entre laboratórios e coordenadores;
- `researchflow_invites`: convites de matrícula de identidade.

## Laboratórios institucionais

A V6 garante cinco laboratórios ativos:

- Computação Quântica — Hardware e Firmware
- Comunicação & Criptografia Quântica
- Sensores & Materiais Quânticos
- Algoritmos & Otimização
- Quântica para Negócios

O antigo laboratório de teste `Quântica nos Negócios` é reaproveitado/convertido para `Quântica para Negócios` quando possível para preservar os vínculos de teste existentes.

## Convites

O Diretor gera o convite pelo painel **Pessoas & Acessos**.

Fluxo:

1. Diretor seleciona `Criar link de invite`.
2. PostgreSQL gera 32 bytes criptograficamente aleatórios.
3. Apenas SHA-256 do token é persistido.
4. O token bruto é retornado uma única vez para copiar.
5. Link expira em 7 dias.
6. Destinatário abre `#/invite/<TOKEN>`.
7. ResearchFlow mostra apenas identidade institucional prevista.
8. Google OAuth autentica a pessoa.
9. ResearchFlow mostra a conta Google verificada para confirmação.
10. `researchflow_accept_invite()` vincula `people`, `memberships` e `auth_user_id`.
11. Convite fica `accepted` e não pode ser reutilizado.

O token sozinho não concede acesso aos dados institucionais.

## Teste sem ativar uma pessoa real

A V6.1 cria um perfil claramente marcado para desenvolvimento:

`Perfil de Teste ResearchFlow`

Ele aparece em **Pessoas & Acessos** e pode ser usado para validar o fluxo completo de convite sem alterar Denicesar, Wilson, Marcelo, Suzieli, Lucas, Jorge, Viviane ou os demais diretores institucionais.

## E-mail de confirmação opcional

A ativação funciona sem e-mail. Para enviar confirmação transacional, implante:

`supabase/functions/notify-invite-accepted/index.ts`

Secrets opcionais:

- `RESEND_API_KEY`
- `INVITE_CONFIRMATION_FROM_EMAIL`

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são disponibilizados/configurados no ambiente da Edge Function conforme o projeto Supabase.

Falha no e-mail não desfaz a ativação.

## Teste end-to-end recomendado

1. Entre como Diretor.
2. Abra `Pessoas & Acessos`.
3. Localize `Perfil de Teste ResearchFlow`.
4. Clique em `Criar link de invite`.
5. Copie o link.
6. Abra em janela privada.
7. Confira nome, perfil e laboratório.
8. Entre com uma conta Google de teste.
9. Confira o e-mail Google exibido.
10. Clique em `Confirmar meu acesso`.
11. Entre no ResearchFlow.
12. Confirme que o workspace corresponde ao papel definido.
13. Reabra o mesmo link: deve ser recusado como convite já utilizado.

## Segurança

- Não existe senha ResearchFlow.
- Não é enviada senha por e-mail.
- O frontend não recebe `service_role`.
- Convites são criados/revogados por RPCs que exigem `director` no servidor.
- `people` sem membership não têm acesso a dados.
- Após aceite, acesso é controlado pelo membership normal e pelas RLS existentes.
