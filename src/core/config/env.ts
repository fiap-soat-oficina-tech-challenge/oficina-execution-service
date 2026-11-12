import dotenv from 'dotenv';
import path from 'node:path';

// `quiet`: sem ele o dotenv imprime uma linha de texto puro na subida, e a
// primeira linha do log deixa de ser JSON. No contêiner não há .env (o
// .dockerignore o exclui) e as variáveis vêm do ambiente.
dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

/** Prefixo de todas as rotas do serviço; o Ingress compartilhado encaminha por ele. */
export const PREFIXO_ROTAS = 'execution';

function must(name: string): void {
  if (!process.env[name]) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
}

export function validateEnv(): void {
  must('NODE_ENV');
  must('APPLICATION_PORT');
  must('JWT_SECRET');

  // Mensageria e banco (terraform/): a fila consumida, a fila de respostas da
  // Saga e a tabela de tarefas.
  must('AWS_REGION');
  must('EXECUTION_COMMANDS_QUEUE_URL');
  must('SAGA_REPLIES_QUEUE_URL');
  must('DYNAMODB_TABLE_TAREFAS');
}
