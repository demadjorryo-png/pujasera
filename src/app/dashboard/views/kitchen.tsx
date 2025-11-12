
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
import { doc, writeBatch, getDoc, collection, query, where, getDocs, updateDoc, runTransaction } from 'firebase/firestore';
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
    subTransactionId?: string; // The ID of the tenant's own transaction document
    tenantStoreId: string;
    tenantStoreName: string;
    items: CartItem[];
    status: 'Diproses' | 'Siap Diambil';
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
                subTransactionId: tx.id,
                tenantStoreId: tx.storeId,
                tenantStoreName: activeStore?.name || 'Toko Anda',
                items: tx.items,
                status: tx.status as 'Diproses' | 'Siap Diambil',
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
                    status: tx.itemsStatus?.[tenantId] || 'Diproses'
                });
            });
        });
        
        return slices.sort((a, b) => new Date(a.parentTransaction.createdAt).getTime() - new Date(b.parentTransaction.createdAt).getTime());

    }, [transactions, isPujaseraUser, activeStore]);


    const handleAction = async (slice: TenantOrderSlice, action: 'complete' | 'ready') => {
        if (!activeStore) return;
        setProcessingId(slice.parentTransaction.id + slice.tenantStoreId);

        try {
            if (action === 'complete') { // Action for pujasera admin to finalize the whole order
                 await runTransaction(db, async (transaction) => {
                    const transactionRef = doc(db, 'stores', activeStore.id, 'transactions', slice.parentTransaction.id);
                    transaction.update(transactionRef, { status: 'Selesai' });

                    if (slice.parentTransaction.tableId) {
                        const tableRef = doc(db, 'stores', activeStore.id, 'tables', slice.parentTransaction.tableId);
                        const tableDoc = await transaction.get(tableRef);
                        if (tableDoc.exists()) {
                             if (tableDoc.data()?.isVirtual) {
                                transaction.delete(tableRef);
                            } else {
                                transaction.update(tableRef, { status: 'Menunggu Dibersihkan', currentOrder: null });
                            }
                        }
                    }
                 });

                toast({ title: 'Status Diperbarui!', description: `Pesanan untuk ${slice.parentTransaction.customerName} telah ditandai selesai.`});
            
            } else if (action === 'ready') { // Action for tenant or pujasera admin on behalf of tenant
                
                await runTransaction(db, async (transaction) => {
                    // Find the sub-transaction document for the tenant
                    const q = query(collection(db, 'stores', slice.tenantStoreId, 'transactions'), where('receiptNumber', '==', slice.parentTransaction.receiptNumber), where('storeId', '==', slice.tenantStoreId));
                    const subTransactionSnapshot = await getDocs(q);

                    let subTransactionRef;
                    if (!subTransactionSnapshot.empty) {
                        subTransactionRef = subTransactionSnapshot.docs[0].ref;
                    } else if (slice.parentTransaction.id) {
                        // Fallback for non-pujasera or if sub-transaction not found by receipt number
                        subTransactionRef = doc(db, 'stores', slice.tenantStoreId, 'transactions', slice.parentTransaction.id);
                    } else {
                        throw new Error("Tidak dapat menemukan referensi transaksi yang valid untuk diperbarui.");
                    }
                    
                    // 1. Update the tenant's sub-transaction status
                    transaction.update(subTransactionRef, { status: 'Siap Diambil' });

                    // 2. Update the main pujasera transaction's itemsStatus map
                    if (slice.parentTransaction.pujaseraGroupSlug) {
                        const mainTransactionRef = doc(db, 'stores', slice.parentTransaction.pujaseraId, 'transactions', slice.parentTransaction.parentTransactionId);
                        transaction.update(mainTransactionRef, {
                            [`itemsStatus.${slice.tenantStoreId}`]: 'Siap Diambil'
                        });
                    }
                });

                toast({ title: 'Status Diperbarui!', description: `Pesanan dari ${slice.tenantStoreName} telah ditandai siap.` });
            }

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
    
    const getStatusBadge = (status: 'Diproses' | 'Siap Diambil') => {
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
                <div className={cn("p-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4")}>
                    {tenantOrderSlices.length > 0 ? (
                        tenantOrderSlices.map((slice, idx) => {
                            const { parentTransaction, tenantStoreName, items, status } = slice;
                            const tableName = tables.find(t => t.id === parentTransaction.tableId)?.name;
                            const uniqueKey = `${parentTransaction.id}-${slice.tenantStoreId}-${idx}`;

                            return (
                            <Card key={uniqueKey} className="flex flex-col">
                                <CardHeader>
                                    <div className='flex justify-between items-start'>
                                        <div>
                                            <CardTitle className="flex items-center gap-2 text-base"><Store className="h-4 w-4"/>{tenantStoreName}</CardTitle>
                                            <CardDescription>
                                                Nota: {String(parentTransaction.receiptNumber).padStart(6, '0')}
                                                {tableName && ` • Meja: ${tableName}`}
                                                {' • '}
                                                {formatDistanceToNow(new Date(parentTransaction.createdAt), { addSuffix: true, locale: idLocale })}
                                            </CardDescription>
                                        </div>
                                        {getStatusBadge(status)}
                                    </div>
                                    <CardTitle className="text-lg pt-2">{parentTransaction.customerName}</CardTitle>
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
                                            disabled={processingId === (parentTransaction.id + slice.tenantStoreId) || status === 'Siap Diambil'}
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
