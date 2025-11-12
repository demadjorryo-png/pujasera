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
import { doc, writeBatch, getDoc, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
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

// This represents a "view" of an order for a specific tenant
type TenantOrderSlice = {
    parentTransaction: Transaction;
    tenantStoreId: string;
    tenantStoreName: string;
    items: CartItem[];
};


export default function Kitchen({ onFollowUpRequest, onPrintStickerRequest }: KitchenProps) {
    const { dashboardData, refreshData } = useDashboard();
    const { activeStore, currentUser } = useAuth();
    const { transactions, tables } = dashboardData;
    const { toast } = useToast();
    const [processingId, setProcessingId] = React.useState<string | null>(null);
    
    const isPujaseraUser = currentUser?.role === 'pujasera_admin' || currentUser?.role === 'pujasera_cashier';

    const tenantOrderSlices = React.useMemo(() => {
        const activeTransactions = transactions.filter(t => t.status === 'Diproses' || t.status === 'Siap Diambil');

        if (!isPujaseraUser) {
            // For regular tenants, their transactions are their slices
            return activeTransactions.filter(t => t.storeId === activeStore?.id).map(tx => ({
                parentTransaction: tx,
                tenantStoreId: tx.storeId,
                tenantStoreName: activeStore?.name || 'Toko Anda',
                items: tx.items,
            }));
        }
        
        // For pujasera users, we "explode" each transaction into slices per tenant
        const slices: TenantOrderSlice[] = [];
        activeTransactions.forEach(tx => {
            const itemsByTenant = tx.items.reduce((acc, item) => {
                const storeId = item.storeId || 'unknown';
                const storeName = item.storeName || 'Tenant Tidak Diketahui';
                if (!acc[storeId]) {
                    acc[storeId] = { storeName, items: [] };
                }
                acc[storeId].items.push(item);
                return acc;
            }, {} as Record<string, { storeName: string; items: CartItem[] }>);

            Object.entries(itemsByTenant).forEach(([tenantId, data]) => {
                slices.push({
                    parentTransaction: tx,
                    tenantStoreId: tenantId,
                    tenantStoreName: data.storeName,
                    items: data.items,
                });
            });
        });
        
        // Sort all slices by the original transaction time
        return slices.sort((a, b) => new Date(a.parentTransaction.createdAt).getTime() - new Date(b.parentTransaction.createdAt).getTime());

    }, [transactions, isPujaseraUser, activeStore]);


    const handleAction = async (slice: TenantOrderSlice, action: 'complete' | 'ready') => {
        if (!activeStore) return;
        setProcessingId(slice.parentTransaction.id + slice.tenantStoreId);

        try {
            const batch = writeBatch(db);
            let successMessage = '';
            
            if (action === 'complete') { // This action is only for the whole pujasera transaction
                 const transactionRef = doc(db, 'stores', activeStore.id, 'transactions', slice.parentTransaction.id);
                 const transactionDoc = await getDoc(transactionRef);
                 if (!transactionDoc.exists()) throw new Error("Transaksi tidak ditemukan.");

                batch.update(transactionRef, { status: 'Selesai' });
                successMessage = `Pesanan untuk ${slice.parentTransaction.customerName} telah ditandai selesai.`;

                if (slice.parentTransaction.tableId) {
                    const tableRef = doc(db, 'stores', activeStore.id, 'tables', slice.parentTransaction.tableId);
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
                // When a tenant marks their part as ready, they are updating their OWN sub-transaction.
                // We need to find the correct sub-transaction document.
                const subTransactionQuery = await getDocs(query(collection(db, 'stores', slice.tenantStoreId, 'transactions'), where('receiptNumber', '==', slice.parentTransaction.receiptNumber)));
                
                if (subTransactionQuery.empty) {
                    // Fallback to update the main transaction if sub-transaction is not found (for non-pujasera flow)
                    const mainTransactionRef = doc(db, 'stores', slice.tenantStoreId, 'transactions', slice.parentTransaction.id);
                    await updateDoc(mainTransactionRef, { status: 'Siap Diambil' });
                } else {
                    const subTransactionRef = subTransactionQuery.docs[0].ref;
                    await updateDoc(subTransactionRef, { status: 'Siap Diambil' });
                }

                successMessage = `Pesanan dari ${slice.tenantStoreName} (Nota #${String(slice.parentTransaction.receiptNumber).padStart(6, '0')}) telah ditandai siap.`;
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
                <div className={cn("p-1", isPujaseraUser ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" : "space-y-4")}>
                    {tenantOrderSlices.length > 0 ? (
                        tenantOrderSlices.map((slice, idx) => {
                            const { parentTransaction, tenantStoreName, items } = slice;
                            const tableName = tables.find(t => t.id === parentTransaction.tableId)?.name;
                            const uniqueKey = `${parentTransaction.id}-${slice.tenantStoreId}-${idx}`;

                            return (
                            <Card key={uniqueKey} className="flex flex-col">
                                <CardHeader>
                                    <div className='flex justify-between items-start'>
                                        <div>
                                            {isPujaseraUser ? (
                                                <CardTitle className="flex items-center gap-2 text-base"><Store className="h-4 w-4"/>{tenantStoreName}</CardTitle>
                                            ) : (
                                                <CardTitle>{parentTransaction.customerName}</CardTitle>
                                            )}
                                            <CardDescription>
                                                Nota: {String(parentTransaction.receiptNumber).padStart(6, '0')}
                                                {tableName && ` • Meja: ${tableName}`}
                                                {' • '}
                                                {formatDistanceToNow(new Date(parentTransaction.createdAt), { addSuffix: true, locale: idLocale })}
                                            </CardDescription>
                                        </div>
                                        {getStatusBadge(parentTransaction.status)}
                                    </div>
                                    {isPujaseraUser && <CardTitle className="text-lg pt-2">{parentTransaction.customerName}</CardTitle>}
                                </CardHeader>
                                <CardContent className="flex-grow space-y-2">
                                     {items.map((item, index) => (
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
                                <CardFooter className="flex flex-col gap-2">
                                     <Button 
                                        variant="outline"
                                        className="w-full" 
                                        onClick={() => onPrintStickerRequest(parentTransaction)}
                                    >
                                        <Printer className="mr-2 h-4 w-4" />
                                        Cetak Stiker
                                    </Button>
                                    {isPujaseraUser ? (
                                        <>
                                            <Button 
                                                variant="outline"
                                                className="w-full" 
                                                onClick={() => onFollowUpRequest(parentTransaction)}
                                            >
                                                <MessageSquare className="mr-2 h-4 w-4" />
                                                Follow Up Pelanggan
                                            </Button>
                                            <Button 
                                                className="w-full" 
                                                onClick={() => handleAction(slice, 'complete')}
                                                disabled={processingId === (parentTransaction.id + slice.tenantStoreId)}
                                            >
                                                {processingId === (parentTransaction.id + slice.tenantStoreId) ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                                                Selesaikan Pesanan
                                            </Button>
                                        </>
                                    ) : (
                                        <Button 
                                            className="w-full" 
                                            onClick={() => handleAction(slice, 'ready')}
                                            disabled={processingId === (parentTransaction.id + slice.tenantStoreId) || parentTransaction.status === 'Siap Diambil'}
                                        >
                                            {processingId === (parentTransaction.id + slice.tenantStoreId) ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
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
