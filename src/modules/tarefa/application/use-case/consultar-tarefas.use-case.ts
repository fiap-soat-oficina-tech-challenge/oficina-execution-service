import { Inject, Injectable } from '@nestjs/common';
import { TarefaNaoEncontradaError } from '../../domain/errors';
import {
  TAREFA_REPOSITORY,
  type FiltroTarefas,
  type TarefaRepository,
} from '../../domain/repository/tarefa.repository';
import type { Tarefa } from '../../domain/tarefa';
import { traduzirErroDominio } from '../shared/traduzir-erro-dominio';

@Injectable()
export class ConsultarTarefasUseCase {
  constructor(
    @Inject(TAREFA_REPOSITORY)
    private readonly repositorio: TarefaRepository,
  ) {}

  /**
   * Sem filtro de status nem de OS, devolve a fila: as tarefas PENDENTES, mais
   * antigas primeiro.
   */
  listar(filtro: FiltroTarefas): Promise<Tarefa[]> {
    const efetivo =
      filtro.status || filtro.osId
        ? filtro
        : { ...filtro, status: 'PENDENTE' as const };
    return this.repositorio.listar(efetivo);
  }

  async buscar(id: string): Promise<Tarefa> {
    try {
      const tarefa = await this.repositorio.buscarPorId(id);
      if (!tarefa) throw new TarefaNaoEncontradaError(id);
      return tarefa;
    } catch (erro) {
      throw traduzirErroDominio(erro);
    }
  }
}
