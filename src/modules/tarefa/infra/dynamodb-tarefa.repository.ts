import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  type QueryCommandInput,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type {
  FiltroTarefas,
  MudancasTarefa,
  TarefaRepository,
} from '../domain/repository/tarefa.repository';
import type { StatusTarefa, Tarefa } from '../domain/tarefa';

/**
 * Tabela `oficina-execution-tarefas` (terraform/dynamodb.tf): chave `id`,
 * índice `por-status` (status + criadoEm) para a fila e `por-os` para as tarefas
 * de uma OS. `status` é palavra reservada do DynamoDB, daí os
 * ExpressionAttributeNames.
 */
export class DynamoDbTarefaRepository implements TarefaRepository {
  constructor(
    private readonly dynamo: DynamoDBDocumentClient,
    private readonly tabela: string,
  ) {}

  async criarSeNaoExistir(tarefa: Tarefa): Promise<boolean> {
    try {
      await this.dynamo.send(
        new PutCommand({
          TableName: this.tabela,
          Item: tarefa,
          ConditionExpression: 'attribute_not_exists(id)',
        }),
      );
      return true;
    } catch (erro) {
      if (erro instanceof ConditionalCheckFailedException) return false;
      throw erro;
    }
  }

  async buscarPorId(id: string): Promise<Tarefa | null> {
    const resposta = await this.dynamo.send(
      new GetCommand({ TableName: this.tabela, Key: { id } }),
    );
    return (resposta.Item as Tarefa | undefined) ?? null;
  }

  async listar(filtro: FiltroTarefas): Promise<Tarefa[]> {
    const nomes: Record<string, string> = {};
    const valores: Record<string, unknown> = {};
    const filtros: string[] = [];
    let chave: string;
    let indice: string;

    if (filtro.osId) {
      indice = 'por-os';
      chave = 'osId = :osId';
      valores[':osId'] = filtro.osId;
      if (filtro.status) {
        filtros.push('#status = :status');
        nomes['#status'] = 'status';
        valores[':status'] = filtro.status;
      }
    } else {
      indice = 'por-status';
      chave = '#status = :status';
      nomes['#status'] = 'status';
      valores[':status'] = filtro.status;
    }

    if (filtro.tipo) {
      filtros.push('#tipo = :tipo');
      nomes['#tipo'] = 'tipo';
      valores[':tipo'] = filtro.tipo;
    }

    const consulta: QueryCommandInput = {
      TableName: this.tabela,
      IndexName: indice,
      KeyConditionExpression: chave,
      ExpressionAttributeValues: valores,
      ...(Object.keys(nomes).length > 0 && { ExpressionAttributeNames: nomes }),
      ...(filtros.length > 0 && { FilterExpression: filtros.join(' AND ') }),
    };

    const tarefas: Tarefa[] = [];
    let inicio: Record<string, unknown> | undefined;
    do {
      const pagina = await this.dynamo.send(
        new QueryCommand({ ...consulta, ExclusiveStartKey: inicio }),
      );
      tarefas.push(...((pagina.Items ?? []) as Tarefa[]));
      inicio = pagina.LastEvaluatedKey;
    } while (inicio);

    // `por-status` já vem ordenado por criadoEm; `por-os` não tem chave de
    // ordenação, então a ordem é garantida aqui para os dois casos.
    return tarefas.sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
  }

  async atualizar(
    id: string,
    statusAtual: StatusTarefa,
    mudancas: MudancasTarefa,
  ): Promise<boolean> {
    const campos = Object.entries(mudancas).filter(([, v]) => v !== undefined);
    const nomes: Record<string, string> = {};
    const valores: Record<string, unknown> = { ':statusAtual': statusAtual };
    const atribuicoes = campos.map(([campo, valor]) => {
      nomes[`#${campo}`] = campo;
      valores[`:${campo}`] = valor;
      return `#${campo} = :${campo}`;
    });
    nomes['#status'] = 'status';

    try {
      await this.dynamo.send(
        new UpdateCommand({
          TableName: this.tabela,
          Key: { id },
          UpdateExpression: `SET ${atribuicoes.join(', ')}`,
          ConditionExpression: '#status = :statusAtual',
          ExpressionAttributeNames: nomes,
          ExpressionAttributeValues: valores,
        }),
      );
      return true;
    } catch (erro) {
      if (erro instanceof ConditionalCheckFailedException) return false;
      throw erro;
    }
  }
}
