
'use client';

import { BrainCircuit } from 'lucide-react';

export function AILoadingOverlay({ featureName }: { featureName: string }) {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="relative flex h-24 w-24 items-center justify-center">
        <div className="absolute h-full w-full animate-spin-slow rounded-full border-4 border-dashed border-primary/50"></div>
        <BrainCircuit className="h-10 w-10 animate-pulse text-primary" />
      </div>
      <h2 className="mt-4 font-headline text-xl tracking-wider text-foreground">
        Chika AI sedang memproses...
      </h2>
      <p className="text-muted-foreground">Membuat {featureName} untuk Anda.</p>
    </div>
  );
}
