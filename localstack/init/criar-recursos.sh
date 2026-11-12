#!/bin/bash
# Cria no LocalStack as mesmas filas e a mesma tabela de terraform/ (sqs.tf e
# dynamodb.tf), para o serviço rodar localmente sem AWS.
set -euo pipefail

awslocal sqs create-queue --queue-name oficina-execution-commands-dlq >/dev/null
DLQ_ARN=$(awslocal sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/oficina-execution-commands-dlq \
  --attribute-names QueueArn --query Attributes.QueueArn --output text)

awslocal sqs create-queue --queue-name oficina-execution-commands \
  --attributes "{\"VisibilityTimeout\":\"60\",\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"${DLQ_ARN}\\\",\\\"maxReceiveCount\\\":\\\"5\\\"}\"}" >/dev/null

# Fila de respostas da Saga (é do OS Service; aqui só para receber o que este
# serviço publica).
awslocal sqs create-queue --queue-name oficina-os-saga-replies >/dev/null

awslocal dynamodb create-table --table-name oficina-execution-tarefas \
  --billing-mode PAY_PER_REQUEST \
  --attribute-definitions AttributeName=id,AttributeType=S AttributeName=status,AttributeType=S \
    AttributeName=criadoEm,AttributeType=S AttributeName=osId,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --global-secondary-indexes '[
    {"IndexName":"por-status","KeySchema":[{"AttributeName":"status","KeyType":"HASH"},{"AttributeName":"criadoEm","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}},
    {"IndexName":"por-os","KeySchema":[{"AttributeName":"osId","KeyType":"HASH"}],"Projection":{"ProjectionType":"ALL"}}
  ]' >/dev/null

echo "recursos do Execution criados no LocalStack"
