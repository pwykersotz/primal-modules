/** The token a creature attacks from: its own (for an unlinked token), or the one controlled, or the first. */
export function tokenFor(actor) {
  if ( actor?.token?.object ) return actor.token.object;
  const tokens = actor?.getActiveTokens?.() ?? [];
  return tokens.find(t => t.controlled) ?? tokens[0] ?? null;
}
