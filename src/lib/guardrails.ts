/** Prohibited-question filter: age, religion, marital status, family status. */
const RULES: { topic: string; pattern: RegExp }[] = [
  { topic: "age", pattern: /\b(how old|your age|what age|age are you|date of birth|birth ?year|year (were )?you born|when were you born)\b/i },
  { topic: "religion", pattern: /\b(religio\w*|your faith|caste|which god|pray|church|temple|mosque|believer|spiritual beliefs)\b/i },
  { topic: "marital status", pattern: /\b(married|marital|spouse|husband|wife|engaged|single or|relationship status|boyfriend|girlfriend|divorc\w*)\b/i },
  { topic: "family status", pattern: /\b(children|kids|pregnan\w*|plan(ning)? (to have|a) (a )?(family|baby)|family plans|start a family|family status|dependents)\b/i },
];

export function findProhibitedTopic(text: string): string | null {
  for (const r of RULES) if (r.pattern.test(text)) return r.topic;
  return null;
}
