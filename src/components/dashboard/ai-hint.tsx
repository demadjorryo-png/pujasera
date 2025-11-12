'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

type AIHintProps = {
  title: string;
  description: string;
  className?: string;
};

export function AIHint({ title, description, className }: AIHintProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <div
          className={cn(
            'group relative flex h-8 w-full cursor-pointer items-center justify-center overflow-hidden rounded-md border border-primary/20 bg-primary/10 text-primary',
            className
          )}
        >
          <div className="animate-marquee whitespace-nowrap group-hover:pause">
            <span className="mx-4 flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4" /> {title}{' '}
              <span className="hidden sm:inline-block">- Klik untuk info lebih lanjut</span>
            </span>
          </div>
          <div className="animate-marquee2 absolute whitespace-nowrap group-hover:pause">
            <span className="mx-4 flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4" /> {title}{' '}
              <span className="hidden sm:inline-block">- Klik untuk info lebih lanjut</span>
            </span>
          </div>
        </div>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-headline tracking-wider text-primary">
            <Sparkles />
            {title}
          </DialogTitle>
          <DialogDescription className="pt-2">{description}</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
