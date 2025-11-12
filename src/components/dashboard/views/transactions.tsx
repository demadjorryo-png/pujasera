
'use client';

import * as React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Transaction, User, Customer, TransactionStatus } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Volume2, Send, CheckCircle, Loader, Calendar as CalendarIcon, Printer, Sparkles } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { OrderReadyDialog } from '@/components/dashboard/order-ready-dialog';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';
import { useDashboard } from '@/contexts/dashboard-context';
import { db, auth } from '@/lib/firebase';
import { doc, writeBatch, getDoc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DateRange } from 'react-day-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, isWithinInterval, startOfMonth, endOfMonth } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { OrderReadyFollowUpInput, OrderReadyFollowUpOutput } from '@/ai/flows/order-ready-follow-up';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type TransactionsProps = {
    onPrintRequest: (transaction: Transaction) => void;
};

function TransactionDetailsDialog({ transaction, open, onOpenChange, users }: { transaction: Transaction; open: boolean; onOpenChange: (open: boolean) => void; users: User[] }) {
    if (!transaction) return null;
    
    const staff = (users || []).find(u => u.id === transaction.staffId);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="font-headline tracking-wider">Detail Transaksi</DialogTitle>
                    <DialogDescription>
                        ID: {transaction.id}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                   <div>
                        <p className="text-sm text-muted-foreground">Pelanggan</p>
                        <p className="font-medium">{transaction.customerName}</p>
                   </div>
                    <div>
                        <p className="text-sm text-muted-foreground">Kasir</p>
                        <p className="font-medium">{staff?.name || 'Unknown'}</p>
                   </div>
                   <div>
                        <p className="text-sm text-muted-foreground">Tanggal</p>
                        <p className="font-medium">{new Date(transaction.createdAt).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}</p>
                   </div>
                   <Separator />
                   <div className="space-y-2">
                        <p className="font-medium">Item Dibeli</p>
                        {transaction.items.map(item => (
                            <div key={item.productId} className="flex justify-between items-start text-sm">
                                <div>
                                    <p>{item.productName}</p>
                                    <p className="text-muted-foreground">{item.quantity} x Rp {item.price.toLocaleString('id-ID')}</p>
                                    {item.notes && <p className="text-xs italic text-blue-600 pl-2"> &#x21B3; {item.notes}</p>}
                                </div>
                                <p>Rp {(item.quantity * item.price).toLocaleString('id-ID')}</p>
                            </div>
                        ))}
                   </div>
                   <Separator />
                   <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                            <p className="text-muted-foreground">Subtotal</p>
                            <p>Rp {transaction.subtotal.toLocaleString('id-ID')}</p>
                        </div>
                        <div className="flex justify-between text-destructive">
                            <p>Diskon</p>
                            <p>- Rp {transaction.discountAmount.toLocaleString('id-ID')}</p>
                        </div>
                         {transaction.taxAmount > 0 && (
                            <div className="flex justify-between">
                                <p className="text-muted-foreground">Pajak</p>
                                <p>Rp {transaction.taxAmount.toLocaleString('id-ID')}</p>
                            </div>
                        )}
                        {transaction.serviceFeeAmount > 0 && (
                            <div className="flex justify-between">
                                <p className="text-muted-foreground">Biaya Layanan</p>
                                <p>Rp {transaction.serviceFeeAmount.toLocaleString('id-ID')}</p>
                            </div>
                        )}
                        <div className="flex justify-between font-medium">
                            <p>Total</p>
                            <p>Rp {transaction.totalAmount.toLocaleString('id-ID')}</p>
                        </div>
                        <div className="flex justify-between">
                            <p className="text-muted-foreground">Metode Pembayaran</p>
                            <p>{transaction.paymentMethod}</p>
                        </div>
                         <div className="flex justify-between">
                            <p className="text-muted-foreground">Poin Didapat</p>
                            <p className="text-primary">+{transaction.pointsEarned} pts</p>
                        </div>
                         <div className="flex justify-between text-destructive">
                            <p>Poin Ditukar</p>
                            <p>-{transaction.pointsRedeemed} pts</p>
                        </div>
                   </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

type StatusFilter = 'Semua' | 'Diproses' | 'Selesai';

export default function Transactions({ onPrintRequest }: TransactionsProps) {
  const { activeStore } = useAuth();
  const { dashboardData, isLoading, refreshData: onDataChange } = useDashboard();
  const { transactions, users, customers } = dashboardData || {};
  
  const { toast } = useToast();
  const [selectedTransaction, setSelectedTransaction] = React.useState<Transaction | null>(null);
  const [actionInProgress, setActionInProgress] = React.useState<{ transaction: Transaction; type: 'call' | 'whatsapp' } | null>(null);
  const [completingTransactionId, setCompletingTransactionId] = React.useState<string | null>(null);
  const [transactionToComplete, setTransactionToComplete] = React.useState<Transaction | null>(null);
  const [generatingTextId, setGeneratingTextId] = React.useState<string | null>(null);
  const [sentWhatsappIds, setSentWhatsappIds] = React.useState<Set<string>>(new Set());

  const [date, setDate] = React.useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('Semua');
  const [currentPage, setCurrentPage] = React.useState(1);
  const itemsPerPage = 100;

  const filteredTransactions = React.useMemo(() => {
    let dateFiltered = transactions || [];
    if (date?.from && date?.to) {
        const fromDate = new Date(date.from.setHours(0, 0, 0, 0));
        const toDate = new Date(date.to.setHours(23, 59, 59, 999));
        dateFiltered = dateFiltered.filter(t => isWithinInterval(new Date(t.createdAt), { start: fromDate, end: toDate }));
    }

    if (statusFilter === 'Semua') {
        return dateFiltered;
    }
    
    return dateFiltered.filter(t => {
        if (statusFilter === 'Diproses') {
            return t.status === 'Diproses';
        }
        if (statusFilter === 'Selesai') {
            return t.status === 'Selesai' || t.status === 'Selesai Dibayar';
        }
        return false;
    });

  }, [transactions, date, statusFilter]);

  const paginatedTransactions = React.useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredTransactions.slice(startIndex, endIndex);
  }, [filteredTransactions, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  
  React.useEffect(() => {
      setCurrentPage(1);
  }, [date, statusFilter]);

  const getCustomerForTransaction = (transaction: Transaction): Customer | undefined => {
      if (!transaction.customerId || transaction.customerId === 'N/A') return undefined;
      return (customers || []).find(c => c.id === transaction.customerId);
  }

  const handleActionClick = (transaction: Transaction, type: 'call' | 'whatsapp') => {
    setActionInProgress({ transaction, type });
  };

  const handleWhatsappSent = (transactionId: string) => {
    setSentWhatsappIds(prev => new Set(prev).add(transactionId));
  }

  const handleGenerateFollowUp = async (transaction: Transaction) => {
    setGeneratingTextId(transaction.id);
    try {
        const idToken = await auth.currentUser?.getIdToken(true);
        if (!idToken) throw new Error("Authentication token not available.");
        if (!activeStore) throw new Error("Active store not found.");

        const response = await fetch('/api/order-ready-notification', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ transaction, customer: getCustomerForTransaction(transaction), store: activeStore })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to generate creative text.');
        }

        const result: OrderReadyFollowUpOutput = await response.json();
        
        toast({
            title: "Notifikasi Terkirim!",
            description: "Notifikasi WhatsApp telah dikirim ke pelanggan.",
        });
        handleWhatsappSent(transaction.id); // Mark as sent
    } catch (error) {
        console.error("Error generating follow-up text:", error);
        toast({
            variant: 'destructive',
            title: 'Gagal Mengirim Notifikasi',
            description: (error as Error).message,
        });
    } finally {
        setGeneratingTextId(null);
    }
  };

  const handleCompleteTransaction = async () => {
    if (!transactionToComplete || !activeStore) return;
    
    setCompletingTransactionId(transactionToComplete.id);

    try {
        const batch = writeBatch(db);
        
        const transactionRef = doc(db, 'stores', activeStore.id, 'transactions', transactionToComplete.id);
        batch.update(transactionRef, { status: 'Selesai' });

        if (transactionToComplete.tableId) {
            const tableRef = doc(db, 'stores', activeStore.id, 'tables', transactionToComplete.tableId);
            const tableDoc = await getDoc(tableRef);
            if (tableDoc.exists()) {
                batch.update(tableRef, { status: 'Menunggu Dibersihkan' });
            }
        }
        
        await batch.commit();

        toast({ title: 'Pesanan Selesai!', description: `Status pesanan untuk ${transactionToComplete.customerName} telah diperbarui.`});
        onDataChange();

    } catch (error) {
        console.error("Error completing transaction:", error);
        toast({ variant: 'destructive', title: 'Gagal Menyelesaikan Pesanan' });
    } finally {
        setCompletingTransactionId(null);
        setTransactionToComplete(null);
    }
  }

  return (
    <>
      <div className="non-printable">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4">
                <div>
                    <CardTitle className="font-headline tracking-wider">
                    Riwayat Transaksi
                    </CardTitle>
                    <CardDescription>
                    Lihat semua penjualan yang lalu, status pesanan, dan detailnya.
                    </CardDescription>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                    <Select value={statusFilter} onValueChange={(value: StatusFilter) => setStatusFilter(value)}>
                        <SelectTrigger className="w-full sm:w-[180px]">
                            <SelectValue placeholder="Filter status..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Semua">Semua Status</SelectItem>
                            <SelectItem value="Diproses">Diproses</SelectItem>
                            <SelectItem value="Selesai">Selesai</SelectItem>
                        </SelectContent>
                    </Select>
                    <Popover>
                        <PopoverTrigger asChild>
                        <Button
                            id="date"
                            variant={"outline"}
                            className={cn(
                            "w-full sm:w-[300px] justify-start text-left font-normal",
                            !date && "text-muted-foreground"
                            )}
                        >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {date?.from ? (
                            date.to ? (
                                <>
                                {format(date.from, "LLL dd, y")} -{" "}
                                {format(date.to, "LLL dd, y")}
                                </>
                            ) : (
                                format(date.from, "LLL dd, y")
                            )
                            ) : (
                            <span>Pilih tanggal</span>
                            )}
                        </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                        <Calendar
                            initialFocus
                            mode="range"
                            defaultMonth={date?.from}
                            selected={date}
                            onSelect={setDate}
                            numberOfMonths={2}
                        />
                        </PopoverContent>
                    </Popover>
                </div>
            </div>
          </CardHeader>
          <CardContent>
            <TooltipProvider>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nota</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Pelanggan</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right w-[200px]">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                    Array.from({length: 10}).map((_, i) => (
                        <TableRow key={i}>
                            <TableCell><Skeleton className="h-5 w-16"/></TableCell>
                            <TableCell><Skeleton className="h-5 w-24"/></TableCell>
                            <TableCell><Skeleton className="h-5 w-32"/></TableCell>
                            <TableCell className="text-center"><Skeleton className="h-6 w-20 mx-auto"/></TableCell>
                            <TableCell className="text-right"><Skeleton className="h-5 w-20 ml-auto"/></TableCell>
                            <TableCell className="text-right"><Skeleton className="h-8 w-28 ml-auto"/></TableCell>
                        </TableRow>
                    ))
                ) : (
                    paginatedTransactions.map((transaction) => {
                    return (
                    <TableRow key={transaction.id}>
                        <TableCell className="font-mono">{String(transaction.receiptNumber).padStart(6, '0')}</TableCell>
                        <TableCell>
                        {new Date(transaction.createdAt).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                        })}
                        </TableCell>
                        <TableCell>{transaction.customerName}</TableCell>
                        <TableCell className="text-center">
                          <Badge 
                            variant={transaction.status === 'Selesai' || transaction.status === 'Selesai Dibayar' ? 'secondary' : 'default'}
                            className={cn(
                                transaction.status === 'Diproses' && 'bg-amber-500/20 text-amber-800 border-amber-500/50',
                                (transaction.status === 'Selesai' || transaction.status === 'Selesai Dibayar') && 'bg-green-500/20 text-green-800 border-green-500/50',
                            )}
                          >
                              {transaction.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                        Rp {transaction.totalAmount.toLocaleString('id-ID')}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {transaction.status === 'Diproses' && (
                                <>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                             <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleActionClick(transaction, 'call')}>
                                                <Volume2 className="h-4 w-4"/>
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent><p>Panggil Pelanggan (TTS)</p></TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleGenerateFollowUp(transaction)} disabled={generatingTextId === transaction.id}>
                                                {generatingTextId === transaction.id ? <Loader className="h-4 w-4 animate-spin"/> : (
                                                    <div className="relative">
                                                        <Send className="h-4 w-4"/>
                                                        {sentWhatsappIds.has(transaction.id) && <CheckCircle className="h-3 w-3 absolute -top-1 -right-1 text-green-500 bg-background rounded-full"/>}
                                                    </div>
                                                )}
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent><p>Kirim Notifikasi WhatsApp Cerdas</p></TooltipContent>
                                    </Tooltip>
                                     <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setTransactionToComplete(transaction)} disabled={completingTransactionId === transaction.id}>
                                                {completingTransactionId === transaction.id ? <Loader className="h-4 w-4 animate-spin"/> : <CheckCircle className="h-4 w-4"/>}
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent><p>Selesaikan Pesanan</p></TooltipContent>
                                     </Tooltip>
                                </>
                            )}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                <Button aria-haspopup="true" size="icon" variant="ghost">
                                    <MoreHorizontal className="h-4 w-4" />
                                    <span className="sr-only">Toggle menu</span>
                                </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Aksi</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => setSelectedTransaction(transaction)}>
                                    Lihat Detail
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onPrintRequest(transaction)}>
                                    <Printer className="mr-2 h-4 w-4"/> Cetak Struk
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive">
                                    Pengembalian
                                </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                    </TableRow>
                    )})
                )}
              </TableBody>
            </Table>
            </TooltipProvider>
             <div className="flex items-center justify-between mt-4">
                <span className="text-sm text-muted-foreground">
                    Halaman {currentPage} dari {totalPages}
                </span>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                    >
                        Sebelumnya
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages}
                    >
                        Berikutnya
                    </Button>
                </div>
            </div>
          </CardContent>
        </Card>
      </div>
      {selectedTransaction && (
          <TransactionDetailsDialog
              transaction={selectedTransaction}
              open={!!selectedTransaction}
              onOpenChange={() => setSelectedTransaction(null)}
              users={users || []}
          />
      )}
      {actionInProgress && activeStore && (
        <OrderReadyDialog
          transaction={actionInProgress.transaction}
          customer={getCustomerForTransaction(actionInProgress.transaction)}
          store={activeStore}
          open={!!actionInProgress}
          onOpenChange={() => setActionInProgress(null)}
          onSuccess={() => {
            if (actionInProgress.type === 'whatsapp') {
                handleWhatsappSent(actionInProgress.transaction.id);
            }
          }}
        />
      )}
      <AlertDialog open={!!transactionToComplete} onOpenChange={() => setTransactionToComplete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Selesaikan Pesanan?</AlertDialogTitle>
            <AlertDialogDescription>
              Anda akan menandai pesanan untuk <span className="font-bold">{transactionToComplete?.customerName}</span> sebagai selesai. Pastikan pesanan sudah diserahkan kepada pelanggan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleCompleteTransaction}>Ya, Selesaikan</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
