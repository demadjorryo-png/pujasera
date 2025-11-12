
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Crown, ShoppingBag, TrendingUp, Users } from 'lucide-react';
import type { Customer } from '@/lib/types';
import { startOfMonth, isWithinInterval } from 'date-fns';
import { useDashboard } from '@/contexts/dashboard-context';

type CustomerMetric = {
  customer: Customer;
  totalSpent: number;
  transactionCount: number;
  averageSpent: number;
};

export default function CustomerAnalytics() {
  const { dashboardData, isLoading } = useDashboard();
  const { customers, transactions } = dashboardData || {};

  const { topSpenders, mostFrequent, metrics } = React.useMemo(() => {
    if (!customers || !transactions || customers.length === 0 || transactions.length === 0) {
      return { topSpenders: [], mostFrequent: [], metrics: {totalCustomers: 0, newCustomersThisMonth: 0, avgPurchaseValue: 0} };
    }

    const customerData: Record<string, { totalSpent: number; transactionCount: number }> = {};

    transactions.forEach((tx) => {
      if (tx.customerId && tx.customerId !== 'N/A') {
        if (!customerData[tx.customerId]) {
          customerData[tx.customerId] = { totalSpent: 0, transactionCount: 0 };
        }
        customerData[tx.customerId].totalSpent += tx.totalAmount;
        customerData[tx.customerId].transactionCount += 1;
      }
    });

    const enrichedCustomers: CustomerMetric[] = customers
      .filter((c) => customerData[c.id])
      .map((c) => ({
        customer: c,
        totalSpent: customerData[c.id].totalSpent,
        transactionCount: customerData[c.id].transactionCount,
        averageSpent: customerData[c.id].totalSpent / customerData[c.id].transactionCount,
      }));

    const topSpenders = [...enrichedCustomers].sort((a, b) => b.totalSpent - a.totalSpent).slice(0, 10);
    const mostFrequent = [...enrichedCustomers].sort((a, b) => b.transactionCount - a.transactionCount).slice(0, 10);
    
    // Calculate summary metrics
    const now = new Date();
    const startOfThisMonth = startOfMonth(now);
    const newCustomersThisMonth = customers.filter(c => isWithinInterval(new Date(c.joinDate), {start: startOfThisMonth, end: now})).length;
    const totalRevenue = transactions.reduce((sum, tx) => sum + tx.totalAmount, 0);
    const avgPurchaseValue = transactions.length > 0 ? totalRevenue / transactions.length : 0;

    return { topSpenders, mostFrequent, metrics: { totalCustomers: customers.length, newCustomersThisMonth, avgPurchaseValue } };
  }, [customers, transactions]);
  
  if (isLoading) {
      return <CustomerAnalyticsSkeleton />;
  }

  return (
    <div className="grid gap-6">
         <div className="grid gap-6 md:grid-cols-3">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Pelanggan</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{metrics.totalCustomers}</div>
                    <p className="text-xs text-muted-foreground">
                        +{metrics.newCustomersThisMonth} pelanggan baru bulan ini
                    </p>
                </CardContent>
            </Card>
             <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Rata-rata Pembelian</CardTitle>
                    <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">Rp {metrics.avgPurchaseValue.toLocaleString('id-ID')}</div>
                    <p className="text-xs text-muted-foreground">Rata-rata nilai per transaksi</p>
                </CardContent>
            </Card>
             <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Pelanggan Paling Loyal</CardTitle>
                    <Crown className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold truncate">{mostFrequent[0]?.customer.name || '-'}</div>
                    <p className="text-xs text-muted-foreground">
                        {mostFrequent[0]?.transactionCount || 0} transaksi
                    </p>
                </CardContent>
            </Card>
        </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-headline tracking-wider flex items-center gap-2">
              <TrendingUp className="text-primary" />
              Top Spenders
            </CardTitle>
            <CardDescription>
              Pelanggan dengan total belanja tertinggi sepanjang masa.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pelanggan</TableHead>
                  <TableHead className="text-right">Total Belanja</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topSpenders.map(({ customer, totalSpent }) => (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="hidden h-9 w-9 sm:flex">
                          <AvatarImage src={customer.avatarUrl} alt={customer.name} />
                          <AvatarFallback>{customer.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="font-medium">{customer.name}</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      Rp {totalSpent.toLocaleString('id-ID')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-headline tracking-wider flex items-center gap-2">
              <Crown className="text-accent" />
              Pelanggan Paling Loyal
            </CardTitle>
            <CardDescription>
              Pelanggan dengan frekuensi transaksi terbanyak.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pelanggan</TableHead>
                  <TableHead className="text-right">Jumlah Transaksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mostFrequent.map(({ customer, transactionCount }) => (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="hidden h-9 w-9 sm:flex">
                          <AvatarImage src={customer.avatarUrl} alt={customer.name} />
                          <AvatarFallback>{customer.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="font-medium">{customer.name}</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {transactionCount}x
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


function CustomerAnalyticsSkeleton() {
    return (
        <div className="grid gap-6">
            <div className="grid gap-6 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <Skeleton className="h-4 w-2/3" />
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <Skeleton className="h-7 w-1/3" />
                        <Skeleton className="h-3 w-1/2 mt-2" />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <Skeleton className="h-4 w-2/3" />
                        <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <Skeleton className="h-7 w-1/2" />
                        <Skeleton className="h-3 w-2/3 mt-2" />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <Skeleton className="h-4 w-2/3" />
                        <Crown className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <Skeleton className="h-7 w-1/2" />
                        <Skeleton className="h-3 w-1/3 mt-2" />
                    </CardContent>
                </Card>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <Skeleton className="h-6 w-1/2 mb-2" />
                        <Skeleton className="h-4 w-3/4" />
                    </CardHeader>
                    <CardContent>
                         {Array.from({ length: 5 }).map((_, i) => (
                             <div key={i} className="flex items-center justify-between py-2">
                                <div className="flex items-center gap-3">
                                    <Skeleton className="h-9 w-9 rounded-full" />
                                    <Skeleton className="h-5 w-32" />
                                </div>
                                <Skeleton className="h-5 w-24" />
                            </div>
                        ))}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <Skeleton className="h-6 w-1/2 mb-2" />
                        <Skeleton className="h-4 w-3/4" />
                    </CardHeader>
                    <CardContent>
                        {Array.from({ length: 5 }).map((_, i) => (
                             <div key={i} className="flex items-center justify-between py-2">
                                <div className="flex items-center gap-3">
                                    <Skeleton className="h-9 w-9 rounded-full" />
                                    <Skeleton className="h-5 w-32" />
                                </div>
                                <Skeleton className="h-5 w-16" />
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
