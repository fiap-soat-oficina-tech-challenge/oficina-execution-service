import { Inject, Injectable } from '@nestjs/common';
import { criarEnvelope } from '../../../../common/mensageria/envelope';
import { registrarEvento } from '../../../../common/observability';
import {
  TarefaAlteradaError,
  TarefaNaoEncontradaError,
} from '../../domain/errors';
import {
  TAREFA_REPOSITORY,
  type MudancasTarefa,
  type TarefaRepository,
} from '../../domain/repository/tarefa.repository';
import {
  proximoStatus,
  type AcaoTarefa,
  type Tarefa,
} from '../../domain/tarefa';
import {
  PUBLICADOR_RESPOSTAS,
  RESPOSTAS,
  type PublicadorRespostas,
} from '../ports/publicador-respostas';
import { traduzirErroDominio } from '../shared/traduzir-erro-dominio';

/**
 * Ações do mecânico sobre uma tarefa: iniciar, concluir ou registrar falha.
 *
 * Cada ação que interessa à Saga publica uma resposta para o orquestrador, com o
 * correlationId do fluxo da OS (guardado na tarefa). Seguindo docs/contratos.md,
 * a resposta é publicada antes de gravar: se a publicação falha, nada muda e a
 * ação pode ser repetida; se a gravação falha depois, o orquestrador recebe uma
 * resposta que ele trata como fora de hora, porque confere o estado da OS.
 */
@Injectable()
export class TransicionarTarefaUseCase {
  constructor(
    @Inject(TAREFA_REPOSITORY)
    private readonly repositorio: TarefaRepository,
    @Inject(PUBLICADOR_RESPOSTAS)
    private readonly publicador: PublicadorRespostas,
  ) {}

  async execute(
    id: string,
    acao: AcaoTarefa,
    motivo?: string,
    agora: Date = new Date(),
  ): Promise<Tarefa> {
    try {
      const tarefa = await this.repositorio.buscarPorId(id);
      if (!tarefa) throw new TarefaNaoEncontradaError(id);

      const momento = agora.toISOString();
      const mudancas: MudancasTarefa = {
        status: proximoStatus(tarefa.status, acao),
        atualizadoEm: momento,
        ...(acao === 'iniciar' && { iniciadoEm: momento }),
        ...(acao === 'concluir' && { concluidoEm: momento }),
        ...(acao === 'falhar' && { motivoFalha: motivo }),
      };

      const resposta = respostaDaAcao(tarefa, acao, momento, motivo);
      if (resposta) {
        await this.publicador.publicar(
          criarEnvelope(
            resposta.tipo,
            tarefa.osId,
            tarefa.correlationId,
            resposta.payload,
            agora,
          ),
        );
      }

      const gravou = await this.repositorio.atualizar(
        id,
        tarefa.status,
        mudancas,
      );
      if (!gravou) throw new TarefaAlteradaError(id);

      registrarEvento(`execucao.tarefa_${acao}`, {
        tarefa_id: id,
        os_id: tarefa.osId,
        tipo_tarefa: tarefa.tipo,
        status: mudancas.status,
      });

      return { ...tarefa, ...mudancas };
    } catch (erro) {
      throw traduzirErroDominio(erro);
    }
  }
}

function respostaDaAcao(
  tarefa: Tarefa,
  acao: AcaoTarefa,
  momento: string,
  motivo?: string,
): { tipo: string; payload: Record<string, unknown> } | null {
  if (acao === 'falhar') {
    return {
      tipo: RESPOSTAS.execucaoFalhou,
      payload: { etapa: tarefa.tipo, motivo },
    };
  }
  if (acao === 'concluir') {
    return {
      tipo:
        tarefa.tipo === 'DIAGNOSTICO'
          ? RESPOSTAS.diagnosticoConcluido
          : RESPOSTAS.reparoConcluido,
      payload: { concluidoEm: momento },
    };
  }
  // Iniciar o diagnóstico muda a OS para EM_DIAGNOSTICO. Iniciar o reparo não
  // muda o status da OS (ela já está EM_EXECUCAO), então não há resposta.
  return tarefa.tipo === 'DIAGNOSTICO'
    ? {
        tipo: RESPOSTAS.diagnosticoIniciado,
        payload: { iniciadoEm: momento },
      }
    : null;
}
