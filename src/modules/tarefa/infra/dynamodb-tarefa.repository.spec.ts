import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { tarefaDeExemplo } from '../application/use-case/testes-de-apoio';
import { DynamoDbTarefaRepository } from './dynamodb-tarefa.repository';

const TABELA = 'oficina-execution-tarefas';

describe('DynamoDbTarefaRepository', () => {
  const dynamoMock = mockClient(DynamoDBDocumentClient);
  const repositorio = new DynamoDbTarefaRepository(
    DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' })),
    TABELA,
  );
  const conflito = new ConditionalCheckFailedException({
    message: 'The conditional request failed',
    $metadata: {},
  });

  beforeEach(() => dynamoMock.reset());

  describe('criarSeNaoExistir', () => {
    it('grava com a condição de id inexistente', async () => {
      dynamoMock.on(PutCommand).resolves({});
      const tarefa = tarefaDeExemplo();

      await expect(repositorio.criarSeNaoExistir(tarefa)).resolves.toBe(true);
      expect(dynamoMock.commandCalls(PutCommand)[0].args[0].input).toEqual({
        TableName: TABELA,
        Item: tarefa,
        ConditionExpression: 'attribute_not_exists(id)',
      });
    });

    it('devolve false quando o id já existe', async () => {
      dynamoMock.on(PutCommand).rejects(conflito);

      await expect(
        repositorio.criarSeNaoExistir(tarefaDeExemplo()),
      ).resolves.toBe(false);
    });

    it('repassa outros erros', async () => {
      dynamoMock.on(PutCommand).rejects(new Error('throttling'));

      await expect(
        repositorio.criarSeNaoExistir(tarefaDeExemplo()),
      ).rejects.toThrow('throttling');
    });
  });

  describe('buscarPorId', () => {
    it('devolve a tarefa', async () => {
      dynamoMock.on(GetCommand).resolves({ Item: tarefaDeExemplo() });

      await expect(repositorio.buscarPorId('x')).resolves.toMatchObject({
        codigo: 'OS-2026-000001',
      });
      expect(dynamoMock.commandCalls(GetCommand)[0].args[0].input).toEqual({
        TableName: TABELA,
        Key: { id: 'x' },
      });
    });

    it('devolve null quando não existe', async () => {
      dynamoMock.on(GetCommand).resolves({});

      await expect(repositorio.buscarPorId('x')).resolves.toBeNull();
    });
  });

  describe('listar', () => {
    it('a fila usa o índice por-status e percorre todas as páginas', async () => {
      dynamoMock
        .on(QueryCommand)
        .resolvesOnce({
          Items: [
            tarefaDeExemplo({ id: 'b', criadoEm: '2026-10-20T11:00:00.000Z' }),
          ],
          LastEvaluatedKey: { id: 'b' },
        })
        .resolvesOnce({
          Items: [
            tarefaDeExemplo({ id: 'a', criadoEm: '2026-10-20T10:00:00.000Z' }),
          ],
        });

      const lista = await repositorio.listar({
        status: 'PENDENTE',
        tipo: 'DIAGNOSTICO',
      });

      expect(lista.map((t) => t.id)).toEqual(['a', 'b']);
      const [primeira, segunda] = dynamoMock.commandCalls(QueryCommand);
      expect(primeira.args[0].input).toEqual({
        TableName: TABELA,
        IndexName: 'por-status',
        KeyConditionExpression: '#status = :status',
        FilterExpression: '#tipo = :tipo',
        ExpressionAttributeNames: { '#status': 'status', '#tipo': 'tipo' },
        ExpressionAttributeValues: {
          ':status': 'PENDENTE',
          ':tipo': 'DIAGNOSTICO',
        },
        ExclusiveStartKey: undefined,
      });
      expect(segunda.args[0].input.ExclusiveStartKey).toEqual({ id: 'b' });
    });

    it('as tarefas de uma OS usam o índice por-os, com status como filtro', async () => {
      dynamoMock.on(QueryCommand).resolves({ Items: [] });

      await repositorio.listar({ osId: 'os-1', status: 'CONCLUIDA' });

      expect(
        dynamoMock.commandCalls(QueryCommand)[0].args[0].input,
      ).toMatchObject({
        IndexName: 'por-os',
        KeyConditionExpression: 'osId = :osId',
        FilterExpression: '#status = :status',
        ExpressionAttributeValues: { ':osId': 'os-1', ':status': 'CONCLUIDA' },
      });
    });

    it('OS sem outros filtros não manda nomes nem filtro', async () => {
      dynamoMock.on(QueryCommand).resolves({});

      await expect(repositorio.listar({ osId: 'os-1' })).resolves.toEqual([]);
      const input = dynamoMock.commandCalls(QueryCommand)[0].args[0].input;
      expect(input.ExpressionAttributeNames).toBeUndefined();
      expect(input.FilterExpression).toBeUndefined();
    });
  });

  describe('atualizar', () => {
    it('aplica as mudanças só se o status ainda for o esperado', async () => {
      dynamoMock.on(UpdateCommand).resolves({});

      await expect(
        repositorio.atualizar('x', 'PENDENTE', {
          status: 'EM_ANDAMENTO',
          atualizadoEm: 't',
          iniciadoEm: 't',
          motivoFalha: undefined,
        }),
      ).resolves.toBe(true);
      expect(dynamoMock.commandCalls(UpdateCommand)[0].args[0].input).toEqual({
        TableName: TABELA,
        Key: { id: 'x' },
        UpdateExpression:
          'SET #status = :status, #atualizadoEm = :atualizadoEm, #iniciadoEm = :iniciadoEm',
        ConditionExpression: '#status = :statusAtual',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#atualizadoEm': 'atualizadoEm',
          '#iniciadoEm': 'iniciadoEm',
        },
        ExpressionAttributeValues: {
          ':statusAtual': 'PENDENTE',
          ':status': 'EM_ANDAMENTO',
          ':atualizadoEm': 't',
          ':iniciadoEm': 't',
        },
      });
    });

    it('devolve false quando outra ação mudou a tarefa', async () => {
      dynamoMock.on(UpdateCommand).rejects(conflito);

      await expect(
        repositorio.atualizar('x', 'PENDENTE', {
          status: 'EM_ANDAMENTO',
          atualizadoEm: 't',
        }),
      ).resolves.toBe(false);
    });

    it('repassa outros erros', async () => {
      dynamoMock.on(UpdateCommand).rejects(new Error('throttling'));

      await expect(
        repositorio.atualizar('x', 'PENDENTE', {
          status: 'EM_ANDAMENTO',
          atualizadoEm: 't',
        }),
      ).rejects.toThrow('throttling');
    });
  });
});
