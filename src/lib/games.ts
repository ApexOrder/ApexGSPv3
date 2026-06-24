export type GameMeta = {
  id: string
  label: string
  short: string
}

const games: Record<string, GameMeta> = {
  '7dtd': { id: '7dtd', label: '7 Days To Die', short: '7DTD' },
  dayz: { id: 'dayz', label: 'DayZ', short: 'DAYZ' },
}

export function getGameMeta(game?: string | null) {
  return games[String(game || '7dtd').toLowerCase()] ?? { id: String(game || 'unknown'), label: String(game || 'Unknown Game'), short: String(game || '?').toUpperCase() }
}
