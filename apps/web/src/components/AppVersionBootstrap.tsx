import { APP_REVISION } from '@/lib/app-revision';
import { buildAppVersionBootstrapScript } from '@/lib/app-version-bootstrap';

/** Inline script — must run before the service worker serves a stale shell. */
export function AppVersionBootstrap() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: buildAppVersionBootstrapScript(APP_REVISION),
      }}
    />
  );
}
