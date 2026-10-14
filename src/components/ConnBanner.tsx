import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { Button, Notice } from './ui';
import type { ConnPhase } from '../lib/conn';

/** Online connection status: reconnecting → syncing → synced, or failed with retry / leave. */
export function ConnBanner({ phase, recovering, recoveredAt, onRetry, onLeave }: { phase: ConnPhase; recovering: boolean; recoveredAt: number; onRetry: () => void; onLeave: () => void }) {
  const { t } = useI18n();
  const [, force] = useState(0);
  const showSynced = phase === 'synced' && recoveredAt > 0 && performance.now() - recoveredAt < 3000;
  useEffect(() => {
    if (!showSynced) return;
    const id = setTimeout(() => force((n) => n + 1), 3100);
    return () => clearTimeout(id);
  }, [showSynced, recoveredAt]);
  if (phase === 'reconnecting')
    return (
      <Notice kind="warning" className="text-sm">
        {t('online.reconnecting')}
      </Notice>
    );
  if (phase === 'syncing' && recovering) return <Notice kind="info" className="text-sm">{t('online.syncing')}</Notice>;
  if (showSynced) return <Notice kind="success" className="text-sm">{t('online.synced')}</Notice>;
  if (phase === 'failed')
    return (
      <Notice
        kind="error"
        className="text-sm"
        actions={
          <span className="flex gap-2">
            <Button size="sm" onClick={onRetry}>
              {t('online.retry')}
            </Button>
            <Button size="sm" variant="secondary" onClick={onLeave}>
              {t('online.leave')}
            </Button>
          </span>
        }
      >
        {t('online.reconnectFailed')}
      </Notice>
    );
  return null;
}
