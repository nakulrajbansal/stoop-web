import Link from 'next/link';

const LINKS = [
  { href: '/admin/ops', label: 'Ops' },
  { href: '/admin/metrics', label: 'Metrics' },
  { href: '/admin/reports', label: 'Reports' }
];

// Small tab row shared by the founder-only pages so each one can reach the
// other two. Nothing here is rendered for non-admins: the pages 404 first.
export default function AdminNav({ current }: { current: '/admin/ops' | '/admin/metrics' | '/admin/reports' }) {
  return (
    <nav className="flex flex-wrap gap-2 mb-6" aria-label="Admin sections">
      {LINKS.map(link => {
        const active = link.href === current;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={`btn btn-sm ${active ? 'btn-accent' : 'btn-ghost'}`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
