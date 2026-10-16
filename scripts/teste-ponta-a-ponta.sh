#!/usr/bin/env bash
# Teste de ponta a ponta do Execution com as dependências do docker compose
# (SQS e DynamoDB no LocalStack).
#
# Faz o papel do OS Service: publica os comandos na fila do Execution, lê as
# respostas na fila da Saga e chama as rotas REST como o mecânico.
#
# Uso (na raiz do repositório, com o .env criado a partir do .env.example):
#   docker compose up -d --build
#   bash scripts/teste-ponta-a-ponta.sh
set -uo pipefail

API=http://localhost:3002/execution
FILA_COMANDOS=http://localhost:4566/000000000000/oficina-execution-commands
FILA_RESPOSTAS=http://localhost:4566/000000000000/oficina-os-saga-replies
JWT_SECRET=$(grep '^JWT_SECRET=' .env | cut -d= -f2-)

FALHAS=0
VERIFICACOES=0

ok()    { VERIFICACOES=$((VERIFICACOES + 1)); echo "  ok   $1"; }
falha() { VERIFICACOES=$((VERIFICACOES + 1)); FALHAS=$((FALHAS + 1)); echo "  FALHA $1"; }
confere() { if [ "$2" = "$3" ]; then ok "$1"; else falha "$1 (esperado '$3', veio '$2')"; fi; }
uuid()  { python3 -c "import uuid;print(uuid.uuid4())"; }
# Lê um valor do JSON da entrada padrão pelo caminho de chaves, por exemplo
# `campo itens 0 nome`. Número indexa lista; o resto é chave de objeto.
campo() {
  python3 -c '
import json, sys
valor = json.load(sys.stdin)
for chave in sys.argv[1:]:
    valor = valor[int(chave)] if isinstance(valor, list) else valor[chave]
print(valor)' "$@" 2>/dev/null
}
awslocal() { docker compose exec -T localstack awslocal "$@"; }

# JWT HS256 assinado com o mesmo segredo do serviço.
jwt() {
  node -e '
    const c = require("node:crypto");
    const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const corpo = { ...JSON.parse(process.argv[2]), exp: Math.floor(Date.now() / 1000) + 3600 };
    const dados = b({ alg: "HS256", typ: "JWT" }) + "." + b(corpo);
    console.log(dados + "." + c.createHmac("sha256", process.argv[1]).update(dados).digest("base64url"));
  ' "$JWT_SECRET" "$1"
}
TOKEN_MECANICO=$(jwt '{"sub":"func-1","email":"mecanico@oficina.com"}')
TOKEN_CLIENTE=$(jwt '{"sub":"cli-1","tipo":"cliente","cpf":"12345678909","nome":"Maria"}')

# Publica um comando como o OS Service faria.
comando() {
  local tipo="$1" os="$2" payload="$3"
  local corpo
  corpo=$(python3 -c '
import json, sys, uuid, datetime
print(json.dumps({"messageId": str(uuid.uuid4()), "correlationId": "fluxo-" + sys.argv[2][:8],
  "osId": sys.argv[2], "tipo": sys.argv[1],
  "ocorridoEm": datetime.datetime.now(datetime.timezone.utc).isoformat(),
  "payload": json.loads(sys.argv[3])}))' "$tipo" "$os" "$payload")
  awslocal sqs send-message --queue-url "$FILA_COMANDOS" --message-body "$corpo" >/dev/null
}

# Espera a próxima resposta da Saga e imprime "tipo|osId|correlationId|payload".
resposta() {
  local saida
  for _ in 1 2 3 4 5 6; do
    saida=$(awslocal sqs receive-message --queue-url "$FILA_RESPOSTAS" --wait-time-seconds 5 \
      --max-number-of-messages 1 --output json)
    if [ -n "$saida" ] && echo "$saida" | grep -q ReceiptHandle; then
      local handle
      handle=$(echo "$saida" | campo Messages 0 ReceiptHandle)
      awslocal sqs delete-message --queue-url "$FILA_RESPOSTAS" --receipt-handle "$handle"
      echo "$saida" | python3 -c '
import json, sys
m = json.loads(json.load(sys.stdin)["Messages"][0]["Body"])
print("|".join([m["tipo"], m["osId"], m["correlationId"], json.dumps(m["payload"], sort_keys=True)]))'
      return
    fi
  done
  echo "nenhuma"
}

# Espera o serviço terminar de consumir a fila de comandos: nenhuma mensagem
# esperando nem em processamento. Usado antes de conferir que um comando não
# gerou efeito (comando repetido, tipo de outra fila).
espera_fila_de_comandos_vazia() {
  local esperando em_processamento
  for _ in $(seq 1 30); do
    read -r esperando em_processamento <<<"$(awslocal sqs get-queue-attributes \
      --queue-url "$FILA_COMANDOS" \
      --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible \
      --query '[Attributes.ApproximateNumberOfMessages, Attributes.ApproximateNumberOfMessagesNotVisible]' \
      --output text)"
    [ "$esperando" = 0 ] && [ "$em_processamento" = 0 ] && return
    sleep 1
  done
  falha "a fila de comandos não esvaziou em 30 s"
}

# Fila de respostas vazia (nenhuma resposta a mais do que o esperado). A espera
# de 3 s é a janela em que uma resposta indevida apareceria.
sem_resposta() {
  local r
  r=$(awslocal sqs receive-message --queue-url "$FILA_RESPOSTAS" --wait-time-seconds 3 --output json)
  if echo "$r" | grep -q ReceiptHandle; then falha "$1 (chegou resposta a mais)"; else ok "$1"; fi
}

VEICULO='{"placa": "ABC1D23", "marca": "Fiat", "modelo": "Uno", "ano": 2020}'
payload_diagnostico() { echo "{\"codigo\": \"$1\", \"veiculo\": $VEICULO, \"observacoes\": \"Barulho no motor\"}"; }
payload_reparo() {
  echo "{\"codigo\": \"$1\", \"veiculo\": $VEICULO,
    \"servicos\": [{\"nome\": \"Troca de óleo\", \"quantidade\": 1}],
    \"itens\": [{\"nome\": \"Filtro de óleo\", \"quantidade\": 2}]}"
}

# Espera a tarefa da OS aparecer (o consumo é assíncrono) e imprime o campo pedido.
tarefa_da_os() {
  local os="$1" tipo="$2" campo_="$3" valor
  for _ in $(seq 1 10); do
    valor=$(curl -s "$API/tarefas?osId=$os&tipo=$tipo" -H "Authorization: Bearer $TOKEN_MECANICO" |
      campo 0 "$campo_")
    [ -n "$valor" ] && { echo "$valor"; return; }
    sleep 1
  done
}

acao() {
  local corpo="${3:-}"
  [ -z "$corpo" ] && corpo='{}'
  curl -s -o /dev/null -w '%{http_code}' -X POST "$API/tarefas/$1/$2" \
    -H "Authorization: Bearer $TOKEN_MECANICO" -H 'Content-Type: application/json' -d "$corpo"
}

http_status() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

echo "== Preparação"
confere "serviço pronto (tabela acessível)" "$(http_status "$API/health/ready")" 200
awslocal sqs purge-queue --queue-url "$FILA_RESPOSTAS" >/dev/null 2>&1

echo "== 1. Diagnóstico: comando → fila do mecânico → iniciar → concluir"
OS1=$(uuid)
comando IniciarDiagnostico "$OS1" "$(payload_diagnostico OS-2026-000101)"
T1=$(tarefa_da_os "$OS1" DIAGNOSTICO id)
confere "IniciarDiagnostico cria a tarefa PENDENTE" "$(tarefa_da_os "$OS1" DIAGNOSTICO status)" PENDENTE
confere "a tarefa aparece na fila (GET /tarefas sem filtro)" \
  "$(curl -s "$API/tarefas" -H "Authorization: Bearer $TOKEN_MECANICO" | python3 -c "import json,sys;print(any(t['id']=='$T1' for t in json.load(sys.stdin)))")" True
comando IniciarDiagnostico "$OS1" "$(payload_diagnostico OS-2026-000101)"
espera_fila_de_comandos_vazia
confere "comando repetido não cria outra tarefa" \
  "$(curl -s "$API/tarefas?osId=$OS1" -H "Authorization: Bearer $TOKEN_MECANICO" | python3 -c 'import json,sys;print(len(json.load(sys.stdin)))')" 1
sem_resposta "receber o comando não publica resposta (a Saga espera o mecânico)"

confere "sem token é 401" "$(http_status "$API/tarefas")" 401
confere "token de cliente é 403" "$(http_status "$API/tarefas" -H "Authorization: Bearer $TOKEN_CLIENTE")" 403
confere "concluir antes de iniciar é 409" "$(acao "$T1" concluir)" 409
sem_resposta "ação recusada não publica nada"

confere "iniciar responde 200" "$(acao "$T1" iniciar)" 200
R=$(resposta); IFS='|' read -r TIPO OS_R CORR PAYLOAD <<<"$R"
confere "→ DiagnosticoIniciado" "$TIPO" DiagnosticoIniciado
confere "resposta com o osId e o correlationId do comando" "$OS_R|$CORR" "$OS1|fluxo-${OS1:0:8}"
confere "concluir responde 200" "$(acao "$T1" concluir)" 200
R=$(resposta); IFS='|' read -r TIPO _ _ PAYLOAD <<<"$R"
confere "→ DiagnosticoConcluido com concluidoEm" "$TIPO $(echo "$PAYLOAD" | campo concluidoEm | cut -c1-4)" "DiagnosticoConcluido 2026"
confere "tarefa CONCLUIDA" "$(tarefa_da_os "$OS1" DIAGNOSTICO status)" CONCLUIDA
confere "falhar tarefa concluída é 409 (não cancela OS que já passou da etapa)" \
  "$(acao "$T1" falhar '{"motivo": "tarde demais"}')" 409

echo "== 2. Reparo: comando → iniciar (sem resposta) → concluir"
comando IniciarReparo "$OS1" "$(payload_reparo OS-2026-000101)"
T2=$(tarefa_da_os "$OS1" REPARO id)
confere "IniciarReparo cria a tarefa de reparo com serviços e itens" \
  "$(curl -s "$API/tarefas/$T2" -H "Authorization: Bearer $TOKEN_MECANICO" | campo itens 0 nome)" "Filtro de óleo"
confere "iniciar o reparo responde 200" "$(acao "$T2" iniciar)" 200
sem_resposta "iniciar o reparo não publica (a OS já está em execução)"
acao "$T2" concluir >/dev/null
R=$(resposta); IFS='|' read -r TIPO _ _ _ <<<"$R"
confere "concluir o reparo → ReparoConcluido" "$TIPO" ReparoConcluido

echo "== 3. Falhas registradas pelo mecânico"
OS3=$(uuid)
comando IniciarDiagnostico "$OS3" "$(payload_diagnostico OS-2026-000103)"
T3=$(tarefa_da_os "$OS3" DIAGNOSTICO id)
confere "falhar sem motivo é 400" "$(acao "$T3" falhar '{}')" 400
acao "$T3" falhar '{"motivo": "Veículo não liga"}' >/dev/null
R=$(resposta); IFS='|' read -r TIPO _ _ PAYLOAD <<<"$R"
confere "falha no diagnóstico → ExecucaoFalhou (DIAGNOSTICO)" \
  "$TIPO $(echo "$PAYLOAD" | campo etapa) $(echo "$PAYLOAD" | campo motivo)" \
  "ExecucaoFalhou DIAGNOSTICO Veículo não liga"

OS4=$(uuid)
comando IniciarReparo "$OS4" "$(payload_reparo OS-2026-000104)"
T4=$(tarefa_da_os "$OS4" REPARO id)
acao "$T4" iniciar >/dev/null
acao "$T4" falhar '{"motivo": "Peça indisponível no fornecedor"}' >/dev/null
R=$(resposta); IFS='|' read -r TIPO _ _ PAYLOAD <<<"$R"
confere "falha no reparo → ExecucaoFalhou (REPARO), e o OS estorna" \
  "$TIPO $(echo "$PAYLOAD" | campo etapa)" "ExecucaoFalhou REPARO"
confere "tarefa FALHOU com o motivo" "$(tarefa_da_os "$OS4" REPARO motivoFalha)" "Peça indisponível no fornecedor"

echo "== 4. Comandos inválidos e desconhecidos"
OS5=$(uuid)
comando IniciarDiagnostico "$OS5" '{"codigo": "OS-2026-000105"}'
R=$(resposta); IFS='|' read -r TIPO _ _ PAYLOAD <<<"$R"
confere "comando sem veículo → ExecucaoFalhou COMANDO_INVALIDO" \
  "$TIPO $(echo "$PAYLOAD" | campo motivo | cut -d: -f1)" "ExecucaoFalhou COMANDO_INVALIDO"
comando IniciarReparo "$(uuid)" "{\"codigo\": \"OS-2026-000106\", \"veiculo\": $VEICULO, \"servicos\": [], \"itens\": []}"
R=$(resposta); IFS='|' read -r TIPO _ _ PAYLOAD <<<"$R"
confere "reparo sem serviços nem itens → ExecucaoFalhou (REPARO)" \
  "$TIPO $(echo "$PAYLOAD" | campo etapa)" "ExecucaoFalhou REPARO"
comando GerarOrcamento "$(uuid)" '{}'
espera_fila_de_comandos_vazia
sem_resposta "tipo que não é desta fila é descartado sem resposta"

echo
echo "== Resultado: $((VERIFICACOES - FALHAS))/$VERIFICACOES verificações ok"
[ "$FALHAS" -eq 0 ]
