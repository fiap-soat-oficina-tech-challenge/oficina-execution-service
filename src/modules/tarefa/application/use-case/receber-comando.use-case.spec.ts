import { criarEnvelope } from '../../../../common/mensageria/envelope';
import { idDaTarefa } from '../../domain/id-da-tarefa';
import { ReceberComandoUseCase } from './receber-comando.use-case';
import {
  OS_ID,
  PublicadorEmMemoria,
  RepositorioEmMemoria,
} from './testes-de-apoio';

const AGORA = new Date('2026-10-20T10:00:00.000Z');
const VEICULO = { placa: 'ABC1D23', marca: 'Fiat', modelo: 'Uno', ano: 2020 };

describe('ReceberComandoUseCase', () => {
  let repositorio: RepositorioEmMemoria;
  let publicador: PublicadorEmMemoria;
  let useCase: ReceberComandoUseCase;

  beforeEach(() => {
    repositorio = new RepositorioEmMemoria();
    publicador = new PublicadorEmMemoria();
    useCase = new ReceberComandoUseCase(repositorio, publicador);
  });

  function comando(tipo: string, payload: Record<string, unknown>) {
    return criarEnvelope(tipo, OS_ID, 'fluxo-da-os', payload, AGORA);
  }

  it('IniciarDiagnostico coloca a tarefa de diagnóstico na fila, sem responder', async () => {
    await useCase.execute(
      comando('IniciarDiagnostico', {
        codigo: 'OS-2026-000001',
        veiculo: VEICULO,
        observacoes: 'Barulho no motor',
      }),
      AGORA,
    );

    expect(repositorio.tarefas.get(idDaTarefa(OS_ID, 'DIAGNOSTICO'))).toEqual({
      id: idDaTarefa(OS_ID, 'DIAGNOSTICO'),
      osId: OS_ID,
      codigo: 'OS-2026-000001',
      tipo: 'DIAGNOSTICO',
      status: 'PENDENTE',
      veiculo: VEICULO,
      observacoes: 'Barulho no motor',
      servicos: [],
      itens: [],
      correlationId: 'fluxo-da-os',
      criadoEm: '2026-10-20T10:00:00.000Z',
      atualizadoEm: '2026-10-20T10:00:00.000Z',
    });
    expect(publicador.publicadas).toHaveLength(0);
  });

  it('IniciarReparo guarda os serviços e itens a executar', async () => {
    await useCase.execute(
      comando('IniciarReparo', {
        codigo: 'OS-2026-000001',
        veiculo: VEICULO,
        servicos: [{ nome: 'Troca de óleo', quantidade: 1, extra: 'ignorado' }],
        itens: [{ nome: 'Filtro', quantidade: 2 }],
      }),
      AGORA,
    );

    const tarefa = repositorio.tarefas.get(idDaTarefa(OS_ID, 'REPARO'));
    expect(tarefa).toMatchObject({
      tipo: 'REPARO',
      status: 'PENDENTE',
      observacoes: null,
      servicos: [{ nome: 'Troca de óleo', quantidade: 1 }],
      itens: [{ nome: 'Filtro', quantidade: 2 }],
    });
  });

  it('comando repetido não cria uma segunda tarefa', async () => {
    const envelope = comando('IniciarDiagnostico', {
      codigo: 'OS-2026-000001',
      veiculo: VEICULO,
    });

    await useCase.execute(envelope, AGORA);
    await useCase.execute(envelope, new Date('2026-10-20T11:00:00.000Z'));

    expect(repositorio.tarefas.size).toBe(1);
    expect(
      repositorio.tarefas.get(idDaTarefa(OS_ID, 'DIAGNOSTICO'))?.criadoEm,
    ).toBe('2026-10-20T10:00:00.000Z');
  });

  it.each([
    ['sem código', { veiculo: VEICULO }, 'codigo ausente'],
    [
      'veículo incompleto',
      { codigo: 'OS-1', veiculo: { placa: 'ABC1D23' } },
      'veiculo',
    ],
    [
      'serviços que não são lista',
      { codigo: 'OS-1', veiculo: VEICULO, servicos: 'x' },
      'servicos deve ser uma lista',
    ],
    [
      'item com quantidade inválida',
      {
        codigo: 'OS-1',
        veiculo: VEICULO,
        itens: [{ nome: 'Filtro', quantidade: 0 }],
      },
      'itens precisa',
    ],
  ])(
    'diagnóstico %s responde ExecucaoFalhou e não cria tarefa',
    async (_caso, payload, motivo) => {
      await useCase.execute(comando('IniciarDiagnostico', payload), AGORA);

      expect(repositorio.tarefas.size).toBe(0);
      expect(publicador.publicadas).toHaveLength(1);
      expect(publicador.publicadas[0]).toMatchObject({
        tipo: 'ExecucaoFalhou',
        osId: OS_ID,
        correlationId: 'fluxo-da-os',
        payload: { etapa: 'DIAGNOSTICO' },
      });
      expect(
        (publicador.publicadas[0].payload as { motivo: string }).motivo,
      ).toContain(motivo);
    },
  );

  it('reparo sem serviços nem itens responde ExecucaoFalhou na etapa REPARO', async () => {
    await useCase.execute(
      comando('IniciarReparo', { codigo: 'OS-1', veiculo: VEICULO }),
      AGORA,
    );

    expect(repositorio.tarefas.size).toBe(0);
    expect(publicador.publicadas[0]).toMatchObject({
      tipo: 'ExecucaoFalhou',
      payload: { etapa: 'REPARO' },
    });
  });

  it('descarta comando que não pertence a esta fila', async () => {
    await useCase.execute(comando('GerarOrcamento', {}), AGORA);

    expect(repositorio.tarefas.size).toBe(0);
    expect(publicador.publicadas).toHaveLength(0);
  });

  it('usa a data atual quando nenhuma é informada', async () => {
    await useCase.execute(
      comando('IniciarDiagnostico', { codigo: 'OS-1', veiculo: VEICULO }),
    );

    expect(repositorio.tarefas.size).toBe(1);
  });
});
