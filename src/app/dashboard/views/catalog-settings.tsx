'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/auth-context';
import { CheckCircle, ExternalLink, QrCode as QrCodeIcon, Star, Calendar, AlertCircle, Sparkles as SparklesIcon, Upload, Loader2, Image as ImageIcon } from 'lucide-react';
import { useDashboard } from '@/contexts/dashboard-context';
import { Skeleton } from '@/components/ui/skeleton';
import { AIConfirmationDialog } from '@/components/dashboard/ai-confirmation-dialog';
import { useToast } from '@/hooks/use-toast';
import { auth, db, storage } from '@/lib/firebase';
import { doc, updateDoc, setDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { QrCodeDialog } from '@/components/dashboard/QrCodeDialog';
import { Input } from '@/components/ui/input';
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import Image from 'next/image';

const features = [
  "Tampilan menu modern & profesional untuk semua tenant di pujasera Anda.",
  "Integrasi QR Code untuk akses cepat dari meja pelanggan.",
  "Asisten AI untuk menjawab pertanyaan dan memberikan rekomendasi menu.",
  "Update menu dan harga secara real-time dari masing-masing tenant.",
  "Meningkatkan pengalaman pelanggan dan citra modern pujasera Anda.",
];

export default function CatalogSettings() {
  const { activeStore, refreshActiveStore, updateActiveStore } = useAuth();
  const { dashboardData, isLoading } = useDashboard();
  const { feeSettings } = dashboardData;
  const { toast } = useToast();
  
  const [qrisImageFile, setQrisImageFile] = React.useState<File | null>(null);
  const [qrisImagePreview, setQrisImagePreview] = React.useState<string | null>(activeStore?.qrisImageUrl || null);
  const [isUploading, setIsUploading] = React.useState(false);
  const qrisFileInputRef = React.useRef<HTMLInputElement>(null);

  const handleOpenCatalog = () => {
    if (activeStore?.pujaseraGroupSlug) {
      window.open(`/katalog/${activeStore.pujaseraGroupSlug}`, '_blank');
    }
  };
  
  const handleQrisFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setQrisImageFile(file);
      setQrisImagePreview(URL.createObjectURL(file));
    }
  };

  const handleSaveQris = async () => {
    if (!qrisImageFile || !activeStore) {
      toast({ variant: 'destructive', title: 'Tidak ada gambar dipilih' });
      return;
    }
    setIsUploading(true);
    try {
      const storageRef = ref(storage, `stores/${activeStore.id}/qris/${qrisImageFile.name}`);
      const uploadResult = await uploadBytes(storageRef, qrisImageFile);
      const downloadUrl = await getDownloadURL(uploadResult.ref);

      await updateDoc(doc(db, 'stores', activeStore.id), {
        qrisImageUrl: downloadUrl,
      });

      updateActiveStore({ qrisImageUrl: downloadUrl });
      toast({ title: 'Gambar QRIS berhasil disimpan!' });
    } catch (error) {
      console.error("Error saving QRIS:", error);
      toast({ variant: 'destructive', title: 'Gagal menyimpan QRIS' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubscription = async (planId: number | 'trial') => {
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
            body: JSON.stringify({ storeId: activeStore.id, planId }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Gagal memproses langganan.`);
        }
        
        const result = await response.json();

        toast({
            title: 'Langganan Berhasil!',
            description: `Katalog Digital Premium Anda telah diperpanjang.`,
        });

        if (result.newExpiryDate) {
            updateActiveStore({ 
                catalogSubscriptionExpiry: result.newExpiryDate,
                pradanaTokenBalance: result.newBalance,
                hasUsedCatalogTrial: planId === 'trial' ? true : activeStore.hasUsedCatalogTrial,
            });
        } else {
            refreshActiveStore(); 
        }
        return result;
    } catch (error) {
        console.error(`Subscription error:`, error);
        throw error; // Re-throw for AIConfirmationDialog
    }
  };


  if (isLoading || !feeSettings || !activeStore) {
      return (
          <div className="grid gap-6">
              <Skeleton className="h-64 w-full" />
              <div className="grid md:grid-cols-3 gap-6">
                  <Skeleton className="h-64 w-full" />
                  <Skeleton className="h-64 w-full" />
                  <Skeleton className="h-64 w-full" />
              </div>
          </div>
      )
  }
  
  const originalMonthly = feeSettings.catalogMonthlyFee * 6;
  const sixMonthSaving = originalMonthly > 0 ? originalMonthly - feeSettings.catalogSixMonthFee : 0;

  const originalYearly = feeSettings.catalogMonthlyFee * 12;
  const yearlySaving = originalYearly > 0 ? originalYearly - feeSettings.catalogYearlyFee : 0;

  const expiryDate = activeStore?.catalogSubscriptionExpiry ? new Date(activeStore.catalogSubscriptionExpiry) : null;
  const isSubscriptionActive = expiryDate ? expiryDate > new Date() : false;
  const catalogUrl = typeof window !== 'undefined' && activeStore.pujaseraGroupSlug 
    ? `${window.location.origin}/katalog/${activeStore.pujaseraGroupSlug}` 
    : '';


  return (
    <div className="grid gap-6">
        {isSubscriptionActive && expiryDate && (
            <Alert className="border-green-500 bg-green-500/10 text-green-700">
                <Calendar className="h-4 w-4" />
                <AlertTitle className="font-semibold">Langganan Katalog Premium Aktif</AlertTitle>
                <AlertDescription>
                    Fitur katalog digital Anda aktif hingga {format(expiryDate, "d MMMM yyyy, HH:mm", { locale: idLocale })}.
                </AlertDescription>
            </Alert>
        )}

        <Card>
            <CardHeader>
                <CardTitle className="font-headline tracking-wider">Katalog Digital Publik</CardTitle>
                <CardDescription>
                    Tingkatkan pengalaman pelanggan dengan menu digital modern, interaktif, dan cerdas yang didukung oleh Chika AI.
                </CardDescription>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                    <h3 className="font-semibold text-lg">Keunggulan & Manfaat</h3>
                    <ul className="space-y-3">
                        {features.map((feature, index) => (
                             <li key={index} className="flex items-start gap-2">
                                <CheckCircle className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                                <span>{feature}</span>
                            </li>
                        ))}
                    </ul>
                </div>
                 <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed bg-secondary/50 p-6 text-center">
                    <QrCodeIcon className="h-20 w-20 text-muted-foreground mb-4" />
                    <h4 className="font-semibold text-lg">Akses QR Code</h4>
                    <p className="text-muted-foreground text-sm">
                        Pelanggan dapat memindai QR Code untuk langsung membuka katalog Anda.
                    </p>
                    <div className="flex flex-col items-stretch w-full max-w-xs gap-2 mt-4">
                        <QrCodeDialog catalogUrl={catalogUrl} storeName={activeStore.pujaseraName || activeStore.name}>
                            <Button disabled={!isSubscriptionActive} className="w-full">
                                <QrCodeIcon className="mr-2 h-4 w-4" />
                                Tampilkan QR Code
                            </Button>
                        </QrCodeDialog>
                        <Button variant="outline" onClick={handleOpenCatalog} disabled={!isSubscriptionActive} className="w-full">
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Pratinjau
                        </Button>
                    </div>
                    {!isSubscriptionActive && (
                        <p className="text-xs text-muted-foreground mt-2">Aktifkan langganan untuk memakai fitur ini.</p>
                    )}
                </div>
            </CardContent>
        </Card>
        
        <Card>
            <CardHeader>
                <CardTitle className="font-headline tracking-wider">Pengaturan Pembayaran Katalog</CardTitle>
                <CardDescription>
                    Unggah gambar QRIS Anda agar pelanggan dapat membayar langsung melalui katalog.
                </CardDescription>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <div 
                        className="flex justify-center items-center w-full h-48 rounded-md border-2 border-dashed border-input cursor-pointer bg-secondary/50 hover:bg-secondary/70"
                        onClick={() => qrisFileInputRef.current?.click()}
                    >
                        {qrisImagePreview ? (
                            <Image src={qrisImagePreview} alt="Pratinjau QRIS" width={192} height={192} className="h-full w-full object-contain rounded-md" unoptimized/>
                        ) : (
                            <div className="text-center text-muted-foreground">
                                <ImageIcon className="mx-auto h-10 w-10" />
                                <p>Klik untuk memilih gambar QRIS</p>
                            </div>
                        )}
                    </div>
                    <Input 
                        ref={qrisFileInputRef}
                        type="file" 
                        className="hidden" 
                        onChange={handleQrisFileChange}
                        accept="image/png, image/jpeg, image/webp"
                    />
                </div>
                 <div className="space-y-4 flex flex-col justify-center">
                    <p className="text-sm text-muted-foreground">
                        Pilih gambar kode QRIS (misalnya dari GoPay, OVO, DANA, dll.). Gambar ini akan ditampilkan kepada pelanggan saat mereka memilih opsi pembayaran dengan QRIS di katalog.
                    </p>
                    <Button onClick={handleSaveQris} disabled={isUploading || !qrisImageFile}>
                        {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Upload className="mr-2 h-4 w-4" />}
                        Simpan Gambar QRIS
                    </Button>
                </div>
            </CardContent>
        </Card>


        <Card>
             <CardHeader className="text-center">
                <CardTitle className="font-headline tracking-wider">Paket Langganan</CardTitle>
                <CardDescription>
                    Pilih paket yang paling sesuai dengan kebutuhan bisnis Anda untuk mengaktifkan fitur ini.
                </CardDescription>
            </CardHeader>
            <CardContent className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {!activeStore.hasUsedCatalogTrial && (
                     <Card className='flex-1 border-destructive shadow-lg'>
                        <CardHeader className="text-center">
                            <CardTitle className="text-xl">Percobaan</CardTitle>
                            <CardDescription>Hanya sekali klaim!</CardDescription>
                        </CardHeader>
                        <CardContent className="text-center">
                            <p className="text-4xl font-bold">{feeSettings.catalogTrialFee} <span className="text-base font-normal text-muted-foreground">Token/{feeSettings.catalogTrialDurationMonths} bln</span></p>
                        </CardContent>
                        <CardFooter>
                            <AIConfirmationDialog
                              featureName="Klaim Katalog Percobaan"
                              featureDescription={`Anda akan mengaktifkan langganan Katalog Digital Premium selama ${feeSettings.catalogTrialDurationMonths} bulan.`}
                              feeSettings={feeSettings}
                              feeToDeduct={feeSettings.catalogTrialFee}
                              onConfirm={() => handleSubscription('trial')}
                              skipFeeDeduction={false}
                            >
                                <Button className="w-full" variant="destructive">Klaim Penawaran</Button>
                            </AIConfirmationDialog>
                        </CardFooter>
                    </Card>
                )}
                
                <Card className='flex-1'>
                    <CardHeader className="text-center">
                        <CardTitle className="text-xl">Bulanan</CardTitle>
                        <CardDescription>Fleksibel & Terjangkau</CardDescription>
                    </CardHeader>
                    <CardContent className="text-center">
                        <p className="text-4xl font-bold">{feeSettings.catalogMonthlyFee} <span className="text-base font-normal text-muted-foreground">Token/bulan</span></p>
                    </CardContent>
                    <CardFooter>
                        <AIConfirmationDialog
                          featureName="Langganan Bulanan"
                          featureDescription={`Anda akan mengaktifkan atau memperpanjang langganan Katalog Digital Premium selama 1 bulan.`}
                          feeSettings={feeSettings}
                          feeToDeduct={feeSettings.catalogMonthlyFee}
                          onConfirm={() => handleSubscription(1)}
                          skipFeeDeduction={false}
                        >
                            <Button className="w-full" variant="outline">Pilih Paket</Button>
                        </AIConfirmationDialog>
                    </CardFooter>
                </Card>

                 <Card className="border-primary shadow-lg relative flex-1">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2">
                        <div className="flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                            <Star className="h-3 w-3" /> Paling Populer
                        </div>
                    </div>
                    <CardHeader className="text-center">
                        <CardTitle className="text-xl">Setengah Tahun</CardTitle>
                        <CardDescription>Pilihan Terbaik</CardDescription>
                    </CardHeader>
                    <CardContent className="text-center">
                        <p className="text-4xl font-bold">{feeSettings.catalogSixMonthFee} <span className="text-base font-normal text-muted-foreground">Token/6 bulan</span></p>
                        {sixMonthSaving > 0 && (
                            <p className="text-sm text-muted-foreground">Hemat {sixMonthSaving} Token!</p>
                        )}
                    </CardContent>
                    <CardFooter>
                         <AIConfirmationDialog
                          featureName="Langganan 6 Bulan"
                          featureDescription={`Anda akan mengaktifkan atau memperpanjang langganan Katalog Digital Premium selama 6 bulan.`}
                          feeSettings={feeSettings}
                          feeToDeduct={feeSettings.catalogSixMonthFee}
                          onConfirm={() => handleSubscription(6)}
                          skipFeeDeduction={false}
                        >
                           <Button className="w-full">Pilih Paket</Button>
                        </AIConfirmationDialog>
                    </CardFooter>
                </Card>

                 <Card className='flex-1'>
                    <CardHeader className="text-center">
                        <CardTitle className="text-xl">Tahunan</CardTitle>
                        <CardDescription>Nilai Paling Hemat</CardDescription>
                    </CardHeader>
                    <CardContent className="text-center">
                        <p className="text-4xl font-bold">{feeSettings.catalogYearlyFee} <span className="text-base font-normal text-muted-foreground">Token/tahun</span></p>
                         {yearlySaving > 0 && (
                            <p className="text-sm text-muted-foreground">Hemat {yearlySaving} Token!</p>
                        )}
                    </CardContent>
                    <CardFooter>
                         <AIConfirmationDialog
                          featureName="Langganan Tahunan"
                          featureDescription={`Anda akan mengaktifkan atau memperpanjang langganan Katalog Digital Premium selama 1 tahun.`}
                          feeSettings={feeSettings}
                          feeToDeduct={feeSettings.catalogYearlyFee}
                          onConfirm={() => handleSubscription(12)}
                          skipFeeDeduction={false}
                        >
                            <Button className="w-full" variant="outline">Pilih Paket</Button>
                        </AIConfirmationDialog>
                    </CardFooter>
                </Card>
            </CardContent>
        </Card>
    </div>
  );
}
