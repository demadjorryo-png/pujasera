
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
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { DollarSign, Store, TrendingUp, Trophy, Newspaper, TrendingDown, PackageX } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useDashboard } from '@/contexts/dashboard-context';
import { subMonths, format, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHeader, TableHead, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { AIConfirmationDialog } from '@/components/dashboard/ai-confirmation-dialog';
import { useToast } from '@/hooks/use-toast';
import { auth, db } from '@/lib/firebase';
import { Transaction, Product } from '@/lib/types';
import { collection, collectionGroup, getDocs, query, where } from 'firebase/firestore';

const chartConfig = {
  revenue: {
    label: 'Pendapatan',
    color: 'hsl(var(--primary))',
  },
};

export default function PujaseraOverview() {
  const { pujaseraTenants, activeStore, updateActiveStore, refreshActiveStore } = useAuth();
  const { dashboardData, isLoading } = useDashboard();
  const { feeSettings } = dashboardData;
  const { toast } = useToast();

  const [allTenantTransactions, setAllTenantTransactions] = React.useState<Transaction[]>([]);
  const [allTenantProducts, setAllTenantProducts] = React.useState<Product[]>([]);
  const [isDataLoading, setIsDataLoading] = React.useState(true);

  React.useEffect(() => {
    async function fetchAllTenantData() {
      if (isLoading || pujaseraTenants.length === 0) {
        setIsDataLoading(false);
        return;
      }
      
      setIsDataLoading(true);
      try {
        const { getDocs, collection, query } = await import('firebase/firestore');
        
        const actualTenants = pujaseraTenants.filter(tenant => tenant.id !== activeStore?.id);

        // 1. Fetch all transactions for each tenant
        const transactionPromises = actualTenants.map(tenant => 
            getDocs(collection(db, 'stores', tenant.id, 'transactions'))
        );
        const transactionSnapshots = await Promise.all(transactionPromises);
        const allTransactions = transactionSnapshots.flatMap(snapshot => 
            snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction))
        );
        setAllTenantTransactions(allTransactions);

        // 2. Fetch all products from all tenants
        const productPromises = actualTenants.map(tenant => 
            getDocs(collection(db, 'stores', tenant.id, 'products'))
        );
        const productSnapshots = await Promise.all(productPromises);
        const allProducts = productSnapshots.flatMap(snapshot => 
            snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product))
        );
        setAllTenantProducts(allProducts);

      } catch (error) {
        console.error("Error fetching all tenant data:", error);
        toast({
          variant: 'destructive',
          title: 'Gagal Memuat Data Tenant',
          description: 'Tidak dapat mengambil data transaksi dan produk dari semua tenant.'
        });
      } finally {
        setIsDataLoading(false);
      }
    }

    fetchAllTenantData();
  }, [isLoading, pujaseraTenants, toast, activeStore?.id]);


  const {
    totalRevenue,
    totalTransactions,
    monthlyGrowthData,
    tenantLeaderboard,
    topProductsThisMonth,
    worstProductsThisMonth,
    unsoldProductsThisMonth
  } = React.useMemo(() => {
    if (isDataLoading) {
      return { totalRevenue: 0, totalTransactions: 0, monthlyGrowthData: [], tenantLeaderboard: [], topProductsThisMonth: [], worstProductsThisMonth: [], unsoldProductsThisMonth: [] };
    }

    const totalRevenue = allTenantTransactions.reduce((sum, tx) => sum + tx.totalAmount, 0);
    const totalTransactions = allTenantTransactions.length;

    const now = new Date();
    const monthlyData: { month: string; revenue: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const targetMonth = subMonths(now, i);
      const start = startOfMonth(targetMonth);
      const end = endOfMonth(targetMonth);
      const monthName = format(targetMonth, 'MMM', { locale: idLocale });

      const monthlyRevenue = allTenantTransactions
        .filter(t => isWithinInterval(new Date(t.createdAt), { start, end }))
        .reduce((sum, t) => sum + t.totalAmount, 0);

      monthlyData.push({ month: monthName, revenue: monthlyRevenue });
    }

    const startOfCurrentMonth = startOfMonth(now);
    const endOfCurrentMonth = endOfMonth(now);
    const thisMonthTransactions = allTenantTransactions.filter(t => isWithinInterval(new Date(t.createdAt), { start: startOfCurrentMonth, end: endOfCurrentMonth }));

    const salesByTenant: Record<string, number> = {};
    thisMonthTransactions.forEach(tx => {
        if (!salesByTenant[tx.storeId]) {
            salesByTenant[tx.storeId] = 0;
        }
        salesByTenant[tx.storeId] += tx.totalAmount;
    });

    const leaderboard = Object.entries(salesByTenant)
        .map(([storeId, revenue]) => {
            const tenant = pujaseraTenants.find(t => t.id === storeId);
            if (!tenant || tenant.id === activeStore?.id) return null; // Exclude the pujasera itself
            return {
                storeId,
                storeName: tenant.name,
                totalRevenue: revenue,
            };
        })
        .filter(Boolean)
        .sort((a, b) => b!.totalRevenue - a!.totalRevenue)
        .slice(0, 5) as { storeId: string; storeName: string; totalRevenue: number }[];

    // Product Performance Calculation
    const productSales: Record<string, number> = {};
    thisMonthTransactions.forEach(tx => {
      tx.items.forEach(item => {
        productSales[item.productName] = (productSales[item.productName] || 0) + item.quantity;
      });
    });

    const sortedProducts = Object.entries(productSales).sort(([, a], [, b]) => b - a);
    const topProducts = sortedProducts.slice(0, 5);
    const worstProducts = sortedProducts.filter(([, qty]) => qty > 0).slice(-5).reverse();
    
    const soldProductNames = new Set(Object.keys(productSales));
    const allProductNames = new Set(allTenantProducts.map(p => p.name));
    const unsold = Array.from(allProductNames).filter(name => !soldProductNames.has(name)).slice(0, 5);


    return { 
        totalRevenue, 
        totalTransactions, 
        monthlyGrowthData: monthlyData, 
        tenantLeaderboard: leaderboard,
        topProductsThisMonth: topProducts,
        worstProductsThisMonth: worstProducts,
        unsoldProductsThisMonth: unsold,
    };

  }, [isDataLoading, allTenantTransactions, allTenantProducts, pujaseraTenants, activeStore?.id]);
  
  const handleClaimTrial = async () => {
    try {
        const idToken = await auth.currentUser?.getIdToken(true);
        if (!idToken || !activeStore) {
            throw new Error("Sesi tidak valid atau toko tidak aktif.");
        }
        
        const response = await fetch('/api/store/subscribe-catalog', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`,
            },
            body: JSON.stringify({ storeId: activeStore.id, planId: 'trial' }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Gagal memproses langganan.`);
        }
        
        const result = await response.json();

        toast({
            title: 'Katalog Percobaan Diaktifkan!',
            description: `Katalog Digital Premium Anda aktif selama ${feeSettings?.catalogTrialDurationMonths || 1} bulan.`,
        });

        if (result.newExpiryDate) {
            updateActiveStore({ 
                catalogSubscriptionExpiry: result.newExpiryDate,
                pradanaTokenBalance: result.newBalance,
                hasUsedCatalogTrial: true,
            });
        } else {
            refreshActiveStore(); 
        }
        return result;
    } catch (error) {
        console.error(`Trial claim error:`, error);
        throw error;
    }
  };

  if (isLoading || !feeSettings || isDataLoading) {
    return <PujaseraOverviewSkeleton />;
  }
  
  const isTrialAvailable = !activeStore?.hasUsedCatalogTrial && feeSettings && feeSettings.catalogTrialFee >= 0;
  const actualTenantsCount = pujaseraTenants.filter(t => t.id !== activeStore?.id).length;

  return (
    <div className="grid gap-6">
      
      {isTrialAvailable && (
        <Card className="border-primary/50 bg-primary/10">
          <CardHeader>
            <CardTitle className="font-headline tracking-wider text-primary">Penawaran Spesial Pengguna Baru!</CardTitle>
            <CardDescription>Aktifkan Katalog Publik digital untuk pujasera Anda dengan harga percobaan yang sangat terjangkau.</CardDescription>
          </CardHeader>
          <CardContent>
             <p className="mb-4 text-sm">Tingkatkan pengalaman pelanggan dengan menu digital modern yang dilengkapi asisten AI untuk semua tenant. Klaim sekarang hanya dengan <span className="font-bold">{feeSettings.catalogTrialFee} Pradana Token</span> untuk {feeSettings.catalogTrialDurationMonths} bulan.</p>
             <AIConfirmationDialog
                featureName="Klaim Katalog Percobaan"
                featureDescription={`Anda akan mengaktifkan langganan Katalog Digital selama ${feeSettings.catalogTrialDurationMonths} bulan dengan harga spesial.`}
                feeSettings={feeSettings}
                feeToDeduct={feeSettings.catalogTrialFee}
                onConfirm={handleClaimTrial}
                skipFeeDeduction={false}
              >
                  <Button>
                    <Newspaper className="mr-2 h-4 w-4" />
                    Klaim Katalog Publik
                  </Button>
              </AIConfirmationDialog>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Pendapatan Pujasera</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Rp {totalRevenue.toLocaleString('id-ID')}</div>
            <p className="text-xs text-muted-foreground">Dari semua tenant sepanjang waktu</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Transaksi</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTransactions.toLocaleString('id-ID')}</div>
            <p className="text-xs text-muted-foreground">Jumlah transaksi dari semua tenant</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Jumlah Tenant</CardTitle>
            <Store className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{actualTenantsCount}</div>
            <p className="text-xs text-muted-foreground">Jumlah tenant yang terdaftar di grup ini</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
            <CardHeader>
            <CardTitle className="font-headline tracking-wider">Pertumbuhan Pendapatan Pujasera</CardTitle>
            <CardDescription>Total pendapatan gabungan selama 6 bulan terakhir.</CardDescription>
            </CardHeader>
            <CardContent>
            <ResponsiveContainer width="100%" height={300}>
                <LineChart data={monthlyGrowthData}>
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `Rp${Number(value) / 1000000} Jt`} />
                <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
                    formatter={(value: number) => [`Rp ${value.toLocaleString('id-ID')}`, 'Pendapatan']}
                />
                <Line type="monotone" dataKey="revenue" name="Pendapatan" stroke={chartConfig.revenue.color} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
            </ResponsiveContainer>
            </CardContent>
        </Card>
        
        <Card>
            <CardHeader>
            <CardTitle className="font-headline tracking-wider">Papan Peringkat Tenant (Bulan Ini)</CardTitle>
            <CardDescription>Tenant dengan performa terbaik berdasarkan total penjualan.</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                        <TableHead>Tenant</TableHead>
                        <TableHead className="text-right">Total Omset</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {tenantLeaderboard.map((tenant, index) => (
                        <TableRow key={tenant.storeId}>
                            <TableCell>
                            <div className="flex items-center gap-3">
                                <span className="font-bold w-4">{index + 1}.</span>
                                <div className="font-medium">{tenant.storeName}</div>
                                {index === 0 && <Trophy className="h-4 w-4 text-yellow-500" />}
                            </div>
                            </TableCell>
                            <TableCell className="text-right font-mono">
                            Rp {tenant.totalRevenue.toLocaleString('id-ID')}
                            </TableCell>
                        </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
      </div>

       <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-headline tracking-wider"><TrendingUp className="text-primary" />Produk Terlaris</CardTitle>
            <CardDescription>Bulan ini, berdasarkan unit terjual di semua tenant.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {topProductsThisMonth.map(([name, quantity], index) => (
                <li key={name} className="flex justify-between text-sm font-medium">
                  <span>{index + 1}. {name}</span>
                  <span className="font-mono">{quantity}x</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-headline tracking-wider"><TrendingDown className="text-destructive" />Produk Kurang Laris</CardTitle>
            <CardDescription>Bulan ini, berdasarkan unit terjual di semua tenant.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {worstProductsThisMonth.map(([name, quantity], index) => (
                <li key={name} className="flex justify-between text-sm font-medium">
                  <span>{index + 1}. {name}</span>
                  <span className="font-mono">{quantity}x</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-headline tracking-wider"><PackageX className="text-muted-foreground" />Produk Belum Laku</CardTitle>
            <CardDescription>Bulan ini, belum ada penjualan di semua tenant.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {unsoldProductsThisMonth.length > 0 ? (
                unsoldProductsThisMonth.map((name, index) => (
                  <li key={name} className="flex justify-between text-sm font-medium">
                    <span>{index + 1}. {name}</span>
                  </li>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center">Semua produk terjual bulan ini!</p>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}


function PujaseraOverviewSkeleton() {
    return (
        <div className="grid gap-6">
             <div className="grid gap-6 md:grid-cols-3">
                <Card><CardHeader className="space-y-2 pb-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-8 w-1/2" /></CardHeader><CardContent><Skeleton className="h-4 w-3/4" /></CardContent></Card>
                <Card><CardHeader className="space-y-2 pb-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-8 w-1/2" /></CardHeader><CardContent><Skeleton className="h-4 w-3/4" /></CardContent></Card>
                <Card><CardHeader className="space-y-2 pb-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-8 w-1/2" /></CardHeader><CardContent><Skeleton className="h-4 w-3/4" /></CardContent></Card>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card><CardHeader><Skeleton className="h-6 w-3/4" /><Skeleton className="h-4 w-1/2 mt-2" /></CardHeader><CardContent><Skeleton className="w-full h-[300px]" /></CardContent></Card>
                <Card><CardHeader><Skeleton className="h-6 w-3/4" /><Skeleton className="h-4 w-1/2 mt-2" /></CardHeader><CardContent className="space-y-4">{Array.from({length: 5}).map((_, i) => <div key={i} className="flex justify-between"><Skeleton className="h-5 w-1/2" /><Skeleton className="h-5 w-1/4" /></div>)}</CardContent></Card>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              <Card><CardHeader><Skeleton className="h-6 w-3/4"/><Skeleton className="h-4 w-1/2 mt-2"/></CardHeader><CardContent className="space-y-2">{Array.from({length:5}).map((_,i)=><Skeleton key={i} className="h-5 w-full"/>)}</CardContent></Card>
              <Card><CardHeader><Skeleton className="h-6 w-3/4"/><Skeleton className="h-4 w-1/2 mt-2"/></CardHeader><CardContent className="space-y-2">{Array.from({length:5}).map((_,i)=><Skeleton key={i} className="h-5 w-full"/>)}</CardContent></Card>
              <Card><CardHeader><Skeleton className="h-6 w-3/4"/><Skeleton className="h-4 w-1/2 mt-2"/></CardHeader><CardContent className="space-y-2">{Array.from({length:5}).map((_,i)=><Skeleton key={i} className="h-5 w-full"/>)}</CardContent></Card>
            </div>
        </div>
    )
}
