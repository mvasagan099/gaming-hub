import { useEffect, useState } from 'react';
import { apiClient } from '../../services/api/client';

export function AdminAuditPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError('Audit logs endpoint not yet implemented in the API. Coming soon.');
  }, []);

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">Audit Logs</h1>
      {error && (
        <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4 text-yellow-600">
          <p className="font-medium">{error}</p>
        </div>
      )}
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="text-muted-foreground">
          This page will display system-wide audit logs including user actions, admin changes,
          security events, and system operations.
        </p>
      </div>
    </div>
  );
}