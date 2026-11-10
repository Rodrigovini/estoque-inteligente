Aplicação web de controle de estoque com Express, PostgreSQL e interface responsiva em HTML/CSS/JavaScript puro.

## Como executar

1. Instale o PostgreSQL e crie um banco vazio.
2. Execute `npm install`.
3. Copie `.env.example` para `.env` e configure `DATABASE_URL`, `JWT_SECRET` e, se necessário, `PORT`.
4. Execute `npm run dev`.
5. Acesse `http://localhost:3000`.

Na primeira inicialização, o sistema cria automaticamente o esquema do banco e o usuário administrador:

- **E-mail:** `admin@estoque.com`
- **Senha:** `admin123`

Troque essa senha após o primeiro acesso. O PostgreSQL é atualizado pelo arquivo `schema.sql` a cada inicialização.