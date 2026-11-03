# Escola Parceira

Sistema da prestação de contas mensal do **Programa Escola Parceira** (Prefeitura de Niterói / FME):
frequência das crianças, anexos, assinaturas dos responsáveis e o pacote que vai para a prefeitura
com a nota fiscal.

## O que já funciona (etapa 1)

- **Login** com dois perfis: **financeiro** (todas as unidades) e **gestor** (só a unidade dele).
- **Unidades**: razão social, CNPJ e representante legal (saem nos anexos).
- **Crianças**: cadastro com os dados do Anexo X e do responsável (nome, CPF, WhatsApp).
  Importa a planilha do **Anexo X** (quem já existe é atualizado, quem é novo entra).
  Data de saída tira a criança do programa sem apagar o histórico.
- **Frequência do mês**: dias letivos + faltas justificadas e não justificadas por criança.
  Calcula a frequência e destaca quem ficou **abaixo de 60%**. Só a falta **não justificada** conta.
- **Documentos** (todas as crianças em ordem alfabética, num PDF por anexo, com o nome que a prefeitura pede):
  - **ANEXO 1**: declaração de frequência do mês.
  - **ANEXO 2, 3 e 4**: assinados uma vez, reenviados todo mês (o Anexo II usa o profissional que atende os pais, no cadastro da unidade).
  - **ANEXO 5**: só as crianças com entrega de material e uniforme no mês (data da entrega no cadastro da criança).
  - **ANEXO 10** (PDF e Excel): relatório mensal da unidade.
  - **ANEXO 11**: cardápio das semanas A a D (tela Cardápio, preenchido uma vez) + cálculo da alimentação.
- **Editar e excluir** crianças (uma ou várias), unidades e usuários.
- **Painel do mês**: a situação de cada unidade (frequência lançada, abaixo de 60%, cadastro incompleto).

## Próximas etapas

Veja [docs/PROCESSO.md](docs/PROCESSO.md).

## Rodar no computador

Precisa de Node 20+ e Postgres.

```bash
cd backend
cp .env.example .env        # ajuste DATABASE_URL, ADMIN_EMAIL e ADMIN_PASSWORD
npm install
npx prisma migrate dev
npm run seed                # cria o usuário financeiro
npm run dev                 # API em http://localhost:3333
```

```bash
cd frontend
npm install
npm run dev                 # site em http://localhost:5173
```

Testes: `cd backend && npm test`.

## Publicar no Render

1. No Render: **New → Blueprint** e escolha este repositório (usa o `render.yaml`).
2. Antes de confirmar, preencha `ADMIN_EMAIL` e `ADMIN_PASSWORD` (o primeiro login do financeiro).
3. Quando a API estiver no ar, copie a URL dela e preencha no site `VITE_API_URL` = `https://<api>.onrender.com/api`.
4. Copie a URL do site e preencha na API `CORS_ORIGIN` = `https://<site>.onrender.com`.
