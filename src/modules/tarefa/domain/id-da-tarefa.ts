import { createHash } from 'node:crypto';
import type { TipoTarefa } from './tarefa';

/** Namespace fixo do projeto para os UUIDs v5 das tarefas. Não alterar. */
export const NAMESPACE_TAREFAS = 'b6f1d3a2-6c1e-4b7a-9f2d-3e8a5c4b1d07';

/**
 * UUID v5 (RFC 4122, SHA-1) de um nome dentro de um namespace: o mesmo par
 * sempre gera o mesmo UUID.
 */
export function uuidV5(nome: string, namespace: string): string {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1')
    .update(Buffer.concat([ns, Buffer.from(nome, 'utf8')]))
    .digest();

  hash[6] = (hash[6] & 0x0f) | 0x50; // versão 5
  hash[8] = (hash[8] & 0x3f) | 0x80; // variante RFC 4122

  const hex = hash.subarray(0, 16).toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

/**
 * Id determinístico da tarefa: uma OS tem no máximo uma tarefa de cada tipo.
 * Com o id derivado da OS e do tipo, um comando entregue duas vezes pelo SQS
 * tenta gravar o mesmo id, e o PutItem condicional recusa a segunda gravação.
 */
export function idDaTarefa(osId: string, tipo: TipoTarefa): string {
  return uuidV5(`${osId}:${tipo}`, NAMESPACE_TAREFAS);
}
