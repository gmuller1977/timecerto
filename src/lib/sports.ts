import type { SportConfig, SportId } from '@/types';

export const SPORTS: Record<SportId, SportConfig> = {
  futebol: {
    id: 'futebol',
    name: 'Futebol',
    emoji: '⚽',
    defaultTeamSize: 5,
    teamSizeOptions: [4, 5, 6, 7, 8, 9, 10, 11],
    accent: 'brand',
    positions: [
      { id: 'goleiro', label: 'Goleiro', short: 'GOL', idealPerTeam: 1 },
      { id: 'zagueiro', label: 'Zagueiro', short: 'ZAG', idealPerTeam: 0 },
      { id: 'lateral', label: 'Lateral', short: 'LAT', idealPerTeam: 0 },
      { id: 'meia', label: 'Meia', short: 'MEI', idealPerTeam: 0 },
      { id: 'atacante', label: 'Atacante', short: 'ATA', idealPerTeam: 0 },
      { id: 'linha', label: 'Linha (qualquer)', short: 'LIN', idealPerTeam: 0 },
    ],
  },
  volei: {
    id: 'volei',
    name: 'Vôlei',
    emoji: '🏐',
    defaultTeamSize: 6,
    teamSizeOptions: [2, 3, 4, 5, 6],
    accent: 'brand',
    positions: [
      { id: 'levantador', label: 'Levantador', short: 'LEV', idealPerTeam: 1 },
      { id: 'oposto', label: 'Oposto', short: 'OPO', idealPerTeam: 1 },
      { id: 'ponteiro', label: 'Ponteiro', short: 'PON', idealPerTeam: 2 },
      { id: 'central', label: 'Central', short: 'CEN', idealPerTeam: 2 },
      { id: 'libero', label: 'Líbero', short: 'LIB', idealPerTeam: 1 },
      { id: 'livre', label: 'Joga em qualquer', short: 'LIV', idealPerTeam: 0 },
    ],
  },
  basquete: {
    id: 'basquete',
    name: 'Basquete',
    emoji: '🏀',
    defaultTeamSize: 5,
    teamSizeOptions: [3, 4, 5],
    accent: 'brand',
    positions: [
      { id: 'armador', label: 'Armador', short: 'PG', idealPerTeam: 1 },
      { id: 'ala-armador', label: 'Ala-armador', short: 'SG', idealPerTeam: 1 },
      { id: 'ala', label: 'Ala', short: 'SF', idealPerTeam: 1 },
      { id: 'ala-pivo', label: 'Ala-pivô', short: 'PF', idealPerTeam: 1 },
      { id: 'pivo', label: 'Pivô', short: 'C', idealPerTeam: 1 },
      { id: 'livre', label: 'Joga em qualquer', short: 'LIV', idealPerTeam: 0 },
    ],
  },
};

export const SPORT_LIST = Object.values(SPORTS);

export function getSport(id: SportId): SportConfig {
  return SPORTS[id];
}

export function getPositionLabel(sport: SportId, positionId?: string): string {
  if (!positionId) return '—';
  return SPORTS[sport].positions.find((p) => p.id === positionId)?.short ?? '—';
}

/** Posição que funciona como "goleiro" (distribuída 1 por time) */
export const KEEPER_POSITION: Record<SportId, string | null> = {
  futebol: 'goleiro',
  volei: 'levantador',
  basquete: null,
};
