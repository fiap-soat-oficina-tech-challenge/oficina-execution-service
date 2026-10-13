import {
  Controller,
  Get,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DescribeTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

/**
 * - `GET /execution/health`       liveness: o processo responde. Usado pelo
 *   liveness probe e pelo health check do ALB (um blip na AWS não derruba pods).
 * - `GET /execution/health/ready` readiness: a tabela de tarefas responde. Usado
 *   pelo readiness probe para tirar do Service um pod sem acesso ao DynamoDB.
 */
@ApiTags('Health')
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly dynamo: DynamoDBClient) {}

  @Get()
  @ApiOperation({ summary: 'Liveness — processo no ar' })
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Readiness — checa a tabela de tarefas no DynamoDB',
  })
  async ready() {
    try {
      await this.dynamo.send(
        new DescribeTableCommand({
          TableName: process.env.DYNAMODB_TABLE_TAREFAS,
        }),
      );
      return { status: 'ok', dynamodb: 'up' };
    } catch (error) {
      // O detalhe fica só no log; a resposta pública é genérica.
      this.logger.error(
        `Readiness falhou ao consultar o DynamoDB: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new ServiceUnavailableException({
        status: 'error',
        dynamodb: 'down',
      });
    }
  }
}
