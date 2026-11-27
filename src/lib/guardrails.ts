/** Prohibited-question filter: age, religion, marital status, family status. Deterministic — never delegated to the AI. */
const RULES: { topic: string; pattern: RegExp }[] = [
  {
    topic: "age",
    pattern:
      /\b(how old|your age|what age|age are you|date of birth|dob|d\.o\.b|birth ?(year|date|day)|year (were )?you born|when were you born|born in (what|which) year)\b/i,
  },
  { topic: "religion", pattern: /\b(religio\w*|your faith|caste|which god|do you pray|go to (church|temple|mosque)|church|mosque|believer|spiritual beliefs)\b/i },
  {
    topic: "marital status",
    pattern:
      /\b(married|marital|spouse|husband|wife|are you engaged|engaged to (be|someone)|getting engaged|single or|relationship status|boyfriend|girlfriend|partner at home|divorc\w*)\b/i,
  },
  {
    topic: "family status",
    pattern:
      /\b(children|kids|a son|a daughter|son or daughter|your (son|daughter)s?|pregnan\w*|plan(ning)? (to have|a) (a )?(family|baby)|family plans|start a family|family status|dependents|maternity plans)\b/i,
  },
];

export function findProhibitedTopic(text: string): string | null {
  for (const r of RULES) if (r.pattern.test(text)) return r.topic;
  return null;
}
