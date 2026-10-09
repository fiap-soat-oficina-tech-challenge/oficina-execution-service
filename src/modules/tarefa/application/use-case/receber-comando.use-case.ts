import { Inject, Injectable } from '@nestjs/common';
import {
  criarEnvelope,
  type Envelope,
} from '../../../../common/mensageria/envelope';
import { registrarEvento } from '../../../../common/observability';
import { idDaTarefa } from '../../domain/id-da-tarefa';
import {
  TAREFA_REPOSITORY,
  type TarefaRepository,
} from '../../domain/repository/tarefa.repository';
import type {
  ItemDeTrabalho,
  Tarefa,
  TipoTarefa,
  Veiculo,
} from '../../domain/tarefa';
import {
  COMANDOS,
  PUBLICADOR_RESPOSTAS,
  RESPOSTAS,
  type PublicadorRespostas,
} from '../ports/publicador-respostas';

const TIPO_POR_COMANDO: Record<string, TipoTarefa> = {
  [COMANDOS.iniciarDiagnostico]: 'DIAGNOSTICO',
  [COMANDOS.iniciarReparo]: 'REPARO',
};

interface DadosDoComando {
  codigo: string;
  veiculo: Veiculo;
  observacoes: string | null;
  servicos: ItemDeTrabalho[];
  itens: ItemDeTrabalho[];
}

/**
 * Consome `IniciarDiagnostico` e `IniciarReparo`: coloca a tarefa na fila do
 * mecânico. Não há resposta de sucesso — a Saga só avança quando o mecânico age
 * sobre a tarefa (rotas de TarefaController).
 *
 * - Comando repetido (o SQS entrega pelo menos uma vez): o id determinístico
 *   faz a segunda gravação ser recusada, e a mensagem é dada como processada.
 * - Comando com dados inválidos é falha de negócio: responde `ExecucaoFalhou`
 *   para o orquestrador compensar, em vez de deixar a mensagem cair na DLQ.
 * - Tipo desconhecido não pertence a esta fila: é descartado com aviso.
 */
@Injectable()
export class ReceberComandoUseCase {
  constructor(
    @Inject(TAREFA_REPOSITORY)
    private readonly repositorio: TarefaRepository,
    @Inject(PUBLICADOR_RESPOSTAS)
    private readonly publicador: PublicadorRespostas,
  ) {}

  async execute(envelope: Envelope, agora: Date = new Date()): Promise<void> {
    const tipo = TIPO_POR_COMANDO[envelope.tipo];
    if (!tipo) {
      registrarEvento(
        'execucao.comando_desconhecido',
        { tipo_mensagem: envelope.tipo },
        'warn',
      );
      return;
    }

    const validacao = validarDados(tipo, envelope.payload);
    if (typeof validacao === 'string') {
      await this.publicador.publicar(
        criarEnvelope(
          RESPOSTAS.execucaoFalhou,
          envelope.osId,
          envelope.correlationId,
          { etapa: tipo, motivo: `COMANDO_INVALIDO: ${validacao}` },
          agora,
        ),
      );
      registrarEvento(
        'execucao.comando_invalido',
        { tipo_tarefa: tipo, motivo: validacao },
        'warn',
      );
      return;
    }

    const momento = agora.toISOString();
    const tarefa: Tarefa = {
      id: idDaTarefa(envelope.osId, tipo),
      osId: envelope.osId,
      tipo,
      status: 'PENDENTE',
      correlationId: envelope.correlationId,
      criadoEm: momento,
      atualizadoEm: momento,
      ...validacao,
    };

    const criada = await this.repositorio.criarSeNaoExistir(tarefa);
    registrarEvento(
      criada ? 'execucao.tarefa_criada' : 'execucao.comando_repetido',
      { tarefa_id: tarefa.id, tipo_tarefa: tipo },
    );
  }
}

function texto(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.trim() !== '';
}

function lerItens(valor: unknown, campo: string): ItemDeTrabalho[] | string {
  if (valor === undefined) return [];
  if (!Array.isArray(valor)) return `${campo} deve ser uma lista`;
  for (const item of valor as Record<string, unknown>[]) {
    if (
      typeof item !== 'object' ||
      item === null ||
      !texto(item.nome) ||
      !Number.isInteger(item.quantidade) ||
      (item.quantidade as number) <= 0
    ) {
      return `${campo} precisa de nome e quantidade inteira positiva`;
    }
  }
  return (valor as ItemDeTrabalho[]).map(({ nome, quantidade }) => ({
    nome,
    quantidade,
  }));
}

/** Devolve os dados do comando ou a descrição do problema. */
function validarDados(
  tipo: TipoTarefa,
  payload: Record<string, unknown>,
): DadosDoComando | string {
  if (!texto(payload.codigo)) return 'codigo ausente';

  const veiculo = payload.veiculo as Record<string, unknown> | undefined;
  if (
    typeof veiculo !== 'object' ||
    veiculo === null ||
    !texto(veiculo.placa) ||
    !texto(veiculo.marca) ||
    !texto(veiculo.modelo) ||
    !Number.isInteger(veiculo.ano)
  ) {
    return 'veiculo precisa de placa, marca, modelo e ano';
  }

  const servicos = lerItens(payload.servicos, 'servicos');
  if (typeof servicos === 'string') return servicos;
  const itens = lerItens(payload.itens, 'itens');
  if (typeof itens === 'string') return itens;
  if (tipo === 'REPARO' && servicos.length + itens.length === 0) {
    return 'reparo sem serviços nem itens';
  }

  const observacoes = payload.observacoes;
  return {
    codigo: payload.codigo,
    veiculo: {
      placa: veiculo.placa,
      marca: veiculo.marca,
      modelo: veiculo.modelo,
      ano: veiculo.ano as number,
    },
    observacoes: typeof observacoes === 'string' ? observacoes : null,
    servicos,
    itens,
  };
}
