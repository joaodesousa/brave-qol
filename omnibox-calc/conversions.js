// Natural-language conversions: "5 km to mi", "10 lb in kg", "20 USD to EUR".
// Unit factors are expressed relative to one base unit per dimension.

const UNIT_DEFINITIONS = [
  { dimension: "distance", factor: 1, symbol: "m", aliases: ["m", "meter", "meters", "metre", "metres"] },
  { dimension: "distance", factor: 1000, symbol: "km", aliases: ["km", "kilometer", "kilometers", "kilometre", "kilometres"] },
  { dimension: "distance", factor: 0.01, symbol: "cm", aliases: ["cm", "centimeter", "centimeters", "centimetre", "centimetres"] },
  { dimension: "distance", factor: 0.001, symbol: "mm", aliases: ["mm", "millimeter", "millimeters", "millimetre", "millimetres"] },
  { dimension: "distance", factor: 1609.344, symbol: "mi", aliases: ["mi", "mile", "miles"] },
  { dimension: "distance", factor: 0.9144, symbol: "yd", aliases: ["yd", "yard", "yards"] },
  { dimension: "distance", factor: 0.3048, symbol: "ft", aliases: ["ft", "foot", "feet"] },
  { dimension: "distance", factor: 0.0254, symbol: "in", aliases: ["in", "inch", "inches"] },
  { dimension: "distance", factor: 1852, symbol: "nmi", aliases: ["nmi", "nauticalmile", "nauticalmiles"] },

  { dimension: "weight", factor: 1, symbol: "kg", aliases: ["kg", "kilogram", "kilograms"] },
  { dimension: "weight", factor: 0.001, symbol: "g", aliases: ["g", "gram", "grams"] },
  { dimension: "weight", factor: 0.000001, symbol: "mg", aliases: ["mg", "milligram", "milligrams"] },
  { dimension: "weight", factor: 0.45359237, symbol: "lb", aliases: ["lb", "lbs", "pound", "pounds"] },
  { dimension: "weight", factor: 0.028349523125, symbol: "oz", aliases: ["oz", "ounce", "ounces"] },
  { dimension: "weight", factor: 6.35029318, symbol: "st", aliases: ["st", "stone", "stones"] },
  { dimension: "weight", factor: 1000, symbol: "t", aliases: ["t", "tonne", "tonnes", "metricton", "metrictons"] },
  { dimension: "weight", factor: 907.18474, symbol: "ton", aliases: ["ton", "tons"] },
];

const UNITS = Object.create(null);
for (const definition of UNIT_DEFINITIONS) {
  for (const alias of definition.aliases) UNITS[alias] = definition;
}

class ConversionError extends Error {}

function parseConversion(input, evaluateAmount) {
  // Unit names intentionally stay single-token so the separator is unambiguous.
  // Compound aliases such as "nautical miles" can be written "nauticalmiles".
  const match = input.match(/^(.+?)\s+([a-zA-Z]+)\s+(?:to|in)\s+([a-zA-Z]+)$/i);
  if (!match) return null;

  const amount = evaluateAmount(match[1]);
  if (!Number.isFinite(amount)) throw new ConversionError("Amount is not finite");

  const fromText = match[2].toLowerCase();
  const toText = match[3].toLowerCase();
  const fromUnit = UNITS[fromText];
  const toUnit = UNITS[toText];

  if (fromUnit || toUnit) {
    if (!fromUnit) throw new ConversionError(`Unknown unit "${match[2]}"`);
    if (!toUnit) throw new ConversionError(`Unknown unit "${match[3]}"`);
    if (fromUnit.dimension !== toUnit.dimension) {
      throw new ConversionError(`Cannot convert ${fromUnit.dimension} to ${toUnit.dimension}`);
    }
    return {
      kind: "unit",
      value: amount * fromUnit.factor / toUnit.factor,
      from: fromUnit.symbol,
      to: toUnit.symbol,
    };
  }

  if (/^[a-z]{3}$/i.test(match[2]) && /^[a-z]{3}$/i.test(match[3])) {
    return {
      kind: "currency",
      amount,
      from: match[2].toUpperCase(),
      to: match[3].toUpperCase(),
    };
  }

  throw new ConversionError(`Unknown units "${match[2]}" and "${match[3]}"`);
}

self.Conversions = { parseConversion, ConversionError };
