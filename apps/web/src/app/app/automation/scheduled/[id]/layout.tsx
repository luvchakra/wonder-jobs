/**
 * The page under this segment is fully client-rendered from local state, so
 * its server output is the same shell for every id. Declaring it static lets
 * Next prefetch and CDN-cache it instead of invoking a function per visit.
 */
export const dynamicParams = true;

export function generateStaticParams(): { id: string }[] {
  return [];
}

export default function IdLayout({ children }: { children: React.ReactNode }) {
  return children;
}
