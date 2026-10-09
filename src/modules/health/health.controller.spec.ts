import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { DescribeTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const dynamoMock = mockClient(DynamoDBClient);
  const controller = new HealthController(
    new DynamoDBClient({ region: 'us-east-1' }),
  );
  let logError: jest.SpyInstance;

  beforeEach(() => {
    dynamoMock.reset();
    process.env.DYNAMODB_TABLE_TAREFAS = 'oficina-execution-tarefas';
    logError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  it('liveness responde ok sem consultar a AWS', () => {
    expect(controller.live()).toEqual({ status: 'ok' });
    expect(dynamoMock.calls()).toHaveLength(0);
  });

  it('readiness responde ok quando a tabela responde', async () => {
    dynamoMock.on(DescribeTableCommand).resolves({});

    await expect(controller.ready()).resolves.toEqual({
      status: 'ok',
      dynamodb: 'up',
    });
    expect(
      dynamoMock.commandCalls(DescribeTableCommand)[0].args[0].input,
    ).toEqual({ TableName: 'oficina-execution-tarefas' });
  });

  it('readiness responde 503 genérico quando a tabela não responde', async () => {
    dynamoMock
      .on(DescribeTableCommand)
      .rejects(new Error('AccessDenied: role sem permissão'));

    const erro = await controller.ready().catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ServiceUnavailableException);
    const corpo = (erro as ServiceUnavailableException).getResponse();
    expect(corpo).toEqual({ status: 'error', dynamodb: 'down' });
    expect(JSON.stringify(corpo)).not.toContain('AccessDenied');
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining('AccessDenied'),
    );
  });

  it('readiness registra erros que não são Error', async () => {
    dynamoMock
      .on(DescribeTableCommand)
      // Rejeição com texto, e não Error, é exatamente o caso que o teste cobre.
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      .callsFake(() => Promise.reject('timeout'));

    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('timeout'));
  });
});
