
'use client';

import * as React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Product, Customer, CartItem, PendingOrder } from '@/lib/types';
import {
  Search,
  PlusCircle,
  MinusCircle,
  XCircle,
  UserPlus,
  Crown,
  ClipboardList,
  Plus,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { AddCustomerForm } from '@/components/dashboard/add-customer-form';
import { Combobox } from '@/components/ui/combobox';
import { useToast } from '@/hooks/use-toast';
import { collection, addDoc, onSnapshot, query, where, Unsubscribe } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/auth-context';

type PendingOrdersProps = {
    products: Product[];
    customers: Customer[];
    onDataChange: () => void;
    isLoading: boolean;
};

export default function PendingOrders({ products, customers, onDataChange, isLoading }: PendingOrdersProps) {
  const { activeStore } = useAuth();
  const [pendingList, setPendingList] = React.useState<CartItem[]>([]);
  const [realtimeOrders, setRealtimeOrders] = React.useState<PendingOrder[]>([]);
  const [selectedCustomer, setSelectedCustomer] = React.useState<Customer | undefined>(undefined);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [manualItemName, setManualItemName] = React.useState('');
  const [isMemberDialogOpen, setIsMemberDialogOpen] = React.useState(false);
  const { toast } = useToast();
  
  const currentStoreId = activeStore?.id || '';

  React.useEffect(() => {
    if (!currentStoreId) return;

    const q = query(collection(db, "pendingOrders"), where("storeId", "==", currentStoreId));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const updatedOrders: PendingOrder[] = [];
        snapshot.forEach((doc) => {
            updatedOrders.push({ id: doc.id, ...doc.data() } as PendingOrder);
        });
        setRealtimeOrders(updatedOrders);
        toast({
          title: "Pesanan Diperbarui",
          description: "Daftar pesanan tertunda telah diperbarui secara real-time.",
        });
    }, (error) => {
        console.error("Error listening to pending orders:", error);
        toast({
            variant: 'destructive',
            title: 'Gagal Memperbarui Pesanan',
            description: 'Tidak dapat memuat pembaruan pesanan secara real-time.'
        });
    });

    return () => unsubscribe();
  }, [currentStoreId, toast]);

  const customerOptions = customers.map((c) => ({
    value: c.id,
    label: c.name,
  }));
  
  const outOfStockProducts = products.filter((product) => {
    return product.stock === 0 && product.name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const addToPendingList = (product: Product) => {
    setPendingList((prevList) => {
      const existingItem = prevList.find(
        (item) => item.productId === product.id
      );
      if (existingItem) {
        return prevList.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [
        ...prevList,
        {
          productId: product.id,
          productName: product.name,
          quantity: 1,
          price: product.price,
        },
      ];
    });
  };

  const handleAddManualItem = () => {
    if (!manualItemName.trim()) {
      toast({
        variant: 'destructive',
        title: 'Nama Item Kosong',
        description: 'Silakan masukkan nama produk yang ingin ditambahkan.',
      });
      return;
    }
    const manualProductId = `manual-${Date.now()}`;
    const newItem: CartItem = {
      productId: manualProductId,
      productName: manualItemName.trim(),
      quantity: 1,
      price: 0,
    };
    setPendingList((prevList) => [...prevList, newItem]);
    setManualItemName('');
    toast({
      title: 'Item Manual Ditambahkan',
      description: `${newItem.productName} telah ditambahkan ke daftar tunggu.`,
    });
  };


  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromPendingList(productId);
      return;
    }
    setPendingList((prevList) =>
      prevList.map((item) =>
        item.productId === productId ? { ...item, quantity } : item
      )
    );
  };

  const removeFromPendingList = (productId: string) => {
    setPendingList((prevList) =>
      prevList.filter((item) => item.productId !== productId)
    );
  };

  const handleCreatePendingOrder = async () => {
    if (pendingList.length === 0) {
      toast({ variant: 'destructive', title: 'List Kosong', description: 'Tambahkan produk ke daftar tunggu.' });
      return;
    }
    if (!selectedCustomer) {
      toast({ variant: 'destructive', title: 'Pelanggan Belum Dipilih', description: 'Pilih pelanggan untuk membuat pesanan tertunda.' });
      return;
    }

    try {
        const batchPromises = pendingList.map(item => {
            return addDoc(collection(db, 'pendingOrders'), {
                storeId: currentStoreId,
                customerId: selectedCustomer.id,
                customerName: selectedCustomer.name,
                customerAvatarUrl: selectedCustomer.avatarUrl,
                productId: item.productId,
                productName: item.productName,
                quantity: item.quantity,
                createdAt: new Date().toISOString(),
            });
        });
        
        await Promise.all(batchPromises);

        toast({
        title: 'Pesanan Tertunda Dibuat!',
        description: `Pesanan untuk ${pendingList.length} item telah dibuat untuk ${selectedCustomer.name}.`,
        });
        setPendingList([]);
        onDataChange();

    } catch (error) {
        console.error("Error creating pending order:", error);
        toast({ variant: 'destructive', title: 'Gagal Membuat Pesanan', description: 'Terjadi kesalahan saat menyimpan data.' });
    }
  };

  const handleCustomerAdded = () => {
      onDataChange();
  }

  return (
    <div className="grid flex-1 items-start gap-4 lg:grid-cols-3 xl:grid-cols-5">
      <div className="lg:col-span-2 xl:col-span-3">
        <Card>
          <CardHeader className="border-b">
             <CardTitle className="font-headline tracking-wider">Produk Habis & Manual</CardTitle>
             <CardDescription>Pilih produk yang habis atau tambahkan item baru ke daftar tunggu.</CardDescription>
            <div className="relative flex items-center gap-2 pt-2">
              <Search className="absolute left-2.5 top-4 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Cari produk yang habis..."
                className="w-full rounded-lg bg-secondary pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Input
                placeholder="Tambah item manual (e.g., 'Baju edisi terbatas')"
                value={manualItemName}
                onChange={(e) => setManualItemName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddManualItem()}
              />
              <Button onClick={handleAddManualItem} className="gap-1 whitespace-nowrap">
                <Plus className="h-4 w-4" />
                <span>Tambah Manual</span>
              </Button>
            </div>
          </CardHeader>
          <ScrollArea className="h-[calc(100vh-320px)]">
            <CardContent className="p-0">
               <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produk</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                {isLoading ? (
                    Array.from({length: 10}).map((_, i) => (
                        <TableRow key={i}>
                            <TableCell><Skeleton className="h-5 w-3/4" /></TableCell>
                            <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                        </TableRow>
                    ))
                ) : outOfStockProducts.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <div className="font-medium">{product.name}</div>
                      <div className="text-xs text-muted-foreground">{product.attributes.brand}</div>
                    </TableCell>
                    <TableCell>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => addToPendingList(product)}
                        aria-label="Add to pending list"
                        className="h-8 w-8 p-0"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              </Table>
            </CardContent>
          </ScrollArea>
        </Card>
      </div>
      <div className="xl:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-headline tracking-wider">
              Daftar Tunggu Pesanan
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Combobox
                options={customerOptions}
                value={selectedCustomer?.id}
                onValueChange={(value) => {
                  setSelectedCustomer(customers.find((c) => c.id === value));
                }}
                placeholder="Cari pelanggan..."
                searchPlaceholder="Cari nama pelanggan..."
                notFoundText="Pelanggan tidak ditemukan."
              />
              <Dialog open={isMemberDialogOpen} onOpenChange={setIsMemberDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="icon">
                    <UserPlus className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle className="font-headline tracking-wider">Daftar Pelanggan Baru</DialogTitle>
                    <DialogDescription>Tambahkan pelanggan baru ke dalam sistem.</DialogDescription>
                  </DialogHeader>
                  <AddCustomerForm setDialogOpen={setIsMemberDialogOpen} onCustomerAdded={handleCustomerAdded} />
                </DialogContent>
              </Dialog>
            </div>

            {selectedCustomer && (
              <div className="flex items-center justify-between rounded-lg border bg-card p-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={selectedCustomer.avatarUrl} />
                    <AvatarFallback>{selectedCustomer.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold">{selectedCustomer.name}</p>
                    <p className="text-sm text-muted-foreground">{selectedCustomer.phone}</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1 font-semibold text-primary">
                    <Crown className="h-4 w-4" />
                    <span>{selectedCustomer.memberTier}</span>
                  </div>
                </div>
              </div>
            )}
            
            <Separator />
            
            <ScrollArea className="h-[300px] w-full">
              <div className="space-y-4 pr-4">
              {pendingList.length > 0 ? (
                pendingList.map((item) => (
                  <div key={item.productId} className="flex items-center gap-4">
                    <div className="flex-1">
                      <p className="font-medium">{item.productName}</p>
                      <p className="text-sm text-muted-foreground">
                        Jumlah Diminta
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() =>
                          updateQuantity(item.productId, item.quantity - 1)
                        }
                      >
                        <MinusCircle className="h-4 w-4" />
                      </Button>
                      <span className="w-4 text-center">{item.quantity}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() =>
                          updateQuantity(item.productId, item.quantity + 1)
                        }
                      >
                        <PlusCircle className="h-4 w-4" />
                      </Button>
                    </div>
                     <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive/80 hover:text-destructive"
                        onClick={() => removeFromPendingList(item.productId)}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                  </div>
                ))
              ) : (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  Belum ada produk di daftar tunggu.
                </div>
              )}
              </div>
            </ScrollArea>
            <Separator />
            <Button size="lg" className="w-full gap-2 font-headline text-lg tracking-wider" onClick={handleCreatePendingOrder}>
                <ClipboardList className="h-5 w-5" />
                Buat Pesanan Tertunda
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
