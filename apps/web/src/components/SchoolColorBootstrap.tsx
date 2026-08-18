import { buildSchoolColorBootstrapScript } from '@/lib/school-color';

/** Inline script — applies the saved school palette before first paint. */
export function SchoolColorBootstrap() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: buildSchoolColorBootstrapScript(),
      }}
    />
  );
}
