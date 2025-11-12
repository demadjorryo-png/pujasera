
'use client';

import * as React from 'react';
import type { Transaction, ReceiptSettings, User } from '@/lib/types';
import { getReceiptSettings, defaultReceiptSettings } from '@/lib/receipt-settings';
import { ShoppingCart } from 'lucide-react';

type ReceiptProps = {
    transaction: Transaction;
    users: User[];
};

export function Receipt({ transaction, users }: ReceiptProps) {
  const [settings, setSettings] = React.useState<ReceiptSettings>(defaultReceiptSettings);
  
  React.useEffect(() => {
    if (transaction?.storeId) {
      getReceiptSettings(transaction.storeId).then(setSettings);
    }
  }, [transaction?.storeId]);

  if (!transaction) return null;

  const staff = users.find(u => u.id === transaction.staffId);
  const { headerText, footerText, promoText } = settings;

  return (
    <div className="bg-white text-black text-sm w-[300px] p-4 font-code mx-auto">
      <div className="text-center space-y-1 mb-4">
        <div className="flex justify-center items-center gap-2">
            <ShoppingCart className="h-8 w-8" />
            <p className="font-headline text-2xl tracking-wider">CHIKA POS</p>
        </div>
        {headerText.split('\n').map((line, index) => (
          <p key={index}>{line}</p>
        ))}
      </div>
      <div className="border-t border-dashed border-black" />
      <div className="my-2 space-y-1">
        <div className="flex justify-between">
            <span>Nota:</span>
            <span>{String(transaction.receiptNumber).padStart(6, '0')}</span>
        </div>
        <div className="flex justify-between">
            <span>Kasir:</span>
            <span>{staff?.name || transaction.staffId}</span>
        </div>
        <div className="flex justify-between">
            <span>Pelanggan:</span>
            <span>{transaction.customerName}</span>
        </div>
        <div className="flex justify-between">
            <span>Tanggal:</span>
            <span>{new Date(transaction.createdAt).toLocaleString('id-ID', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            })}</span>
        </div>
      </div>
      <div className="border-t border-dashed border-black" />
      <div className="my-2 space-y-1">
        {transaction.items.map((item) => (
          <div key={item.productId}>
            <p>{item.productName}</p>
            {item.notes && (
              <p className="text-xs italic text-gray-600 pl-2"> &#x21B3; {item.notes}</p>
            )}
            <div className="flex justify-between">
              <span>{item.quantity} x {item.price.toLocaleString('id-ID')}</span>
              <span>{(item.quantity * item.price).toLocaleString('id-ID')}</span>
            </div>
          </div>
        ))}
      </div>
       <div className="border-t border-dashed border-black" />
       <div className="my-2 space-y-1">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>Rp {transaction.subtotal.toLocaleString('id-ID')}</span>
          </div>
           <div className="flex justify-between">
            <span>Diskon</span>
            <span>-Rp {transaction.discountAmount.toLocaleString('id-ID')}</span>
          </div>
          {transaction.taxAmount > 0 && (
            <div className="flex justify-between">
              <span>Pajak</span>
              <span>Rp {transaction.taxAmount.toLocaleString('id-ID')}</span>
            </div>
          )}
          {transaction.serviceFeeAmount > 0 && (
            <div className="flex justify-between">
              <span>Biaya Layanan</span>
              <span>Rp {transaction.serviceFeeAmount.toLocaleString('id-ID')}</span>
            </div>
          )}
       </div>
       <div className="border-t border-dashed border-black" />
       <div className="my-2 space-y-1 font-semibold">
         <div className="flex justify-between">
            <span>TOTAL</span>
            <span>Rp {transaction.totalAmount.toLocaleString('id-ID')}</span>
         </div>
       </div>
        <div className="border-t border-dashed border-black" />
         <div className="text-center mt-4 space-y-2">
            {promoText && <p className="font-semibold">{promoText}</p>}
            {footerText.split('\n').map((line, index) => (
                <p key={index}>{line}</p>
            ))}
          <p className="font-semibold">Poin didapat: +{transaction.pointsEarned}</p>
          {transaction.pointsRedeemed > 0 && <p className="font-semibold">Poin ditukar: -{transaction.pointsRedeemed}</p>}
       </div>
    </div>
  );
}
