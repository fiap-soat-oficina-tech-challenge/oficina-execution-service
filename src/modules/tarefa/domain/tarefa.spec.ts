import { TransicaoInvalidaError } from './errors';
import { idDaTarefa, NAMESPACE_TAREFAS, uuidV5 } from './id-da-tarefa';
import { proximoStatus, type AcaoTarefa, type StatusTarefa } from './tarefa';

describe('ciclo da tarefa', () => {
  it.each<[StatusTarefa, AcaoTarefa, StatusTarefa]>([
    ['PENDENTE', 'iniciar', 'EM_ANDAMENTO'],
    ['EM_ANDAMENTO', 'concluir', 'CONCLUIDA'],
    ['PENDENTE', 'falhar', 'FALHOU'],
    ['EM_ANDAMENTO', 'falhar', 'FALHOU'],
  ])('%s + %s → %s', (atual, acao, esperado) => {
    expect(proximoStatus(atual, acao)).toBe(esperado);
  });

  it.each<[StatusTarefa, AcaoTarefa]>([
    ['PENDENTE', 'concluir'],
    ['EM_ANDAMENTO', 'iniciar'],
    ['CONCLUIDA', 'iniciar'],
    ['CONCLUIDA', 'falhar'],
    ['FALHOU', 'concluir'],
    ['FALHOU', 'falhar'],
  ])('recusa %s + %s', (atual, acao) => {
    expect(() => proximoStatus(atual, acao)).toThrow(TransicaoInvalidaError);
  });
});

describe('id da tarefa', () => {
  it('gera UUID v5 conforme a RFC 4122 (vetor de teste do namespace DNS)', () => {
    expect(
      uuidV5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8'),
    ).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2');
  });

  it('é o mesmo para a mesma OS e tipo, e muda com o tipo ou a OS', () => {
    const os = 'c56f9df1-b6f7-4625-84ce-a27706664ae5';

    expect(idDaTarefa(os, 'DIAGNOSTICO')).toBe(idDaTarefa(os, 'DIAGNOSTICO'));
    expect(idDaTarefa(os, 'DIAGNOSTICO')).not.toBe(idDaTarefa(os, 'REPARO'));
    expect(idDaTarefa(os, 'REPARO')).not.toBe(
      idDaTarefa('d4df5afb-1f1a-4735-b975-5ecc8dcf046a', 'REPARO'),
    );
    expect(idDaTarefa(os, 'REPARO')).toBe(
      uuidV5(`${os}:REPARO`, NAMESPACE_TAREFAS),
    );
  });

  it('tem formato de UUID versão 5', () => {
    expect(idDaTarefa('os-1', 'DIAGNOSTICO')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
