
'use client';

import * as React from 'react';
import type { Transaction } from '@/lib/types';
import { Separator } from '../ui/separator';

type MiniStickerProps = {
  transaction: Transaction;
};

export function MiniSticker({ transaction }: MiniStickerProps) {
  // Use the generated text from the transaction, or a default message if it doesn't exist.
  const followUpMessage = transaction.generatedFollowUpText || "Follow Up Cerdas";

  return (
    <div className="bg-white text-black font-sans w-[302px] p-2 border border-dashed border-black">
      <div className="text-center mb-1">
        <p className="font-bold text-lg leading-tight">{transaction.customerName}</p>
        <p className="text-xs">Nota: {String(transaction.receiptNumber).padStart(6, '0')}</p>
      </div>
      <Separator className="border-dashed border-black" />
      <div className="my-1 space-y-1">
        {transaction.items.map((item, index) => (
          <div key={index} className="text-sm">
            <p className="font-semibold leading-tight">{item.quantity}x {item.productName}</p>
            {item.notes && (
              <p className="text-xs italic pl-2 leading-tight"> &#x21B3; &quot;{item.notes}&quot;</p>
            )}
          </div>
        ))}
      </div>
      <Separator className="border-dashed border-black" />
      <div className="text-center mt-1">
        <p className="text-xs font-semibold">{followUpMessage}</p>
      </div>
    </div>
  );
}
