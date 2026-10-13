import { TransicaoInvalidaError } from './errors';

export const TIPOS_TAREFA = ['DIAGNOSTICO', 'REPARO'] as const;
export type TipoTarefa = (typeof TIPOS_TAREFA)[number];

export const STATUS_TAREFA = [
  'PENDENTE',
  'EM_ANDAMENTO',
  'CONCLUIDA',
  'FALHOU',
] as const;
export type StatusTarefa = (typeof STATUS_TAREFA)[number];

export type AcaoTarefa = 'iniciar' | 'concluir' | 'falhar';

export interface Veiculo {
  placa: string;
  marca: string;
  modelo: string;
  ano: number;
}

export interface ItemDeTrabalho {
  nome: string;
  quantidade: number;
}

/**
 * Uma tarefa de diagnóstico ou de reparo de uma OS. Os dados da OS (código,
 * veículo, serviços e itens) são a cópia que chega no comando: este serviço
 * nunca consulta o banco do OS Service.
 */
export interface Tarefa {
  id: string;
  osId: string;
  codigo: string;
  tipo: TipoTarefa;
  status: StatusTarefa;
  veiculo: Veiculo;
  observacoes: string | null;
  servicos: ItemDeTrabalho[];
  itens: ItemDeTrabalho[];
  /** Fluxo da OS: vai em toda resposta publicada a partir desta tarefa. */
  correlationId: string;
  criadoEm: string;
  atualizadoEm: string;
  iniciadoEm?: string;
  concluidoEm?: string;
  motivoFalha?: string;
}

const TRANSICOES: Record<
  AcaoTarefa,
  Partial<Record<StatusTarefa, StatusTarefa>>
> = {
  iniciar: { PENDENTE: 'EM_ANDAMENTO' },
  concluir: { EM_ANDAMENTO: 'CONCLUIDA' },
  falhar: { PENDENTE: 'FALHOU', EM_ANDAMENTO: 'FALHOU' },
};

/**
 * Ciclo de uma tarefa (docs/contratos.md): PENDENTE → EM_ANDAMENTO → CONCLUIDA,
 * ou FALHOU a partir de PENDENTE ou EM_ANDAMENTO. Fora disso a ação é recusada,
 * o que impede, por exemplo, uma falha numa tarefa já concluída de cancelar uma
 * OS que já passou daquela etapa.
 */
export function proximoStatus(
  atual: StatusTarefa,
  acao: AcaoTarefa,
): StatusTarefa {
  const proximo = TRANSICOES[acao][atual];
  if (!proximo) throw new TransicaoInvalidaError(atual, acao);
  return proximo;
}
