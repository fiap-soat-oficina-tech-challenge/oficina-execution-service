import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../../common/guards';
import {
  FalharTarefaDto,
  ListarTarefasQueryDto,
  TarefaResponseDto,
} from '../../application/dto/tarefa.dto';
import { ConsultarTarefasUseCase } from '../../application/use-case/consultar-tarefas.use-case';
import { TransicionarTarefaUseCase } from '../../application/use-case/transicionar-tarefa.use-case';
import type { Tarefa } from '../../domain/tarefa';

/** Rotas do mecânico (JWT de funcionário). */
@ApiTags('Tarefas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tarefas')
export class TarefaController {
  constructor(
    private readonly consultar: ConsultarTarefasUseCase,
    private readonly transicionar: TransicionarTarefaUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Listar tarefas (a fila de diagnóstico e reparo)',
    description:
      'Sem status nem OS, devolve a fila: tarefas PENDENTES, mais antigas primeiro.',
  })
  @ApiOkResponse({ type: [TarefaResponseDto] })
  listar(@Query() filtro: ListarTarefasQueryDto): Promise<Tarefa[]> {
    return this.consultar.listar(filtro);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar uma tarefa' })
  @ApiOkResponse({ type: TarefaResponseDto })
  @ApiResponse({ status: 404, description: 'Tarefa não encontrada' })
  buscar(@Param('id', ParseUUIDPipe) id: string): Promise<Tarefa> {
    return this.consultar.buscar(id);
  }

  @Post(':id/iniciar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Iniciar a tarefa',
    description:
      'No diagnóstico, avisa o orquestrador (DiagnosticoIniciado) e a OS passa para EM_DIAGNOSTICO.',
  })
  @ApiOkResponse({ type: TarefaResponseDto })
  @ApiResponse({ status: 409, description: 'A tarefa não está PENDENTE' })
  iniciar(@Param('id', ParseUUIDPipe) id: string): Promise<Tarefa> {
    return this.transicionar.execute(id, 'iniciar');
  }

  @Post(':id/concluir')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Concluir a tarefa',
    description:
      'Avisa o orquestrador: DiagnosticoConcluido (gera o orçamento) ou ReparoConcluido (finaliza a OS).',
  })
  @ApiOkResponse({ type: TarefaResponseDto })
  @ApiResponse({ status: 409, description: 'A tarefa não está EM_ANDAMENTO' })
  concluir(@Param('id', ParseUUIDPipe) id: string): Promise<Tarefa> {
    return this.transicionar.execute(id, 'concluir');
  }

  @Post(':id/falhar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Registrar falha na tarefa',
    description:
      'Avisa o orquestrador (ExecucaoFalhou), que compensa: devolve o estoque, estorna o pagamento se houver e cancela a OS.',
  })
  @ApiOkResponse({ type: TarefaResponseDto })
  @ApiResponse({
    status: 409,
    description: 'A tarefa já foi concluída ou falhou',
  })
  falhar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FalharTarefaDto,
  ): Promise<Tarefa> {
    return this.transicionar.execute(id, 'falhar', dto.motivo);
  }
}
