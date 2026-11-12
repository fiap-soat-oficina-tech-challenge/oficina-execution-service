import { Global, Module } from '@nestjs/common';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SQSClient } from '@aws-sdk/client-sqs';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

/**
 * Clientes da AWS compartilhados pelo serviço. A região vem de AWS_REGION e as
 * credenciais da role dos nós do EKS (cadeia padrão do SDK). Localmente,
 * AWS_ENDPOINT_URL aponta para o LocalStack — o SDK lê essa variável sozinho.
 */
@Global()
@Module({
  providers: [
    { provide: SQSClient, useFactory: () => new SQSClient({}) },
    { provide: DynamoDBClient, useFactory: () => new DynamoDBClient({}) },
    {
      provide: DynamoDBDocumentClient,
      inject: [DynamoDBClient],
      useFactory: (cliente: DynamoDBClient) =>
        DynamoDBDocumentClient.from(cliente, {
          marshallOptions: { removeUndefinedValues: true },
        }),
    },
  ],
  exports: [SQSClient, DynamoDBClient, DynamoDBDocumentClient],
})
export class AwsModule {}
