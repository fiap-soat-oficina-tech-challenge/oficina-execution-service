output "fila_url" {
  description = "Fila consumida por este serviço."
  value       = aws_sqs_queue.principal.url
}

output "dlq_url" {
  value = aws_sqs_queue.dlq.url
}

output "ecr_repository_url" {
  description = "Destino do docker push no pipeline do serviço."
  value       = aws_ecr_repository.servico.repository_url
}

output "dynamodb_table_name" {
  value = aws_dynamodb_table.tarefas.name
}
