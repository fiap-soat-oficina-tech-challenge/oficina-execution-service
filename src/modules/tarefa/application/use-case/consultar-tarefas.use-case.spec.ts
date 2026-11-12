import { NotFoundException } from '@nestjs/common';
import { ConsultarTarefasUseCase } from './consultar-tarefas.use-case';
import { RepositorioEmMemoria, tarefaDeExemplo } from './testes-de-apoio';

describe('ConsultarTarefasUseCase', () => {
  let repositorio: RepositorioEmMemoria;
  let useCase: ConsultarTarefasUseCase;

  beforeEach(async () => {
    repositorio = new RepositorioEmMemoria();
    useCase = new ConsultarTarefasUseCase(repositorio);
    await repositorio.criarSeNaoExistir(
      tarefaDeExemplo({ id: 'b', criadoEm: '2026-10-20T11:00:00.000Z' }),
    );
    await repositorio.criarSeNaoExistir(
      tarefaDeExemplo({ id: 'a', criadoEm: '2026-10-20T10:00:00.000Z' }),
    );
    await repositorio.criarSeNaoExistir(
      tarefaDeExemplo({ id: 'c', status: 'CONCLUIDA', tipo: 'REPARO' }),
    );
  });

  it('sem filtro devolve a fila: pendentes, mais antigas primeiro', async () => {
    const lista = await useCase.listar({});

    expect(lista.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('respeita o status pedido', async () => {
    const lista = await useCase.listar({ status: 'CONCLUIDA' });

    expect(lista.map((t) => t.id)).toEqual(['c']);
  });

  it('com OS, não força o status PENDENTE', async () => {
    const lista = await useCase.listar({ osId: tarefaDeExemplo().osId });

    expect(lista).toHaveLength(3);
  });

  it('busca uma tarefa pelo id', async () => {
    await expect(useCase.buscar('a')).resolves.toMatchObject({ id: 'a' });
  });

  it('tarefa inexistente vira 404', async () => {
    await expect(useCase.buscar('nao-existe')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
