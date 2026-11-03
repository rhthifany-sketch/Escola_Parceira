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
- **Documentos**:
  - **ANEXO 1.pdf**: uma declaração de frequência por criança, em ordem alfabética, num arquivo só.
  - **ANEXO 10.pdf** e **ANEXO 10.xlsx**: relatório mensal da unidade.
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
