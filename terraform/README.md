# Infraestrutura do Execution Service

Terraform dos recursos AWS que pertencem a este serviço:

- Fila `oficina-execution-commands` e a DLQ `oficina-execution-commands-dlq`
- Tabela DynamoDB `oficina-execution-tarefas`, com os índices `por-status` (fila do mecânico) e `por-os`
- Repositório de imagens `oficina-execution-service` no ECR
- Política de acesso anexada à role dos nós do EKS: consumir a própria fila, publicar em `oficina-os-saga-replies` e ler e gravar na tabela

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
