import type { StatusTarefa, Tarefa, TipoTarefa } from '../tarefa';

export const TAREFA_REPOSITORY = Symbol('TAREFA_REPOSITORY');

export interface FiltroTarefas {
  status?: StatusTarefa;
  tipo?: TipoTarefa;
  osId?: string;
}

export type MudancasTarefa = Pick<Tarefa, 'status' | 'atualizadoEm'> &
  Partial<Pick<Tarefa, 'iniciadoEm' | 'concluidoEm' | 'motivoFalha'>>;

export interface TarefaRepository {
  /** Grava a tarefa se o id ainda não existir; devolve false se já existia. */
  criarSeNaoExistir(tarefa: Tarefa): Promise<boolean>;

  buscarPorId(id: string): Promise<Tarefa | null>;

  /** Tarefas filtradas, mais antigas primeiro. */
  listar(filtro: FiltroTarefas): Promise<Tarefa[]>;

  /**
   * Aplica as mudanças só se o status ainda for `statusAtual`; devolve false se
   * outra ação mudou a tarefa antes.
   */
  atualizar(
    id: string,
    statusAtual: StatusTarefa,
    mudancas: MudancasTarefa,
  ): Promise<boolean>;
}
