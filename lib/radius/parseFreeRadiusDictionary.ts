/**
 * Minimal FreeRADIUS dictionary parser.
 *
 * Handles: ATTRIBUTE, VALUE, VENDOR, BEGIN-VENDOR, END-VENDOR, $INCLUDE.
 * Comments (`#`) and blank lines are skipped. Types like `octets[50]` get
 * normalized to their base (`octets`). Anything else is ignored — we only
 * need enough information to render the UI picker and give save-time
 * feedback on the user-editable `dictionary.local` file.
 */
export type AttributeType =
  | "string"
  | "integer"
  | "ipaddr"
  | "ipv6addr"
  | "ipv6prefix"
  | "octets"
  | "date"
  | "ifid"
  | "ether"
  | "abinary"
  | "byte"
  | "short"
  | "signed"
  | "tlv"
  | "struct"
  | "combo-ip"
  | "unknown";

export interface ParsedAttribute {
  name: string;
  code: number;
  type: AttributeType;
  vendor?: string;
  vendorId?: number;
}

export interface ParsedVendor {
  name: string;
  id: number;
}

export interface ParsedValue {
  attribute: string;
  valueName: string;
  valueNumber: number;
}

export interface ParsedDictionary {
  attributes: ParsedAttribute[];
  vendors: ParsedVendor[];
  values: ParsedValue[];
  includes: string[];
}

export class DictionaryParseError extends Error {
  constructor(
    public readonly line: number,
    message: string,
  ) {
    super(`Line ${line}: ${message}`);
    this.name = "DictionaryParseError";
  }
}

const KNOWN_TYPES = new Set<AttributeType>([
  "string",
  "integer",
  "ipaddr",
  "ipv6addr",
  "ipv6prefix",
  "octets",
  "date",
  "ifid",
  "ether",
  "abinary",
  "byte",
  "short",
  "signed",
  "tlv",
  "struct",
  "combo-ip",
]);

function normalizeType(raw: string): AttributeType {
  // Strip FreeRADIUS array / tagged length syntax: octets[50], integer[8].
  const base = raw.split("[")[0].toLowerCase();
  return (KNOWN_TYPES as Set<string>).has(base) ? (base as AttributeType) : "unknown";
}

export function parseFreeRadiusDictionary(content: string): ParsedDictionary {
  const attributes: ParsedAttribute[] = [];
  const vendors: ParsedVendor[] = [];
  const values: ParsedValue[] = [];
  const includes: string[] = [];
  const vendorByName = new Map<string, number>();

  let currentVendor: string | undefined;
  let currentVendorId: number | undefined;

  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const lineNo = i + 1;
    const noComment = rawLine.replace(/#.*$/, "").trim();
    if (noComment === "") continue;

    const tokens = noComment.split(/\s+/);
    const directive = tokens[0].toUpperCase();

    switch (directive) {
      case "ATTRIBUTE": {
        // ATTRIBUTE <name> <code> <type> [flags]
        if (tokens.length < 4) {
          throw new DictionaryParseError(
            lineNo,
            "ATTRIBUTE requires <name> <code> <type>",
          );
        }
        const name = tokens[1];
        const code = Number.parseInt(tokens[2], 10);
        if (!Number.isInteger(code) || code < 1) {
          throw new DictionaryParseError(lineNo, `ATTRIBUTE code is not a positive integer: ${tokens[2]}`);
        }
        attributes.push({
          name,
          code,
          type: normalizeType(tokens[3]),
          vendor: currentVendor,
          vendorId: currentVendorId,
        });
        break;
      }
      case "VALUE": {
        // VALUE <attribute> <valueName> <valueNumber>
        if (tokens.length < 4) {
          throw new DictionaryParseError(
            lineNo,
            "VALUE requires <attribute> <name> <number>",
          );
        }
        const valueNumber = Number.parseInt(tokens[3], 10);
        if (!Number.isInteger(valueNumber)) {
          throw new DictionaryParseError(lineNo, `VALUE number is not an integer: ${tokens[3]}`);
        }
        values.push({
          attribute: tokens[1],
          valueName: tokens[2],
          valueNumber,
        });
        break;
      }
      case "VENDOR": {
        // VENDOR <name> <id>
        if (tokens.length < 3) {
          throw new DictionaryParseError(lineNo, "VENDOR requires <name> <id>");
        }
        const id = Number.parseInt(tokens[2], 10);
        if (!Number.isInteger(id) || id < 1) {
          throw new DictionaryParseError(lineNo, `VENDOR id is not a positive integer: ${tokens[2]}`);
        }
        vendors.push({ name: tokens[1], id });
        vendorByName.set(tokens[1], id);
        break;
      }
      case "BEGIN-VENDOR": {
        if (tokens.length < 2) {
          throw new DictionaryParseError(lineNo, "BEGIN-VENDOR requires <name>");
        }
        const resolvedId = vendorByName.get(tokens[1]);
        if (resolvedId === undefined) {
          throw new DictionaryParseError(
            lineNo,
            `BEGIN-VENDOR references unknown vendor: ${tokens[1]}`,
          );
        }
        currentVendor = tokens[1];
        currentVendorId = resolvedId;
        break;
      }
      case "END-VENDOR": {
        currentVendor = undefined;
        currentVendorId = undefined;
        break;
      }
      case "$INCLUDE": {
        if (tokens.length < 2) {
          throw new DictionaryParseError(lineNo, "$INCLUDE requires a path");
        }
        includes.push(tokens[1]);
        break;
      }
      default: {
        // Ignore unknown directives (ATTR_*, FLAGS, etc.) rather than failing —
        // FreeRADIUS adds new ones over time, and strict mode would reject
        // valid upstream files. This mirrors the radius npm parser behavior.
        break;
      }
    }
  }

  return { attributes, vendors, values, includes };
}
