// Gera prisma/schema.prisma a partir do CSV de introspecção
// (schema_publico_colunas.csv), extraído via SQL editor do Lovable Cloud.
// Rodar: node gen-schema.js > schema.prisma

const fs = require("fs");
const path = require("path");

const csvPath = path.resolve(
  __dirname,
  "../../../extracao-ipesquisei/schema_publico_colunas.csv"
);
const raw = fs.readFileSync(csvPath, "utf8");

function parseCsv(text) {
  const rows = [];
  let cur = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ";") {
      cur.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      cur.push(field);
      rows.push(cur);
      cur = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length || cur.length) {
    cur.push(field);
    rows.push(cur);
  }
  return rows.filter((r) => r.length > 1);
}

const rows = parseCsv(raw);
const header = rows[0];
const idx = Object.fromEntries(header.map((h, i) => [h, i]));
const data = rows.slice(1);

function pascalCase(name) {
  return name;
}

function toFieldName(col) {
  return col;
}

function mapType(dataType, udtName, isNullable, colDefault) {
  const opt = isNullable === "YES" ? "?" : "";
  let prismaType;
  let attr = "";

  if (udtName.startsWith("_")) {
    // Array type, e.g. _text -> text[]
    const base = udtName.slice(1);
    const inner = mapType(base, base, "NO", null);
    return { prismaType: inner.prismaType + "[]", attr: "" };
  }

  switch (udtName) {
    case "uuid":
      prismaType = "String";
      attr = " @db.Uuid";
      break;
    case "text":
      prismaType = "String";
      break;
    case "varchar":
    case "bpchar":
      prismaType = "String";
      break;
    case "jsonb":
      prismaType = "Json";
      break;
    case "json":
      prismaType = "Json";
      break;
    case "bool":
      prismaType = "Boolean";
      break;
    case "int2":
      prismaType = "Int";
      attr = " @db.SmallInt";
      break;
    case "int4":
      prismaType = "Int";
      break;
    case "int8":
      prismaType = "BigInt";
      break;
    case "numeric":
      prismaType = "Decimal";
      attr = " @db.Decimal";
      break;
    case "float4":
      prismaType = "Float";
      attr = " @db.Real";
      break;
    case "float8":
      prismaType = "Float";
      break;
    case "date":
      prismaType = "DateTime";
      attr = " @db.Date";
      break;
    case "timestamp":
      prismaType = "DateTime";
      attr = " @db.Timestamp(6)";
      break;
    case "timestamptz":
      prismaType = "DateTime";
      attr = " @db.Timestamptz(6)";
      break;
    default:
      prismaType = "String";
      attr = ` /* udt=${udtName} */`;
  }
  return { prismaType, attr, opt };
}

function defaultAttr(colDefault, prismaType) {
  if (!colDefault) return "";
  if (colDefault === "gen_random_uuid()") return " @default(dbgenerated(\"gen_random_uuid()\"))";
  if (colDefault === "now()") return " @default(now())";
  if (/^'\{\}'::jsonb$/.test(colDefault)) return ' @default("{}")';
  if (/^'\[\]'::jsonb$/.test(colDefault)) return ' @default("[]")';
  if (colDefault === "true") return " @default(true)";
  if (colDefault === "false") return " @default(false)";
  if (/^-?\d+$/.test(colDefault) && prismaType === "Int") return ` @default(${colDefault})`;
  if (/^-?\d+(\.\d+)?$/.test(colDefault) && prismaType === "Decimal") return ` @default(${colDefault})`;
  return "";
}

const byTable = {};
for (const r of data) {
  const table = r[idx.table_name];
  if (!byTable[table]) byTable[table] = [];
  byTable[table].push({
    name: r[idx.column_name],
    dataType: r[idx.data_type],
    udtName: r[idx.udt_name],
    nullable: r[idx.is_nullable],
    default: r[idx.column_default],
    pk: r[idx.pk],
    pos: Number(r[idx.ordinal_position]),
  });
}

let out = "";
out += `// AUTOGERADO por gen-schema.js a partir da introspecção real do banco.\n`;
out += `// Fonte: extracao-ipesquisei/schema_publico_colunas.csv (Lovable Cloud, projeto iPesquisei).\n`;
out += `// Revisar antes de rodar migrate — alguns tipos/defaults podem precisar de ajuste manual\n`;
out += `// (marcados com /* udt=... */ quando o tipo não foi reconhecido).\n\n`;
out += `generator client {\n  provider = "prisma-client-js"\n}\n\n`;
out += `datasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n}\n\n`;

const tableNames = Object.keys(byTable).sort();
for (const table of tableNames) {
  const cols = byTable[table].sort((a, b) => a.pos - b.pos);
  const pkCols = cols.filter((c) => c.pk === "PRIMARY KEY").map((c) => c.name);
  const singlePk = pkCols.length === 1 ? pkCols[0] : null;
  out += `model ${table} {\n`;
  for (const c of cols) {
    const { prismaType, attr, opt } = mapType(c.dataType, c.udtName, c.nullable, c.default);
    const def = defaultAttr(c.default, prismaType);
    const pk = singlePk === c.name ? " @id" : "";
    out += `  ${c.name} ${prismaType}${opt || ""}${pk}${def}${attr}\n`;
  }
  if (pkCols.length > 1) {
    out += `\n  @@id([${pkCols.join(", ")}])`;
  }
  out += `\n  @@map("${table}")\n`;
  out += `}\n\n`;
}

process.stdout.write(out);
