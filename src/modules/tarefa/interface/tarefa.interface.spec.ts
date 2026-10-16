import { SQSClient } from '@aws-sdk/client-sqs';
import { ConsumidorSqs } from '../../../common/mensageria/consumidor-sqs';

jest.mock('../../../common/mensageria/consumidor-sqs');
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
  // O consumidor da fila é simulado: o que importa aqui é a ligação entre a
  // fila e o caso de uso, que o ComandosConsumer faz pelo construtor do
  // ConsumidorSqs (fila e função de processamento).
  const ConsumidorSqsSimulado = jest.mocked(ConsumidorSqs);

  beforeEach(() => ConsumidorSqsSimulado.mockClear());

  it('liga a fila de comandos ao caso de uso', async () => {
    process.env.EXECUTION_COMMANDS_QUEUE_URL =
      'https://fila/oficina-execution-commands';
    const sqs = new SQSClient({ region: 'us-east-1' });
    const receber = { execute: jest.fn().mockResolvedValue(undefined) };

    new ComandosConsumer(sqs, receber as unknown as ReceberComandoUseCase);

    const [cliente, fila, processar] = ConsumidorSqsSimulado.mock.calls[0];
    expect(cliente).toBe(sqs);
    expect(fila).toBe('https://fila/oficina-execution-commands');

    const envelope = criarEnvelope('IniciarDiagnostico', 'os-1', 'c', {});
    await processar(envelope);
    expect(receber.execute).toHaveBeenCalledWith(envelope);
  });

  it('inicia o consumo na subida e para no desligamento', () => {
    const consumer = new ComandosConsumer(
      new SQSClient({ region: 'us-east-1' }),
      { execute: jest.fn() } as unknown as ReceberComandoUseCase,
    );
    const consumidor = ConsumidorSqsSimulado.mock.instances[0];

    consumer.onApplicationBootstrap();
    consumer.onApplicationShutdown();

    expect(jest.mocked(consumidor).iniciar.mock.calls).toHaveLength(1);
    expect(jest.mocked(consumidor).parar.mock.calls).toHaveLength(1);
  });
});
