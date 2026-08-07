import { serializeJsonLd } from '@/lib/json-ld';

/**
 * A block of structured data, and the only way one reaches a page.
 *
 * It exists for the same reason `Photograph` does: the dangerous part is a
 * detail that is easy to leave out at a call site. Structured data has to be
 * written with `dangerouslySetInnerHTML`, because React would otherwise escape
 * the JSON into something no crawler can read, and the homepage feeds
 * user-authored plan text into it. Routing every block through here means the
 * escaping in `serializeJsonLd` cannot be forgotten by the next block somebody
 * adds, and a page that renders structured data never needs to name the
 * dangerous prop itself.
 */
export default function JsonLd({ data }: { data: unknown }) {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />
  );
}
