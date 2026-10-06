# Execution Service

Fila de diagnóstico e reparo das ordens de serviço.

Microsserviço do Tech Challenge da Fase 4 (FIAP SOAT): a oficina mecânica dividida em OS Service, Billing Service e Execution Service, com a Saga orquestrada pelo OS Service. Os contratos de mensagens e rotas entre os serviços estão em [docs/contratos.md](https://github.com/LucasValada/tech-challenge-fiap/blob/docs/contratos-fase4/docs/contratos.md).

## Responsabilidades

- Gerenciar a fila de execução da OS (diagnóstico e reparo)
- Atualizar o status durante o diagnóstico e os reparos
- Comunicar a finalização ao OS Service

## Tecnologias

NestJS 11 · TypeScript · Node.js 24 · Jest · logs JSON com `nestjs-pino` e `correlationId` · agente New Relic · Docker · Kubernetes (EKS) · GitHub Actions

## Rodando localmente

```bash
npm ci
cp .env.example .env    # ajuste JWT_SECRET para o mesmo segredo do OS Service
npm run start:dev
```

- Saúde: `http://localhost:3000/execution/health`
- Swagger: `http://localhost:3000/execution/api`

Com Docker: `docker compose up --build` (porta local 3002).

## Testes

```bash
npm test            # testes unitários
npm run test:cov    # com cobertura; falha abaixo de 80% de linhas e instruções
```

## Estrutura

```
src/
  common/       filtro de erros, guards de JWT e papéis, observabilidade (New Relic, eventos)
  core/config/  validação das variáveis de ambiente e prefixo das rotas
  modules/      um módulo por domínio, em camadas application/domain/interface/infra
k8s/            namespace, ConfigMap, Deployment, Service, HPA, Ingress e PDB
```

## Deploy

Os manifestos ficam em `k8s/`. O Ingress compartilha o ALB dos três serviços (`group.name: oficina`) e encaminha `/execution` para este serviço. O pipeline de deploy no EKS entra na etapa de integração do plano de ação.
