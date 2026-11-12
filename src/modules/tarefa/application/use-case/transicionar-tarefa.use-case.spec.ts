import { ConflictException, NotFoundException } from '@nestjs/common';
import { TransicionarTarefaUseCase } from './transicionar-tarefa.use-case';
import {
  OS_ID,
  PublicadorEmMemoria,
  RepositorioEmMemoria,
  tarefaDeExemplo,
} from './testes-de-apoio';

const AGORA = new Date('2026-10-20T12:00:00.000Z');

describe('TransicionarTarefaUseCase', () => {
  let repositorio: RepositorioEmMemoria;
  let publicador: PublicadorEmMemoria;
  let useCase: TransicionarTarefaUseCase;

  beforeEach(() => {
    repositorio = new RepositorioEmMemoria();
    publicador = new PublicadorEmMemoria();
    useCase = new TransicionarTarefaUseCase(repositorio, publicador);
  });

  async function comTarefa(sobrescrever = {}) {
    const tarefa = tarefaDeExemplo(sobrescrever);
    await repositorio.criarSeNaoExistir(tarefa);
    return tarefa;
  }

  it('iniciar o diagnóstico avisa o orquestrador com o fluxo da OS', async () => {
    const tarefa = await comTarefa();

    const resultado = await useCase.execute(
      tarefa.id,
      'iniciar',
      undefined,
      AGORA,
    );

    expect(resultado).toMatchObject({
      status: 'EM_ANDAMENTO',
      iniciadoEm: '2026-10-20T12:00:00.000Z',
    });
    expect(publicador.publicadas).toEqual([
      expect.objectContaining({
        tipo: 'DiagnosticoIniciado',
        osId: OS_ID,
        correlationId: 'fluxo-da-os',
        payload: { iniciadoEm: '2026-10-20T12:00:00.000Z' },
      }),
    ]);
    expect((await repositorio.buscarPorId(tarefa.id))?.status).toBe(
      'EM_ANDAMENTO',
    );
  });

  it('iniciar o reparo não publica nada', async () => {
    const tarefa = await comTarefa({ tipo: 'REPARO' });

    await useCase.execute(tarefa.id, 'iniciar', undefined, AGORA);

    expect(publicador.publicadas).toHaveLength(0);
    expect((await repositorio.buscarPorId(tarefa.id))?.status).toBe(
      'EM_ANDAMENTO',
    );
  });

  it.each([
    ['DIAGNOSTICO', 'DiagnosticoConcluido'],
    ['REPARO', 'ReparoConcluido'],
  ] as const)('concluir %s publica %s', async (tipo, resposta) => {
    const tarefa = await comTarefa({ tipo, status: 'EM_ANDAMENTO' });

    const resultado = await useCase.execute(
      tarefa.id,
      'concluir',
      undefined,
      AGORA,
    );

    expect(resultado).toMatchObject({
      status: 'CONCLUIDA',
      concluidoEm: '2026-10-20T12:00:00.000Z',
    });
    expect(publicador.publicadas[0]).toMatchObject({
      tipo: resposta,
      payload: { concluidoEm: '2026-10-20T12:00:00.000Z' },
    });
  });

  it('falhar publica ExecucaoFalhou com a etapa e o motivo', async () => {
    const tarefa = await comTarefa({ tipo: 'REPARO', status: 'EM_ANDAMENTO' });

    const resultado = await useCase.execute(
      tarefa.id,
      'falhar',
      'Peça indisponível',
      AGORA,
    );

    expect(resultado).toMatchObject({
      status: 'FALHOU',
      motivoFalha: 'Peça indisponível',
    });
    expect(publicador.publicadas[0]).toMatchObject({
      tipo: 'ExecucaoFalhou',
      payload: { etapa: 'REPARO', motivo: 'Peça indisponível' },
    });
  });

  it('tarefa inexistente vira 404', async () => {
    await expect(
      useCase.execute('nao-existe', 'iniciar', undefined, AGORA),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('ação fora de ordem vira 409 e não publica', async () => {
    const tarefa = await comTarefa({ status: 'CONCLUIDA' });

    await expect(
      useCase.execute(tarefa.id, 'falhar', 'tarde demais', AGORA),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(publicador.publicadas).toHaveLength(0);
  });

  it('publica antes de gravar: se outra ação muda a tarefa no meio, vira 409', async () => {
    const tarefa = await comTarefa();
    jest.spyOn(repositorio, 'atualizar').mockResolvedValueOnce(false);

    await expect(
      useCase.execute(tarefa.id, 'iniciar', undefined, AGORA),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(publicador.publicadas).toHaveLength(1);
  });

  it('se a publicação falha, nada é gravado', async () => {
    const tarefa = await comTarefa();
    jest
      .spyOn(publicador, 'publicar')
      .mockRejectedValueOnce(new Error('SQS fora'));

    await expect(
      useCase.execute(tarefa.id, 'iniciar', undefined, AGORA),
    ).rejects.toThrow('SQS fora');
    expect((await repositorio.buscarPorId(tarefa.id))?.status).toBe('PENDENTE');
  });

  it('usa a data atual quando nenhuma é informada', async () => {
    const tarefa = await comTarefa();

    const resultado = await useCase.execute(tarefa.id, 'iniciar');

    expect(resultado.iniciadoEm).toEqual(expect.any(String));
  });
});
