
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
import type { Customer } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, PlusCircle } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { AddCustomerForm } from '@/components/dashboard/add-customer-form';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/auth-context';

type CustomersProps = {
    customers: Customer[];
    onDataChange: () => void;
    isLoading: boolean;
};

function CustomerDetailsDialog({ customer, open, onOpenChange }: { customer: Customer; open: boolean; onOpenChange: (open: boolean) => void }) {
    if (!customer) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="font-headline tracking-wider">{customer.name}</DialogTitle>
                    <DialogDescription>
                        ID Pelanggan: {customer.id}
                    </DialogDescription>
                </DialogHeader>
                <div className="flex items-center gap-4 py-4">
                    <Avatar className="h-24 w-24 border-4 border-primary/50">
                        <AvatarImage src={customer.avatarUrl} alt={customer.name} />
                        <AvatarFallback>{customer.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="space-y-1 text-sm">
                        <div><strong>Telepon:</strong> {customer.phone}</div>
                        <div className="flex items-center gap-1"><strong>Tier:</strong> <Badge variant={customer.memberTier === 'Gold' ? 'default' : 'secondary'}>{customer.memberTier}</Badge></div>
                        <div><strong>Poin:</strong> {customer.loyaltyPoints.toLocaleString('id-ID')}</div>
                        <div><strong>Bergabung:</strong> {new Date(customer.joinDate).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                        {new Date(customer.birthDate).getFullYear() > 1970 && (
                             <div><strong>Ulang Tahun:</strong> {new Date(customer.birthDate).toLocaleDateString('id-ID', {day: 'numeric', month: 'long' })}</div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default function Customers({ customers, onDataChange, isLoading }: CustomersProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = React.useState(false);
  const [selectedCustomer, setSelectedCustomer] = React.useState<Customer | null>(null);
  const { activeStore } = useAuth();

  const handleViewDetails = (customer: Customer) => {
    setSelectedCustomer(customer);
  };
  
  const handleCustomerAdded = () => {
    onDataChange();
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="font-headline tracking-wider">
                Pelanggan
              </CardTitle>
              <CardDescription>
                Kelola data pelanggan dan lihat status loyalitas mereka untuk toko {activeStore?.name}.
              </CardDescription>
            </div>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1">
                  <PlusCircle className="h-3.5 w-3.5" />
                  <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                    Tambah Pelanggan
                  </span>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle className="font-headline tracking-wider">
                    Daftar Pelanggan Baru
                  </DialogTitle>
                  <DialogDescription>
                    Tambahkan pelanggan baru dan Dapatkan Fitur Menarik Chika AI
                  </DialogDescription>
                </DialogHeader>
                <AddCustomerForm setDialogOpen={setIsAddDialogOpen} onCustomerAdded={handleCustomerAdded} />
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pelanggan</TableHead>
                <TableHead>Telepon</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead className="text-right">Poin Loyalitas</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                 Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                        <div className="flex items-center gap-3">
                            <Skeleton className="h-10 w-10 rounded-full" />
                            <Skeleton className="h-5 w-32" />
                        </div>
                    </TableCell>
                    <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-5 w-12 ml-auto" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : (
                customers.map((customer) => (
                    <TableRow key={customer.id}>
                    <TableCell>
                        <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 border-2 border-primary/50">
                            <AvatarImage
                            src={customer.avatarUrl}
                            alt={customer.name}
                            />
                            <AvatarFallback>{customer.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="font-medium">{customer.name}</div>
                        </div>
                    </TableCell>
                    <TableCell>{customer.phone}</TableCell>
                    <TableCell>
                        <Badge
                        variant={
                            customer.memberTier === 'Gold'
                            ? 'default'
                            : 'secondary'
                        }
                        >
                        {customer.memberTier}
                        </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                        {customer.loyaltyPoints.toLocaleString('id-ID')}
                    </TableCell>
                    <TableCell className="text-right">
                        <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button aria-haspopup="true" size="icon" variant="ghost">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Toggle menu</span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Aksi</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => handleViewDetails(customer)}>
                                Lihat Detail
                            </DropdownMenuItem>
                            <DropdownMenuItem>Ubah</DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive">
                            Hapus
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                        </DropdownMenu>
                    </TableCell>
                    </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {selectedCustomer && (
        <CustomerDetailsDialog
            customer={selectedCustomer}
            open={!!selectedCustomer}
            onOpenChange={() => setSelectedCustomer(null)}
        />
      )}
    </>
  );
}
