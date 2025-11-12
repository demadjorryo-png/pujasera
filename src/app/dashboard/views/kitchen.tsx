'use client';

import * as React from 'react';
import { useDashboard } from '@/contexts/dashboard-context';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { CheckCircle, ChefHat, Loader, MessageSquare, Printer, Send } from 'lucide-react';
import { doc, writeBatch, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/auth-context';
import { Badge } from '@/components/ui/badge';
import type { Transaction, TransactionStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

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
        // For pujasera users, they see all 'Diproses' transactions in their group.
        // For tenant users, they only see their own 'Diproses' transactions.
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
        
        // Determine the correct storeId for the transaction document.
        // For pujasera, it's the pujasera's storeId. For tenants, it's their own storeId.
        const txStoreId = isPujaseraAction && transaction.pujaseraGroupSlug ? activeStore.id : transaction.storeId;
        
        try {
            const transactionRef = doc(db, 'stores', txStoreId, 'transactions', transaction.id);
            const transactionDoc = await getDoc(transactionRef);

            if (!transactionDoc.exists()) {
                throw new Error("Transaksi tidak ditemukan.");
            }

            const batch = writeBatch(db);
            let successMessage = '';

            if (action === 'complete') {
                batch.update(transactionRef, { status: 'Selesai' });
                successMessage = `Pesanan untuk ${transaction.customerName} telah ditandai selesai.`;

                if (transaction.tableId) {
                    const tableRef = doc(db, 'stores', txStoreId, 'tables', transaction.tableId);
                    const tableDoc = await getDoc(tableRef);
                    if (tableDoc.exists()) {
                        batch.update(tableRef, { status: 'Menunggu Dibersihkan' });
                    }
                }
            } else if (action === 'ready') {
                batch.update(transactionRef, { status: 'Siap Diambil' });
                successMessage = `Pesanan tenant ${activeStore.name} siap diambil.`;
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

    return (
        <div className="h-[calc(100vh-8rem)] flex flex-col">
            <ScrollArea className="flex-grow">
                <div className="space-y-4 p-1">
                    {activeOrders.length > 0 ? (
                        activeOrders.map(order => (
                            <Card key={order.id} className="flex flex-col">
                                <CardHeader>
                                    <div className='flex justify-between items-start'>
                                        <div>
                                            <CardTitle>{order.customerName}</CardTitle>
                                            <CardDescription>
                                                {formatDistanceToNow(new Date(order.createdAt), { addSuffix: true, locale: idLocale })}
                                            </CardDescription>
                                        </div>
                                        {getStatusBadge(order.status)}
                                    </div>
                                </CardHeader>
                                <CardContent className="flex-grow space-y-2">
                                    {order.items.map((item, index) => (
                                        <div key={index} className="flex justify-between items-start">
                                            <div className="flex-1">
                                                <span className="font-semibold">{item.quantity}x</span> {item.productName}
                                                {item.notes && (
                                                    <p className="text-xs text-muted-foreground italic pl-4">&quot;{item.notes}&quot;</p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
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
                        ))
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
