'use client';

import * as React from 'react';
import { useDashboard } from '@/contexts/dashboard-context';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { CheckCircle, ChefHat, Loader, MessageSquare, Printer, Send, Store } from 'lucide-react';
import { doc, writeBatch, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/auth-context';
import { Badge } from '@/components/ui/badge';
import type { Transaction, TransactionStatus, CartItem } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

type KitchenProps = {
    onFollowUpRequest: (transaction: Transaction) => void;
    onPrintStickerRequest: (transaction: Transaction) => void;
};

export default function Kitchen({ onFollowUpRequest, onPrintStickerRequest }: KitchenProps) {
    const { dashboardData, refreshData } = useDashboard();
    const { activeStore, currentUser } = useAuth();
    const { transactions } = dashboardData;
    const { toast } = useToast();
    const [processingId, setProcessingId] = React.useState<string | null>(null);

    const activeOrders = React.useMemo(() => {
        const relevantTransactions = currentUser?.role === 'pujasera_admin' || currentUser?.role === 'pujasera_cashier'
            ? transactions
            : transactions.filter(t => t.storeId === activeStore?.id);

        return relevantTransactions
            .filter(t => t.status === 'Diproses' || t.status === 'Siap Diambil')
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }, [transactions, currentUser?.role, activeStore?.id]);
    
    const handleAction = async (transaction: Transaction, action: 'complete' | 'ready') => {
        if (!activeStore) return;
        setProcessingId(transaction.id);
        
        const isPujaseraAction = currentUser?.role === 'pujasera_admin' || currentUser?.role === 'pujasera_cashier';
        
        // For Pujasera users, the transaction is on the main pujasera store document.
        // For Tenant users, it's on their own store document.
        const txStoreId = isPujaseraAction ? activeStore.id : transaction.storeId;
        
        try {
            const batch = writeBatch(db);
            let successMessage = '';

            if (action === 'complete') {
                 const transactionRef = doc(db, 'stores', txStoreId, 'transactions', transaction.id);
                 const transactionDoc = await getDoc(transactionRef);
                 if (!transactionDoc.exists()) throw new Error("Transaksi tidak ditemukan.");

                batch.update(transactionRef, { status: 'Selesai' });
                successMessage = `Pesanan untuk ${transaction.customerName} telah ditandai selesai.`;

                if (transaction.tableId) {
                    const tableRef = doc(db, 'stores', txStoreId, 'tables', transaction.tableId);
                    const tableDoc = await getDoc(tableRef);
                    if (tableDoc.exists()) {
                        if (tableDoc.data()?.isVirtual) {
                            batch.delete(tableRef);
                        } else {
                            batch.update(tableRef, { status: 'Menunggu Dibersihkan', currentOrder: null });
                        }
                    }
                }
            } else if (action === 'ready') {
                // When a tenant marks their part as ready, they are updating their own sub-transaction
                const tenantTransactionRef = doc(db, 'stores', activeStore.id, 'transactions', transaction.id);
                batch.update(tenantTransactionRef, { status: 'Siap Diambil' });
                successMessage = `Pesanan Anda untuk nota #${String(transaction.receiptNumber).padStart(6, '0')} telah ditandai siap.`;
            }

            await batch.commit();

            toast({
                title: 'Status Diperbarui!',
                description: successMessage,
            });
            refreshData();
        } catch (error) {
            console.error("Error processing kitchen action:", error);
            toast({
                variant: "destructive",
                title: "Gagal Memperbarui Status",
                description: (error as Error).message
            });
        } finally {
            setProcessingId(null);
        }
    };
    
    const isPujaseraUser = currentUser?.role === 'pujasera_admin' || currentUser?.role === 'pujasera_cashier';

    const getStatusBadge = (status: TransactionStatus) => {
        switch(status) {
            case 'Diproses':
                return <Badge variant="secondary" className='bg-amber-500/20 text-amber-800 border-amber-500/50'>{status}</Badge>;
            case 'Siap Diambil':
                 return <Badge variant="secondary" className='bg-sky-500/20 text-sky-800 border-sky-500/50'>{status}</Badge>;
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    }

    const groupItemsByStore = (items: CartItem[]) => {
        return items.reduce((acc, item) => {
            const storeName = item.storeName || 'Toko Tidak Dikenal';
            if (!acc[storeName]) {
                acc[storeName] = [];
            }
            acc[storeName].push(item);
            return acc;
        }, {} as Record<string, CartItem[]>);
    };

    return (
        <div className="h-[calc(100vh-8rem)] flex flex-col">
            <ScrollArea className="flex-grow">
                <div className="space-y-4 p-1">
                    {activeOrders.length > 0 ? (
                        activeOrders.map(order => {
                            const itemsByStore = isPujaseraUser ? groupItemsByStore(order.items) : null;
                            return (
                            <Card key={order.id} className="flex flex-col">
                                <CardHeader>
                                    <div className='flex justify-between items-start'>
                                        <div>
                                            <CardTitle>{order.customerName}</CardTitle>
                                            <CardDescription>
                                                Nota: {String(order.receiptNumber).padStart(6, '0')} &bull; {formatDistanceToNow(new Date(order.createdAt), { addSuffix: true, locale: idLocale })}
                                            </CardDescription>
                                        </div>
                                        {getStatusBadge(order.status)}
                                    </div>
                                </CardHeader>
                                <CardContent className="flex-grow space-y-4">
                                     {itemsByStore ? (
                                        Object.entries(itemsByStore).map(([storeName, items]) => (
                                            <div key={storeName} className="space-y-2 rounded-md border p-3">
                                                <p className="font-semibold text-sm flex items-center gap-2"><Store className="h-4 w-4 text-muted-foreground"/> {storeName}</p>
                                                <Separator />
                                                {items.map((item, index) => (
                                                    <div key={index} className="flex justify-between items-start text-sm ml-2">
                                                        <div>
                                                            <span className="font-semibold">{item.quantity}x</span> {item.productName}
                                                            {item.notes && (
                                                                <p className="text-xs text-muted-foreground italic pl-4">&quot;{item.notes}&quot;</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ))
                                     ) : (
                                        order.items.map((item, index) => (
                                            <div key={index} className="flex justify-between items-start">
                                                <div className="flex-1">
                                                    <span className="font-semibold">{item.quantity}x</span> {item.productName}
                                                    {item.notes && (
                                                        <p className="text-xs text-muted-foreground italic pl-4">&quot;{item.notes}&quot;</p>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                     )}
                                </CardContent>
                                <CardFooter className="flex gap-2">
                                     <Button 
                                        variant="outline"
                                        className="w-full" 
                                        onClick={() => onPrintStickerRequest(order)}
                                    >
                                        <Printer className="mr-2 h-4 w-4" />
                                        Cetak Stiker
                                    </Button>
                                    {isPujaseraUser ? (
                                        <>
                                            <Button 
                                                variant="outline"
                                                className="w-full" 
                                                onClick={() => onFollowUpRequest(order)}
                                            >
                                                <MessageSquare className="mr-2 h-4 w-4" />
                                                Follow Up
                                            </Button>
                                            <Button 
                                                className="w-full" 
                                                onClick={() => handleAction(order, 'complete')}
                                                disabled={processingId === order.id}
                                            >
                                                {processingId === order.id ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                                                Selesaikan
                                            </Button>
                                        </>
                                    ) : (
                                        <Button 
                                            className="w-full" 
                                            onClick={() => handleAction(order, 'ready')}
                                            disabled={processingId === order.id || order.status === 'Siap Diambil'}
                                        >
                                            {processingId === order.id ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                                            Pesanan Siap
                                        </Button>
                                    )}
                                </CardFooter>
                            </Card>
                        )})
                    ) : (
                        <div className="col-span-full flex flex-col items-center justify-center text-center text-muted-foreground h-96">
                            <ChefHat className="w-16 h-16 mb-4" />
                            <h3 className="text-lg font-semibold">Tidak ada pesanan aktif.</h3>
                            <p>Halaman ini akan diperbarui secara otomatis saat pesanan baru masuk.</p>
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}
