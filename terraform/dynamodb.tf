# Banco próprio do Execution (DynamoDB, o NoSQL do projeto): as tarefas de
# diagnóstico e de reparo.
#
# Chave `id`: gerado de forma determinística a partir da OS e do tipo da tarefa
# (UUID v5), o que torna a criação idempotente com um PutItem condicional
# (attribute_not_exists). Índices:
#   - por-status: a fila do mecânico (status + criadoEm, mais antigas primeiro);
#   - por-os:     as tarefas de uma OS.
# `status` é palavra reservada do DynamoDB: nas expressões, usar
# ExpressionAttributeNames.

resource "aws_dynamodb_table" "tarefas" {
  name         = "oficina-execution-tarefas"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  attribute {
    name = "criadoEm"
    type = "S"
  }

  attribute {
    name = "osId"
    type = "S"
  }

  global_secondary_index {
    name            = "por-status"
    hash_key        = "status"
    range_key       = "criadoEm"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "por-os"
    hash_key        = "osId"
    projection_type = "ALL"
  }
}
