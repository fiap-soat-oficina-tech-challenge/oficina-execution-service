import { SQSClient } from '@aws-sdk/client-sqs';
import { ConsumidorSqs } from '../../../common/mensageria/consumidor-sqs';
import { criarEnvelope } from '../../../common/mensageria/envelope';
import { ConsultarTarefasUseCase } from '../application/use-case/consultar-tarefas.use-case';
import { ReceberComandoUseCase } from '../application/use-case/receber-comando.use-case';
import { TransicionarTarefaUseCase } from '../application/use-case/transicionar-tarefa.use-case';
import { ComandosConsumer } from './consumer/comandos.consumer';
import { TarefaController } from './controller/tarefa.controller';

describe('TarefaController', () => {
  const consultar = {
    listar: jest.fn().mockResolvedValue([]),
    buscar: jest.fn().mockResolvedValue({ id: 't1' }),
  };
  const transicionar = { execute: jest.fn().mockResolvedValue({ id: 't1' }) };
  const controller = new TarefaController(
    consultar as unknown as ConsultarTarefasUseCase,
    transicionar as unknown as TransicionarTarefaUseCase,
  );

  beforeEach(() => jest.clearAllMocks());

  it('repassa o filtro da listagem', async () => {
    await controller.listar({ status: 'PENDENTE', tipo: 'REPARO' });
    expect(consultar.listar).toHaveBeenCalledWith({
      status: 'PENDENTE',
      tipo: 'REPARO',
    });
  });

  it('busca pelo id', async () => {
    await expect(controller.buscar('t1')).resolves.toEqual({ id: 't1' });
  });

  it('cada rota de ação chama a transição correspondente', async () => {
    await controller.iniciar('t1');
    await controller.concluir('t1');
    await controller.falhar('t1', { motivo: 'Peça indisponível' });

    expect(transicionar.execute.mock.calls).toEqual([
      ['t1', 'iniciar'],
      ['t1', 'concluir'],
      ['t1', 'falhar', 'Peça indisponível'],
    ]);
  });
});

describe('ComandosConsumer', () => {
  afterEach(() => jest.restoreAllMocks());

  it('inicia o consumo da fila de comandos na subida e para no desligamento', async () => {
    process.env.EXECUTION_COMMANDS_QUEUE_URL =
      'https://fila/oficina-execution-commands';
    const iniciar = jest
      .spyOn(ConsumidorSqs.prototype, 'iniciar')
      .mockResolvedValue(undefined);
    const parar = jest.spyOn(ConsumidorSqs.prototype, 'parar');
    const receber = { execute: jest.fn().mockResolvedValue(undefined) };

    const consumer = new ComandosConsumer(
      new SQSClient({ region: 'us-east-1' }),
      receber as unknown as ReceberComandoUseCase,
    );
    consumer.onApplicationBootstrap();
    consumer.onApplicationShutdown();

    expect(iniciar).toHaveBeenCalledTimes(1);
    expect(parar).toHaveBeenCalledTimes(1);

    const processar = (
      consumer as unknown as {
        consumidor: { processar: (e: unknown) => Promise<void> };
      }
    ).consumidor.processar;
    const envelope = criarEnvelope('IniciarDiagnostico', 'os-1', 'c', {});
    await processar(envelope);
    expect(receber.execute).toHaveBeenCalledWith(envelope);
  });
});
