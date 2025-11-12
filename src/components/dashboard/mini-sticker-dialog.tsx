
'use client';

import * as React from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import type { Transaction } from '@/lib/types';
import { MiniSticker } from './mini-sticker';

type MiniStickerDialogProps = {
  transaction: Transaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function MiniStickerDialog({ transaction, open, onOpenChange }: MiniStickerDialogProps) {
  if (!transaction) return null;

  const handlePrint = () => {
    const printableArea = document.querySelector('.printable-area');
    if (printableArea) {
      const stickerString = document.getElementById(`sticker-for-${transaction.id}`)?.innerHTML;
      if (stickerString) {
        // Create a temporary iframe to print only the sticker content
        const iframe = document.createElement('iframe');
        iframe.style.position = 'absolute';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);
        
        const doc = iframe.contentWindow?.document;
        if (doc) {
            doc.open();
            doc.write(`
                <html>
                <head>
                    <title>Cetak Stiker</title>
                    <style>
                        @media print {
                            @page {
                                size: 80mm 50mm;
                                margin: 0;
                            }
                            body {
                                margin: 0;
                                -webkit-print-color-adjust: exact;
                            }
                        }
                    </style>
                </head>
                <body>
                    ${stickerString}
                </body>
                </html>
            `);
            doc.close();
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            document.body.removeChild(iframe);
        }
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xs p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Pratinjau Stiker Pesanan</DialogTitle>
        </DialogHeader>
        <div id={`sticker-for-${transaction.id}`}>
          <MiniSticker transaction={transaction} />
        </div>
        <DialogFooter className="sm:justify-center p-4 border-t">
          <Button type="button" className="w-full gap-2" onClick={handlePrint}>
            <Printer className="h-4 w-4" />
            Cetak Stiker
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
