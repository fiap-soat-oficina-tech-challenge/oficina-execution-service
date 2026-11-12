import { Module } from '@nestjs/common';
import { SQSClient } from '@aws-sdk/client-sqs';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { PublicadorSqs } from '../../common/mensageria/publicador-sqs';
import { PUBLICADOR_RESPOSTAS } from './application/ports/publicador-respostas';
import { ConsultarTarefasUseCase } from './application/use-case/consultar-tarefas.use-case';
import { ReceberComandoUseCase } from './application/use-case/receber-comando.use-case';
import { TransicionarTarefaUseCase } from './application/use-case/transicionar-tarefa.use-case';
import { TAREFA_REPOSITORY } from './domain/repository/tarefa.repository';
import { DynamoDbTarefaRepository } from './infra/dynamodb-tarefa.repository';
import { ComandosConsumer } from './interface/consumer/comandos.consumer';
import { TarefaController } from './interface/controller/tarefa.controller';

@Module({
  controllers: [TarefaController],
  providers: [
    {
      provide: TAREFA_REPOSITORY,
      inject: [DynamoDBDocumentClient],
      useFactory: (dynamo: DynamoDBDocumentClient) =>
        new DynamoDbTarefaRepository(
          dynamo,
          process.env.DYNAMODB_TABLE_TAREFAS ?? '',
        ),
    },
    {
      provide: PUBLICADOR_RESPOSTAS,
      inject: [SQSClient],
      useFactory: (sqs: SQSClient) =>
        new PublicadorSqs(sqs, process.env.SAGA_REPLIES_QUEUE_URL ?? ''),
    },
    ReceberComandoUseCase,
    TransicionarTarefaUseCase,
    ConsultarTarefasUseCase,
    ComandosConsumer,
  ],
})
export class TarefaModule {}
