import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  TarefaAlteradaError,
  TarefaNaoEncontradaError,
  TransicaoInvalidaError,
} from '../../domain/errors';

/**
 * Converte erros de domínio nas exceções HTTP do Nest. Erros desconhecidos são
 * repassados como estão (viram 500 no filtro global).
 */
export function traduzirErroDominio(erro: unknown): unknown {
  if (erro instanceof TarefaNaoEncontradaError) {
    return new NotFoundException(erro.message);
  }
  if (
    erro instanceof TransicaoInvalidaError ||
    erro instanceof TarefaAlteradaError
  ) {
    return new ConflictException(erro.message);
  }
  return erro;
}
