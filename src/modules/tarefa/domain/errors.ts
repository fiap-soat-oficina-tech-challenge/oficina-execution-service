export class TarefaNaoEncontradaError extends Error {
  constructor(id: string) {
    super(`Tarefa ${id} não encontrada`);
    this.name = 'TarefaNaoEncontradaError';
  }
}

export class TransicaoInvalidaError extends Error {
  constructor(status: string, acao: string) {
    super(`Não é possível ${acao} uma tarefa com status ${status}`);
    this.name = 'TransicaoInvalidaError';
  }
}

/** A tarefa mudou entre a leitura e a gravação (outra ação chegou antes). */
export class TarefaAlteradaError extends Error {
  constructor(id: string) {
    super(
      `A tarefa ${id} foi alterada por outra ação; consulte e tente de novo`,
    );
    this.name = 'TarefaAlteradaError';
  }
}
