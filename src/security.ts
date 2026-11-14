export type FieldDescriptor = { type?: string | null; autocomplete?: string | null; name?: string | null; id?: string | null; placeholder?: string | null; ariaLabel?: string | null };
const SENSITIVE_NAME = /pass(?:word|code|wd)?|card[ _-]?(?:number|num|no|expiry|exp|cvc|cvv)|credit[ _-]?card|cc[ _-]?(?:number|num|exp|csc|cvc)|cvv|cvc|security[ _-]?code|expir(?:y|ation)|exp[ _-]?(?:date|month|year)|mm[ _/-]?yy/i;

export function isSensitiveField(field: FieldDescriptor): boolean {
  if (field.type?.toLowerCase() === 'password') return true;
  if (/^cc(?:-|$)/i.test(field.autocomplete || '')) return true;
  return [field.name, field.id, field.placeholder, field.ariaLabel].some(value => SENSITIVE_NAME.test(value || ''));
}

export function redactText(value: string, secrets: string[]): string {
  let text = value;
  for (const secret of [...new Set(secrets)].sort((a, b) => b.length - a.length)) {
    if (secret) text = text.split(secret).join('••••');
  }
  return text.split('\n').map(line => {
    if (/^\s*-\s+(?:textbox|input|spinbutton)\b/i.test(line) && SENSITIVE_NAME.test(line)) {
      return line.replace(/(:\s*)([^\[]+?)(\s*(?:\[|$))/, (_match, before, _value, after) => `${before}••••${after}`);
    }
    return line;
  }).join('\n');
}

export function sanitizeArguments(toolName: string, args: Record<string, unknown>, sensitiveTargets: Set<string>): { arguments: Record<string, unknown>; secrets: string[] } {
  const safe = structuredClone(args);
  const secrets: string[] = [];
  if (toolName === 'browser_type' && typeof safe.text === 'string' && sensitiveTargets.has(String(safe.ref || safe.target))) {
    secrets.push(safe.text); safe.text = '••••';
  }
  if (toolName === 'browser_fill_form' && Array.isArray(safe.fields)) {
    for (const field of safe.fields as Record<string, unknown>[]) {
      if (!field || typeof field !== 'object') continue;
      const descriptor: FieldDescriptor = { name: String(field.name || ''), type: String(field.type || ''), id: String(field.id || ''), placeholder: String(field.placeholder || '') };
      if (isSensitiveField(descriptor) || sensitiveTargets.has(String(field.target || field.ref || ''))) {
        if (typeof field.value === 'string') { secrets.push(field.value); field.value = '••••'; }
      }
    }
  }
  return { arguments: safe, secrets };
}
