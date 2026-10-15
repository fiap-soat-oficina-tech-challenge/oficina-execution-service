# Infraestrutura do Execution Service

Terraform dos recursos AWS que pertencem a este serviço:

- Fila `oficina-execution-commands` e a DLQ `oficina-execution-commands-dlq`
- Tabela DynamoDB `oficina-execution-tarefas`, com os índices `por-status` (fila do mecânico) e `por-os`
- Repositório de imagens `oficina-execution-service` no ECR
- Política de acesso anexada à role dos nós do EKS: consumir a própria fila, publicar em `oficina-os-saga-replies` e ler e gravar na tabela

## Segredos que o serviço lê do SSM

O CD monta o Secret `execution-secret` do Kubernetes a partir destes parâmetros (prefixo `/tc3-oficina/homolog`). Nenhum valor passa por arquivo, manifesto ou secret do GitHub.

| Parâmetro | Origem |
|---|---|
| `JWT_SECRET` | o mesmo do OS Service e da Lambda de autenticação (Fase 3) |
| `NEW_RELIC_LICENSE_KEY` | publicado por `tc3-infra-k8s` |

As credenciais da AWS para o SQS e o DynamoDB não são segredo: vêm da role dos nós do EKS, com a política de `iam.tf`.

## Dependências e ordem

A VPC e o cluster vêm de [`tc3-infra-k8s`](https://github.com/tiagostorch/tc3-infra-k8s), lidos pelo state remoto. Por isso:

- **apply:** depois de `tc3-infra-k8s`;
- **destroy:** antes de `tc3-infra-k8s`, porque a AWS não apaga a role dos nós com esta política ainda anexada.

## Comandos

```bash
cd terraform
terraform init -backend-config="bucket=tc3-tfstate-oficina-539820"
terraform plan  -var="state_bucket=tc3-tfstate-oficina-539820"
terraform apply -var="state_bucket=tc3-tfstate-oficina-539820"
```

O state fica em `execution-service/terraform.tfstate`, no mesmo bucket das stacks da Fase 3.
