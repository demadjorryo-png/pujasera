

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
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import {
  ChartContainer,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { TrendingUp, Gift, Sparkles, Loader, Send, Trophy, Calendar, Moon, Trash2 } from 'lucide-react';
import { format, formatDistanceToNow, startOfWeek, endOfWeek, eachDayOfInterval, startOfMonth, endOfMonth, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import type { Locale } from 'date-fns';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getBirthdayFollowUp } from '@/ai/flows/birthday-follow-up';
import type { Customer, Transaction, User, PendingOrder } from '@/lib/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import { doc, deleteDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { PendingOrderFollowUpDialog } from '@/components/dashboard/pending-order-follow-up-dialog';
import { useAuth } from '@/contexts/auth-context';
import { deductAiUsageFee } from '@/lib/app-settings';
import type { TransactionFeeSettings } from '@/lib/app-settings';

const chartConfig = {
  revenue: {
    label: 'Revenue',
    color: 'hsl(var(--primary))',
  },
};

function BirthdayFollowUpDialog({ customer, open, onOpenChange, feeSettings }: { customer: Customer, open: boolean, onOpenChange: (open: boolean) => void, feeSettings: TransactionFeeSettings }) {
    const { pradanaTokenBalance, refreshPradanaTokenBalance, currentUser, activeStore } = useAuth();
    const { toast } = useToast();
    const [discount, setDiscount] = React.useState(15);
    const [message, setMessage] = React.useState('');
    const [isLoading, setIsLoading] = React.useState(false);

    const handleGenerate = async () => {
        if (currentUser?.role === 'admin' && activeStore) {
            try {
                await deductAiUsageFee(pradanaTokenBalance, feeSettings, activeStore.id, toast);
            } catch {
                return;
            }
        }
        
        setIsLoading(true);
        setMessage('');
        try {
            const result = await getBirthdayFollowUp({
                customerName: customer.name,
                discountPercentage: discount,
                birthDate: customer.birthDate,
            });
            setMessage(result.followUpMessage);
            if (currentUser?.role === 'admin') {
                refreshPradanaTokenBalance();
            }
        } catch (error) {
            console.error("Error generating birthday message:", error);
            setMessage("Gagal membuat pesan. Coba lagi.");
        } finally {
            setIsLoading(false);
        }
    }
    
    const formattedPhone = customer.phone.startsWith('0') 
        ? `62${customer.phone.substring(1)}` 
        : customer.phone;
    
    const whatsappUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;


    React.useEffect(() => {
        if (open) {
            setMessage('');
            setDiscount(15);
        }
    }, [open]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Buat Pesan Ulang Tahun untuk {customer.name}</DialogTitle>
                    <DialogDescription>
                        Atur diskon dan biarkan Chika AI membuat pesan ulang tahun yang personal.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="discount">Persentase Diskon (%)</Label>
                        <Input 
                            id="discount"
                            type="number"
                            value={discount}
                            onChange={(e) => setDiscount(Number(e.target.value))}
                            placeholder="e.g., 15"
                        />
                    </div>
                     <Button onClick={handleGenerate} disabled={isLoading} className="w-full">
                        {isLoading ? (
                            <Loader className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                             <Sparkles className="mr-2 h-4 w-4" />
                        )}
                        Buat dengan Chika AI {currentUser?.role === 'admin' && `(${feeSettings.aiUsageFee} Token)`}
                    </Button>
                    {message && (
                        <div className="space-y-2">
                             <Alert className="border-accent bg-accent/10">
                                <Sparkles className="h-4 w-4 !text-accent" />
                                <AlertTitle className="font-semibold text-accent">Pesan Dihasilkan</AlertTitle>
                                <AlertDescription>{message}</AlertDescription>
                            </Alert>
                             <Link href={whatsappUrl} target="_blank" className="w-full">
                                <Button className="w-full" variant="secondary">
                                    <Send className="mr-2 h-4 w-4" />
                                    Kirim via WhatsApp
                                </Button>
                             </Link>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}

type OverviewProps = {
  transactions: Transaction[];
  users: User[];
  customers: Customer[];
  pendingOrders: PendingOrder[];
  onDataChange: () => void;
  feeSettings: TransactionFeeSettings;
};

export default function Overview({ transactions, users, customers, pendingOrders: allPendingOrders, onDataChange, feeSettings }: OverviewProps) {
  const { currentUser, activeStore } = useAuth();
  const [dateFnsLocale, setDateFnsLocale] = React.useState<Locale | undefined>(undefined);
  const [selectedCustomer, setSelectedCustomer] = React.useState<Customer | null>(null);
  
  const [orderToDelete, setOrderToDelete] = React.useState<PendingOrder | null>(null);
  const [orderToFollowUp, setOrderToFollowUp] = React.useState<PendingOrder | null>(null);
  const { toast } = useToast();
  
  const isAdmin = currentUser?.role === 'admin';
  const storeId = activeStore?.id;
  
  const pendingOrders = React.useMemo(() => 
    allPendingOrders.filter(po => po.storeId === storeId),
    [allPendingOrders, storeId]
  );

  React.useEffect(() => {
    import('date-fns/locale/id').then(locale => setDateFnsLocale(locale.default));
  }, []);

  const { birthdayCustomers, recentPendingOrders } = React.useMemo(() => {
    const currentMonth = new Date().getMonth();
    const bdayCustomers = customers.filter(c => new Date(c.birthDate).getMonth() === currentMonth && new Date(c.birthDate).getFullYear() > 1970);
    
    const storePendingOrders = pendingOrders.slice(0, 5);

    return { birthdayCustomers: bdayCustomers, recentPendingOrders: storePendingOrders };
  }, [customers, pendingOrders]);


  const { monthlyRevenue, todaysRevenue } = React.useMemo(() => {
    if (!currentUser) return { monthlyRevenue: 0, todaysRevenue: 0 };
    
    const now = new Date();
    const startOfThisMonth = startOfMonth(now);
    const endOfThisMonth = endOfMonth(now);
    const startOfToday = startOfDay(now);
    const endOfToday = endOfDay(now);

    const monthlyTx = transactions.filter(t => 
      t.staffId === currentUser.id && 
      isWithinInterval(new Date(t.createdAt), { start: startOfThisMonth, end: endOfThisMonth })
    );

    const todaysTx = transactions.filter(t => 
      t.staffId === currentUser.id && 
      t.storeId === storeId &&
      isWithinInterval(new Date(t.createdAt), { start: startOfToday, end: endOfToday })
    );

    const monthlyRevenue = monthlyTx.reduce((sum, t) => sum + t.totalAmount, 0);
    const todaysRevenue = todaysTx.reduce((sum, t) => sum + t.totalAmount, 0);

    return { monthlyRevenue, todaysRevenue };
  }, [currentUser, storeId, transactions]);
  
  const employeeSales = React.useMemo(() => {
    const sales: Record<string, { user: User; totalOmset: number }> = {};
    const startOfThisMonth = startOfMonth(new Date());
    const endOfThisMonth = endOfMonth(new Date());

    const thisMonthTransactions = transactions.filter(t => 
        t.storeId === storeId &&
        isWithinInterval(new Date(t.createdAt), { start: startOfThisMonth, end: endOfThisMonth })
    );

    thisMonthTransactions.forEach(t => {
      const user = users.find(u => u.id === t.staffId);
      if (user) {
        if (!sales[user.id]) {
          sales[user.id] = { user, totalOmset: 0 };
        }
        sales[user.id].totalOmset += t.totalAmount;
      }
    });

    return Object.values(sales).sort((a, b) => b.totalOmset - a.totalOmset);
  }, [transactions, users, storeId]);

  const weeklySalesData = React.useMemo(() => {
    const today = new Date();
    const startOfThisWeek = startOfWeek(today, { weekStartsOn: 1 });
    const endOfThisWeek = endOfWeek(today, { weekStartsOn: 1 });
    const storeTransactions = transactions.filter(t => t.storeId === storeId);
    
    const daysInWeek = eachDayOfInterval({
        start: startOfThisWeek,
        end: endOfThisWeek,
    });

    const dailyRevenue = daysInWeek.map(day => {
        const dailyTransactions = storeTransactions.filter(t => format(new Date(t.createdAt), 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd'));
        const revenue = dailyTransactions.reduce((sum, t) => sum + t.totalAmount, 0);
        return {
            date: format(day, 'E'), 
            revenue: revenue,
        };
    });

    return dailyRevenue;
  }, [storeId, transactions]);
  
  const handleDeletePendingOrder = async () => {
    if (!orderToDelete) return;

    try {
      await deleteDoc(doc(db, 'pendingOrders', orderToDelete.id));
      onDataChange();
      toast({
        title: 'Pesanan Dihapus',
        description: `Pesanan tertunda untuk ${orderToDelete.productName} telah dihapus.`,
      });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Gagal Menghapus',
        description: 'Terjadi kesalahan saat menghapus pesanan.',
      });
    } finally {
      setOrderToDelete(null);
    }
  };


  return (
    <div className="grid gap-6">
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Pendapatan Anda (Bulan Ini)
            </CardTitle>
            <Moon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              Rp {monthlyRevenue.toLocaleString('id-ID')}
            </div>
            <p className="text-xs text-muted-foreground">
              Total omset dari semua toko bulan ini
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
                Pendapatan Anda (Hari Ini)
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
                Rp {todaysRevenue.toLocaleString('id-ID')}
            </div>
            <p className="text-xs text-muted-foreground">
              Total omset di toko ini hari ini
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hari Teramai (Toko)</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Sabtu</div>
            <p className="text-xs text-muted-foreground">
              Berdasarkan data historis
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
         <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="font-headline tracking-wider">
              Papan Peringkat Karyawan (Bulan Ini)
            </CardTitle>
            <CardDescription>
              Karyawan dengan performa terbaik di toko ini berdasarkan total penjualan.
            </CardDescription>
          </CardHeader>
          <CardContent>
             <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Karyawan</TableHead>
                  <TableHead className="text-right">Total Omset</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employeeSales.slice(0, 5).map(({ user, totalOmset }, index) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="font-bold w-4">{index + 1}.</span>
                        <div className="font-medium">{user.name}</div>
                        {index === 0 && <Trophy className="h-4 w-4 text-yellow-500" />}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      Rp {totalOmset.toLocaleString('id-ID')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="font-headline tracking-wider">
              Ringkasan Penjualan Mingguan (Toko)
            </CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <BarChart
                data={weeklySalesData}
                margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
              >
                <YAxis
                  tickFormatter={(value) => `Rp${Number(value) / 1000000} Jt`}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                />
                 <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--primary) / 0.1)' }}
                  content={<ChartTooltipContent 
                    formatter={(value) => `Rp ${Number(value).toLocaleString('id-ID')}`}
                  />}
                />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

       <Card>
        <CardHeader>
            <CardTitle className="font-headline tracking-wider">Ulang Tahun Bulan Ini</CardTitle>
            <CardDescription>
              Ucapkan selamat ulang tahun dengan promo spesial!
            </CardDescription>
        </CardHeader>
        <CardContent>
           {birthdayCustomers.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pelanggan</TableHead>
                <TableHead>Tanggal Lahir</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
                {birthdayCustomers.map((customer) => {
                    const [year, month, day] = customer.birthDate.split('-').map(Number);
                    const birthDate = new Date(year, month - 1, day);
                    return (
                        <TableRow key={customer.id}>
                            <TableCell>
                               <div className="flex items-center gap-3">
                                    <Avatar className="h-9 w-9">
                                    <AvatarImage
                                        src={customer.avatarUrl}
                                        alt={customer.name}
                                    />
                                    <AvatarFallback>
                                        {customer.name.charAt(0)}
                                    </AvatarFallback>
                                    </Avatar>
                                    <div className="font-medium">{customer.name}</div>
                                </div>
                            </TableCell>
                            <TableCell>{birthDate.toLocaleDateString('id-ID', {day: 'numeric', month: 'long' })}</TableCell>
                            <TableCell className="text-right">
                                <Button size="sm" variant="outline" onClick={() => setSelectedCustomer(customer)}>
                                    <Gift className="mr-2 h-4 w-4"/>
                                    Kirim Ucapan
                                </Button>
                            </TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
          </Table>
            ) : (
                <p className="text-sm text-muted-foreground text-center py-4">Tidak ada pelanggan yang berulang tahun bulan ini.</p>
            )}
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
            <CardTitle className="font-headline tracking-wider">Pesanan Tertunda Terbaru</CardTitle>
            <CardDescription>
              Produk yang ditunggu pelanggan. Hubungi jika stok sudah tersedia.
            </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pelanggan</TableHead>
                <TableHead>Produk</TableHead>
                <TableHead className="text-center">Qty</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
                {recentPendingOrders.map((order) => (
                    <TableRow key={order.id}>
                        <TableCell>
                           <div className="flex items-center gap-3">
                                <Avatar className="h-9 w-9">
                                <AvatarImage
                                    src={order.customerAvatarUrl}
                                    alt={order.customerName}
                                />
                                <AvatarFallback>
                                    {order.customerName.charAt(0)}
                                </AvatarFallback>
                                </Avatar>
                                <div className="font-medium">{order.customerName}</div>
                            </div>
                        </TableCell>
                        <TableCell>{order.productName}</TableCell>
                        <TableCell className="text-center font-mono">{order.quantity}</TableCell>
                        <TableCell>
                          {dateFnsLocale && formatDistanceToNow(new Date(order.createdAt), { addSuffix: true, locale: dateFnsLocale })}
                        </TableCell>
                        <TableCell className="text-right">
                           <div className="flex items-center justify-end gap-2">
                             <Button variant="outline" size="sm" className="gap-2" onClick={() => setOrderToFollowUp(order)}>
                                <Send className="h-3 w-3" />
                                Follow Up
                             </Button>
                            {isAdmin && (
                                <Button variant="ghost" size="icon" className="text-destructive/70 hover:text-destructive h-8 w-8" onClick={() => setOrderToDelete(order)}>
                                    <Trash2 className="h-4 w-4"/>
                                    <span className="sr-only">Delete order</span>
                                </Button>
                            )}
                           </div>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selectedCustomer && (
        <BirthdayFollowUpDialog 
            customer={selectedCustomer}
            open={!!selectedCustomer}
            onOpenChange={(open) => {
                if(!open) {
                    setSelectedCustomer(null)
                }
            }}
            feeSettings={feeSettings}
        />
      )}
      
      {orderToFollowUp && (
        <PendingOrderFollowUpDialog
          order={orderToFollowUp}
          open={!!orderToFollowUp}
          onOpenChange={() => setOrderToFollowUp(null)}
          feeSettings={feeSettings}
        />
      )}

      <AlertDialog open={!!orderToDelete} onOpenChange={() => setOrderToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Anda Yakin?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini tidak dapat dibatalkan. Ini akan menghapus pesanan tertunda untuk{' '}
              <span className="font-bold">{orderToDelete?.productName}</span> dari pelanggan{' '}
              <span className="font-bold">{orderToDelete?.customerName}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePendingOrder}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              Ya, Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
