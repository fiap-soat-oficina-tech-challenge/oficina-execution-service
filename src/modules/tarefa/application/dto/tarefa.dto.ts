import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  STATUS_TAREFA,
  TIPOS_TAREFA,
  type StatusTarefa,
  type TipoTarefa,
} from '../../domain/tarefa';

export class ListarTarefasQueryDto {
  @ApiPropertyOptional({
    description:
      'Status das tarefas. Sem status nem OS, a lista é a fila: tarefas PENDENTES, mais antigas primeiro.',
    enum: STATUS_TAREFA,
  })
  @IsOptional()
  @IsIn(STATUS_TAREFA)
  status?: StatusTarefa;

  @ApiPropertyOptional({ description: 'Tipo da tarefa', enum: TIPOS_TAREFA })
  @IsOptional()
  @IsIn(TIPOS_TAREFA)
  tipo?: TipoTarefa;

  @ApiPropertyOptional({ description: 'Tarefas de uma OS', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  osId?: string;
}

export class FalharTarefaDto {
  @ApiProperty({
    description: 'Por que a tarefa não pôde ser concluída',
    example: 'Peça indisponível no fornecedor',
    maxLength: 500,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  motivo!: string;
}

class VeiculoResponseDto {
  @ApiProperty({ example: 'ABC1D23' }) placa!: string;
  @ApiProperty({ example: 'Fiat' }) marca!: string;
  @ApiProperty({ example: 'Uno' }) modelo!: string;
  @ApiProperty({ example: 2020 }) ano!: number;
}

class ItemDeTrabalhoResponseDto {
  @ApiProperty({ example: 'Troca de óleo' }) nome!: string;
  @ApiProperty({ example: 1 }) quantidade!: number;
}

export class TarefaResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) osId!: string;
  @ApiProperty({ example: 'OS-2026-000001' }) codigo!: string;
  @ApiProperty({ enum: TIPOS_TAREFA }) tipo!: TipoTarefa;
  @ApiProperty({ enum: STATUS_TAREFA }) status!: StatusTarefa;
  @ApiProperty({ type: VeiculoResponseDto }) veiculo!: VeiculoResponseDto;
  @ApiProperty({ nullable: true, type: String }) observacoes!: string | null;
  @ApiProperty({ type: [ItemDeTrabalhoResponseDto] })
  servicos!: ItemDeTrabalhoResponseDto[];
  @ApiProperty({ type: [ItemDeTrabalhoResponseDto] })
  itens!: ItemDeTrabalhoResponseDto[];
  @ApiProperty({ description: 'Fluxo da OS (correlationId)' })
  correlationId!: string;
  @ApiProperty({ format: 'date-time' }) criadoEm!: string;
  @ApiProperty({ format: 'date-time' }) atualizadoEm!: string;
  @ApiPropertyOptional({ format: 'date-time' }) iniciadoEm?: string;
  @ApiPropertyOptional({ format: 'date-time' }) concluidoEm?: string;
  @ApiPropertyOptional() motivoFalha?: string;
}
