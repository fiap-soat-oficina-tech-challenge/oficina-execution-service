import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { SQSClient } from '@aws-sdk/client-sqs';
import { ConsumidorSqs } from '../../../../common/mensageria/consumidor-sqs';
import { ReceberComandoUseCase } from '../../application/use-case/receber-comando.use-case';

/**
 * Liga a fila `oficina-execution-commands` ao caso de uso. O laço de consumo
 * começa quando a aplicação termina de subir e para no desligamento (SIGTERM do
 * Kubernetes), antes de o processo sair.
 */
@Injectable()
export class ComandosConsumer
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly consumidor: ConsumidorSqs;

  constructor(sqs: SQSClient, receberComando: ReceberComandoUseCase) {
    this.consumidor = new ConsumidorSqs(
      sqs,
      process.env.EXECUTION_COMMANDS_QUEUE_URL ?? '',
      (envelope) => receberComando.execute(envelope),
    );
  }

  onApplicationBootstrap(): void {
    void this.consumidor.iniciar();
  }

  onApplicationShutdown(): void {
    this.consumidor.parar();
  }
}
