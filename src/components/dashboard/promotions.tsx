
'use client';

import * as React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import type { RedemptionOption, Transaction } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, PlusCircle, CheckCircle, XCircle, Sparkles, Loader, Target, Save } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getPromotionRecommendations } from '@/ai/flows/promotion-recommendation';
import type { PromotionRecommendationOutput } from '@/ai/flows/promotion-recommendation';
import { useToast } from '@/hooks/use-toast';
import { startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { pointEarningSettings, updatePointEarningSettings } from '@/lib/point-earning-settings';
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
import { db } from '@/lib/firebase';
import { doc, updateDoc, deleteDoc, collection, addDoc } from 'firebase/firestore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { AddPromotionForm } from '@/components/dashboard/add-promotion-form';
import { useAuth } from '@/contexts/auth-context';
import { deductAiUsageFee } from '@/lib/app-settings';
import type { TransactionFeeSettings } from '@/lib/app-settings';

type PromotionsProps = {
  redemptionOptions: RedemptionOption[];
  setRedemptionOptions: React.Dispatch<React.SetStateAction<RedemptionOption[]>>;
  transactions: Transaction[];
  feeSettings: TransactionFeeSettings;
}

export default function Promotions({ redemptionOptions, setRedemptionOptions, transactions, feeSettings }: PromotionsProps) {
  const { currentUser, activeStore, pradanaTokenBalance, refreshPradanaTokenBalance } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const [recommendations, setRecommendations] = React.useState<PromotionRecommendationOutput | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const { toast } = useToast();

  const [isAddDialogOpen, setIsAddDialogOpen] = React.useState(false);

  const [rpPerPoint, setRpPerPoint] = React.useState(pointEarningSettings.rpPerPoint);

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [promotionToDelete, setPromotionToDelete] = React.useState<RedemptionOption | null>(null);

  const handleDeleteClick = (option: RedemptionOption) => {
    setPromotionToDelete(option);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!promotionToDelete) return;

    try {
      await deleteDoc(doc(db, "redemptionOptions", promotionToDelete.id));
      setRedemptionOptions(prev => prev.filter(p => p.id !== promotionToDelete.id));
      toast({
        title: 'Promosi Dihapus!',
        description: `Promo "${promotionToDelete.description}" telah berhasil dihapus.`,
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Gagal menghapus",
        description: "Terjadi kesalahan saat menghapus promosi."
      });
    }


    setIsDeleteDialogOpen(false);
    setPromotionToDelete(null);
  };


  const handleSavePointEarning = () => {
    updatePointEarningSettings({ rpPerPoint });
    toast({
      title: 'Pengaturan Disimpan!',
      description: `Sekarang, pelanggan akan mendapatkan 1 poin untuk setiap pembelanjaan Rp ${rpPerPoint.toLocaleString('id-ID')}.`,
    });
  };

  const toggleStatus = async (id: string) => {
    const option = redemptionOptions.find(o => o.id === id);
    if (!option) return;

    const newStatus = !option.isActive;
    const optionRef = doc(db, 'redemptionOptions', id);

    try {
      await updateDoc(optionRef, { isActive: newStatus });
      setRedemptionOptions((prevOptions) =>
        prevOptions.map((opt) =>
          opt.id === id ? { ...opt, isActive: newStatus } : opt
        )
      );
      toast({
        title: 'Status Diperbarui',
        description: `Status promosi telah berhasil diubah.`,
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Gagal memperbarui",
        description: "Terjadi kesalahan saat mengubah status promosi."
      });
    }
  };

  const handleGenerateRecommendations = async () => {
    if (!activeStore) return;
    try {
      await deductAiUsageFee(pradanaTokenBalance, feeSettings, activeStore.id, toast);
    } catch {
      return; // Stop if not enough tokens
    }

    setIsLoading(true);
    setRecommendations(null);

    const now = new Date();
    const startOfThisMonth = startOfMonth(now);
    const endOfThisMonth = endOfMonth(now);
    const thisMonthTransactions = transactions.filter(t => isWithinInterval(new Date(t.createdAt), { start: startOfThisMonth, end: endOfThisMonth }));

    const calculateProductSales = (txs: Transaction[]) => {
      const sales: Record<string, number> = {};
      txs.forEach(t => {
        t.items.forEach(item => {
          if (!sales[item.productName]) {
            sales[item.productName] = 0;
          }
          sales[item.productName] += item.quantity;
        });
      });
      return Object.entries(sales).sort(([, a], [, b]) => b - a);
    };

    const sortedProductsThisMonth = calculateProductSales(thisMonthTransactions);
    const topProducts = sortedProductsThisMonth.slice(0, 3).map(([name]) => name);
    const worstProducts = sortedProductsThisMonth.slice(-3).reverse().map(([name]) => name);

    try {
      const result = await getPromotionRecommendations({
        businessDescription: activeStore.businessType,
        activeStoreName: activeStore.name,
        currentRedemptionOptions: redemptionOptions.map(o => ({
          description: o.description,
          pointsRequired: o.pointsRequired,
          isActive: o.isActive,
        })),
        topSellingProducts: topProducts,
        worstSellingProducts: worstProducts,
      });
      setRecommendations(result);
      refreshPradanaTokenBalance();
    } catch (error) {
      console.error('Error generating promotion recommendations:', error);
      toast({
        variant: 'destructive',
        title: 'Gagal Membuat Rekomendasi',
        description: 'Tidak dapat membuat rekomendasi. Silakan coba lagi.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyRecommendation = async (rec: PromotionRecommendationOutput['recommendations'][0]) => {
    try {
      const docRef = await addDoc(collection(db, "redemptionOptions"), {
        description: rec.description,
        pointsRequired: rec.pointsRequired,
        value: rec.value,
        isActive: false, // New promos from AI are inactive by default
      });

      const newPromotion: RedemptionOption = {
        id: docRef.id,
        description: rec.description,
        pointsRequired: rec.pointsRequired,
        value: rec.value,
        isActive: false,
      };

      setRedemptionOptions(prev => [...prev, newPromotion]);
      toast({
        title: 'Draf Promo Dibuat!',
        description: `"${rec.title}" telah ditambahkan sebagai promo non-aktif.`,
      });

    } catch {
      toast({
        variant: 'destructive',
        title: 'Gagal Menerapkan Promo',
        description: 'Terjadi kesalahan saat menyimpan draf promo. Silakan coba lagi.',
      });
    }
  };

  const handlePromotionAdded = (newPromotion: RedemptionOption) => {
    setRedemptionOptions(prev => [...prev, newPromotion]);
  };


  return (
    <>
      <div className="grid gap-6">
        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="font-headline tracking-wider">Pengaturan Perolehan Poin</CardTitle>
              <CardDescription>Atur berapa total belanja (dalam Rupiah) yang diperlukan untuk mendapatkan 1 poin loyalitas.</CardDescription>
            </CardHeader>
            <CardContent className="max-w-sm space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="rp-per-point">Belanja (Rp) untuk 1 Poin</Label>
                <Input
                  id="rp-per-point"
                  type="number"
                  value={rpPerPoint}
                  onChange={(e) => setRpPerPoint(Number(e.target.value))}
                  step="1000"
                />
              </div>
              <Button onClick={handleSavePointEarning}>
                <Save className="mr-2 h-4 w-4" />
                Simpan Pengaturan
              </Button>
            </CardContent>
          </Card>
        )}
        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="font-headline tracking-wider">Rekomendasi Promo Chika AI</CardTitle>
              <CardDescription>Dapatkan ide promo loyalitas baru berdasarkan data penjualan terkini.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleGenerateRecommendations} disabled={isLoading}>
                {isLoading ? (
                  <Loader className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                Buat Rekomendasi Baru ({feeSettings.aiUsageFee} Token)
              </Button>
              {recommendations && (
                <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {recommendations.recommendations.map((rec, index) => (
                    <Card key={index}>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2 text-accent"><Sparkles className="h-4 w-4" />{rec.title}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <p className="text-sm">{rec.description}</p>
                        <p className="text-xs text-muted-foreground italic">&quot;{rec.justification}&quot;</p>
                        <div className='flex justify-between text-xs pt-2'>
                          <span className='font-semibold'>{rec.pointsRequired} Poin</span>
                          <span className='font-semibold'>Senilai Rp {rec.value.toLocaleString('id-ID')}</span>
                        </div>
                      </CardContent>
                      <CardFooter>
                        <Button variant="outline" size="sm" onClick={() => handleApplyRecommendation(rec)}>
                          <Target className="mr-2 h-4 w-4" />
                          Terapkan
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="font-headline tracking-wider">
                  Promo Penukaran Poin
                </CardTitle>
                <CardDescription>
                  {isAdmin
                    ? 'Kelola promo penukaran poin loyalitas yang aktif.'
                    : 'Lihat promo penukaran poin loyalitas yang sedang aktif.'}
                </CardDescription>
              </div>
              {isAdmin && (
                <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-1">
                      <PlusCircle className="h-3.5 w-3.5" />
                      <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                        Tambah Promo
                      </span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle className="font-headline tracking-wider">Tambah Promo Baru</DialogTitle>
                      <DialogDescription>
                        Buat opsi penukaran poin loyalitas baru untuk pelanggan.
                      </DialogDescription>
                    </DialogHeader>
                    <AddPromotionForm setDialogOpen={setIsAddDialogOpen} onPromotionAdded={handlePromotionAdded} />
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Deskripsi</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Poin Dibutuhkan</TableHead>
                  <TableHead className="text-right">Nilai (Rp)</TableHead>
                  {isAdmin && <TableHead className="text-right">Aksi</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {redemptionOptions.map((option) => (
                  <TableRow key={option.id}>
                    <TableCell className="font-medium">{option.description}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={option.isActive ? 'default' : 'destructive'}>
                        {option.isActive ? 'Aktif' : 'Non-Aktif'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {option.pointsRequired.toLocaleString('id-ID')}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {option.value.toLocaleString('id-ID')}
                    </TableCell>
                    {isAdmin && (
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
                            <DropdownMenuItem onClick={() => toggleStatus(option.id)}>
                              {option.isActive ? (
                                <XCircle className="mr-2 h-4 w-4" />
                              ) : (
                                <CheckCircle className="mr-2 h-4 w-4" />
                              )}
                              <span>{option.isActive ? 'Non-Aktifkan' : 'Aktifkan'}</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem>Ubah</DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteClick(option)}>
                              Hapus
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Anda Yakin?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini tidak dapat dibatalkan. Ini akan menghapus promosi secara permanen: <br />
              <span className="font-bold">&quot;{promotionToDelete?.description}&quot;</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              Ya, Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
