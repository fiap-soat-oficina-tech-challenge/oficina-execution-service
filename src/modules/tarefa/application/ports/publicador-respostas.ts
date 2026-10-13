import type { Envelope } from '../../../../common/mensageria/envelope';

export const PUBLICADOR_RESPOSTAS = Symbol('PUBLICADOR_RESPOSTAS');

/** Publica as respostas da Saga para o orquestrador (fila oficina-os-saga-replies). */
export interface PublicadorRespostas {
  publicar(envelope: Envelope<unknown>): Promise<void>;
}

/** Tipos de resposta publicados por este serviço (docs/contratos.md). */
export const RESPOSTAS = {
  diagnosticoIniciado: 'DiagnosticoIniciado',
  diagnosticoConcluido: 'DiagnosticoConcluido',
  reparoConcluido: 'ReparoConcluido',
  execucaoFalhou: 'ExecucaoFalhou',
} as const;

/** Comandos consumidos por este serviço. */
export const COMANDOS = {
  iniciarDiagnostico: 'IniciarDiagnostico',
  iniciarReparo: 'IniciarReparo',
} as const;
