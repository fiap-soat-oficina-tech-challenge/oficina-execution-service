import type { Envelope } from '../../../../common/mensageria/envelope';
import type {
  FiltroTarefas,
  MudancasTarefa,
  TarefaRepository,
} from '../../domain/repository/tarefa.repository';
import type { StatusTarefa, Tarefa } from '../../domain/tarefa';
import type { PublicadorRespostas } from '../ports/publicador-respostas';

/** Repositório em memória com o mesmo comportamento condicional do DynamoDB. */
export class RepositorioEmMemoria implements TarefaRepository {
  readonly tarefas = new Map<string, Tarefa>();

  criarSeNaoExistir(tarefa: Tarefa): Promise<boolean> {
    if (this.tarefas.has(tarefa.id)) return Promise.resolve(false);
    this.tarefas.set(tarefa.id, { ...tarefa });
    return Promise.resolve(true);
  }

  buscarPorId(id: string): Promise<Tarefa | null> {
    const tarefa = this.tarefas.get(id);
    return Promise.resolve(tarefa ? { ...tarefa } : null);
  }

  listar(filtro: FiltroTarefas): Promise<Tarefa[]> {
    return Promise.resolve(
      [...this.tarefas.values()]
        .filter((t) => !filtro.status || t.status === filtro.status)
        .filter((t) => !filtro.tipo || t.tipo === filtro.tipo)
        .filter((t) => !filtro.osId || t.osId === filtro.osId)
        .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm)),
    );
  }

  atualizar(
    id: string,
    statusAtual: StatusTarefa,
    mudancas: MudancasTarefa,
  ): Promise<boolean> {
    const tarefa = this.tarefas.get(id);
    if (!tarefa || tarefa.status !== statusAtual) return Promise.resolve(false);
    this.tarefas.set(id, { ...tarefa, ...mudancas });
    return Promise.resolve(true);
  }
}

export class PublicadorEmMemoria implements PublicadorRespostas {
  readonly publicadas: Envelope<unknown>[] = [];

  publicar(envelope: Envelope<unknown>): Promise<void> {
    this.publicadas.push(envelope);
    return Promise.resolve();
  }
}

export const OS_ID = 'c56f9df1-b6f7-4625-84ce-a27706664ae5';

export function tarefaDeExemplo(sobrescrever: Partial<Tarefa> = {}): Tarefa {
  return {
    id: 'a1b2c3d4-0000-5000-8000-000000000001',
    osId: OS_ID,
    codigo: 'OS-2026-000001',
    tipo: 'DIAGNOSTICO',
    status: 'PENDENTE',
    veiculo: { placa: 'ABC1D23', marca: 'Fiat', modelo: 'Uno', ano: 2020 },
    observacoes: null,
    servicos: [],
    itens: [],
    correlationId: 'fluxo-da-os',
    criadoEm: '2026-10-20T10:00:00.000Z',
    atualizadoEm: '2026-10-20T10:00:00.000Z',
    ...sobrescrever,
  };
}
