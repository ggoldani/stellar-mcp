const RESERVED = new Set([
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "new",
  "null",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "enum",
  "implements",
  "interface",
  "package",
  "private",
  "protected",
  "public",
  "static",
  "yield",
  "let",
  "await",
  "constructor"
]);

export function slugSegment(raw: string): string {
  const s = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return s.length > 0 ? s : "fn";
}

export function tsIdentifierForMethod(methodName: string): string {
  const base = slugSegment(methodName).replace(/^(\d)/, "_$1");
  if (RESERVED.has(base)) {
    return `fn_${base}`;
  }
  return base;
}

export function kebabPackage(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 214) || "generated-soroban-mcp";
}
