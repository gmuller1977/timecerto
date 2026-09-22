import type { RotationConfig, RotationSystem } from '@/types';

/**
 * Sistemas de jogo do vôlei. O número de levantadores é o que
 * o sorteio precisa saber — é ele que define a montagem do time.
 */
export const ROTATIONS: Record<RotationSystem, RotationConfig> = {
  '6x0': {
    id: '6x0',
    name: '6x0',
    setters: 0,
    summary: 'Sem levantador fixo',
    description:
      'Todo mundo levanta quando chega na frente. Sem especialista. Comum em iniciação e em pelada de gente que está começando.',
    rotates: true,
  },
  '4x2': {
    id: '4x2',
    name: '4x2',
    setters: 2,
    summary: 'Dois levantadores, quem está na frente levanta',
    description:
      'Dois levantadores opostos no rodízio, sempre um deles na frente. Quatro atacantes. Simples de organizar, mas ataca com dois.',
    rotates: true,
  },
  '6x2': {
    id: '6x2',
    name: '6x2',
    setters: 2,
    summary: 'Dois levantadores que também atacam',
    description:
      'O levantador do fundo penetra para levantar, então sempre há três atacantes na frente. Exige dois levantadores que ataquem bem.',
    rotates: true,
  },
  '5x1': {
    id: '5x1',
    name: '5x1',
    setters: 1,
    summary: 'Um levantador nas seis rotações',
    description:
      'Um levantador só, levantando o jogo inteiro. Padrão do vôlei moderno. Ataca com três quando ele está no fundo e com dois quando está na frente.',
    rotates: true,
  },
  fixo: {
    id: 'fixo',
    name: 'Levantador fixo',
    setters: 1,
    summary: 'Levantador parado no meio, sem rodízio',
    description:
      'O levantador fica na posição 3 e não roda. Não é sistema oficial, é convenção de quadra — e é como boa parte das peladas joga.',
    rotates: false,
  },
};

export const ROTATION_LIST = Object.values(ROTATIONS);

export const DEFAULT_ROTATION: RotationSystem = '5x1';

/** Quantos levantadores cada time precisa neste sistema */
export function settersNeeded(system: RotationSystem): number {
  return ROTATIONS[system].setters;
}

/**
 * O sistema é viável com esse tamanho de time?
 * 5x1 num time de 4 é desperdício; 6x2 num time de 4 não fecha.
 */
export function rotationFits(system: RotationSystem, teamSize: number): boolean {
  return settersNeeded(system) <= Math.max(0, teamSize - 1);
}
