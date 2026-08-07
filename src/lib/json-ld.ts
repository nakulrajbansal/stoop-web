/**
 * JSON-LD, serialized so it cannot break out of its own script element.
 *
 * A `<script type="application/ld+json">` body is never run as JavaScript, but
 * it is still read by the HTML tokenizer, which leaves script data at the first
 * literal `</script` sequence no matter where in the text it sits. The homepage
 * puts user-authored plan text into the ItemList block, so a plan whose first
 * 90 characters contain `</script>` would close the element early and drop the
 * rest of that plan into the document as markup. `JSON.stringify` does not help
 * here: `<` is a perfectly ordinary character inside a JSON string.
 *
 * So the escaping happens after serialization, on the finished JSON text:
 *
 *   `<`  is the one that matters. With it gone, neither `</script` nor the
 *        `<!--` that starts the script-data-escaped state can ever be spelled,
 *        which is the whole attack surface for embedded script data.
 *   `>`  cannot open anything on its own once `<` is escaped. It is escaped
 *        anyway so the payload stays inert if it is ever moved somewhere with a
 *        different content model, and it costs nothing.
 *   U+2028 and U+2029 are legal inside a JSON string but are line terminators
 *        to older JavaScript parsers, so they are escaped for the same reason:
 *        the text should survive being embedded anywhere, not just here.
 *
 * Every replacement is a `\uXXXX` escape inside a JSON string literal, which is
 * the same character to any JSON parser. The payload therefore still parses
 * back to exactly the object that went in, which is what search engines read.
 * None of the replacement text contains a character another replacement looks
 * for, so the order of the four is irrelevant.
 *
 * The two separators are built with fromCharCode rather than written out: both
 * are invisible in an editor, and one of them is not even legal inside a
 * regular expression literal.
 */
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

export function serializeJsonLd(data: unknown): string {
  // stringify answers undefined for a value it cannot represent. An empty
  // block is inert, and is a great deal better than throwing while rendering.
  const json = JSON.stringify(data) ?? 'null';
  return json
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .split(LINE_SEPARATOR)
    .join('\\u2028')
    .split(PARAGRAPH_SEPARATOR)
    .join('\\u2029');
}
