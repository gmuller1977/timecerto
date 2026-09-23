/**
 * Como o jogador aparece para o grupo: o apelido, se houver; senão o nome.
 * Na pelada o apelido é o nome de verdade — ninguém procura "Carlos Eduardo"
 * na lista, procura "Cadu". O nome completo fica na ficha do administrador.
 *
 * Os links fazem a mesma conta no banco (guest_group); aqui é para as telas
 * do aparelho.
 */
export function nomeDeExibicao(p: { name: string; nickname?: string }): string {
  return p.nickname?.trim() || p.name;
}
