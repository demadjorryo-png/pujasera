
'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Building } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';

export function FloatingStoreIndicator() {
  const { activeStore } = useAuth();
  
  if (!activeStore) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 non-printable">
      <Badge variant="secondary" className="flex items-center gap-2 py-2 px-3 shadow-lg border-primary/20">
        <Building className="h-4 w-4" />
        <span className="font-semibold">Toko: {activeStore.name}</span>
      </Badge>
    </div>
  );
}
