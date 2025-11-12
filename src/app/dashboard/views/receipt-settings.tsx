
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  getReceiptSettings,
  updateReceiptSettings,
  defaultReceiptSettings
} from '@/lib/receipt-settings';
import { Loader, Receipt, Sparkles, WandSparkles, AlertCircle } from 'lucide-react';
// Hapus import { getReceiptPromo } from '@/ai/flows/receipt-promo-generator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/contexts/auth-context';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboard } from '@/contexts/dashboard-context';
import { AIConfirmationDialog } from '@/components/dashboard/ai-confirmation-dialog';

interface ReceiptPromoInput {
  activePromotions: string[];
  activeStoreName: string;
}

interface ReceiptPromoOutput {
  promoText: string;
}

export default function ReceiptSettings() {
  const { activeStore } = useAuth();
  const { dashboardData } = useDashboard();
  const { redemptionOptions, feeSettings } = dashboardData || {};
  const { toast } = useToast();

  const [settings, setSettings] = React.useState(defaultReceiptSettings);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [generatedPromo, setGeneratedPromo] = React.useState('');

  React.useEffect(() => {
    if (activeStore) {
      setIsLoading(true);
      getReceiptSettings(activeStore.id)
        .then(setSettings)
        .catch(() => {
          toast({ variant: 'destructive', title: 'Gagal memuat pengaturan.' });
        })
        .finally(() => setIsLoading(false));
    }
  }, [activeStore, toast]);

  const handleInputChange = (field: keyof typeof settings, value: string) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveChanges = async () => {
    if (!activeStore) return;
    setIsSaving(true);
    try {
      await updateReceiptSettings(activeStore.id, settings);
      toast({
        title: 'Pengaturan Struk Disimpan!',
        description: `Perubahan untuk toko ${activeStore.name} telah diterapkan.`,
      });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Gagal Menyimpan',
        description: 'Terjadi kesalahan saat menyimpan pengaturan.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleGeneratePromo = async (): Promise<ReceiptPromoOutput> => {
    if (!redemptionOptions || !activeStore) {
        toast({ variant: 'destructive', title: 'Data promo atau toko tidak tersedia.'});
        throw new Error('Redemption options or active store not available');
    }
    const activePromos = redemptionOptions
      .filter((o) => o.isActive)
      .map((o) => o.description);

    setGeneratedPromo('');
    
    const inputData: ReceiptPromoInput = {
      activePromotions: activePromos,
      activeStoreName: activeStore.name,
    };

    const response = await fetch('/api/ai/receipt-promo-generator', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(inputData),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate receipt promo');
    }

    return response.json();
  };

  const handleApplyPromo = () => {
    if (generatedPromo) {
      handleInputChange('promoText', generatedPromo);
      setGeneratedPromo('');
      toast({
        title: 'Teks Promo Diterapkan!',
        description: 'Jangan lupa simpan perubahan Anda.',
      });
    }
  };

  if (isLoading) {
    return <ReceiptSettingsSkeleton />;
  }
  
  if (!activeStore) {
      return (
        <Card>
            <CardHeader>
                <CardTitle>Pengaturan Struk</CardTitle>
            </CardHeader>
            <CardContent>
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Toko Tidak Ditemukan</AlertTitle>
                    <AlertDescription>
                        Silakan pilih toko dari halaman login untuk mengelola pengaturan struk.
                    </AlertDescription>
                </Alert>
            </CardContent>
        </Card>
      )
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-headline tracking-wider">
            Pengaturan Struk untuk {activeStore.name}
          </CardTitle>
          <CardDescription>
            Sesuaikan konten yang muncul pada struk belanja pelanggan untuk toko ini.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-2">
            <Label htmlFor="header-text">Header Struk</Label>
            <Textarea
              id="header-text"
              value={settings.headerText}
              onChange={(e) => handleInputChange('headerText', e.target.value)}
              placeholder="Nama Toko&#10;Alamat Toko&#10;No. Telepon"
              rows={4}
            />
            <p className="text-sm text-muted-foreground">
              Masukkan nama toko, alamat, dan info kontak. Gunakan baris baru
              untuk setiap informasi.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="promo-text">Info Promo Singkat</Label>
            <Textarea
              id="promo-text"
              value={settings.promoText}
              onChange={(e) => handleInputChange('promoText', e.target.value)}
              placeholder="Contoh: Beli 2 gratis 1!"
              rows={2}
            />
            <p className="text-sm text-muted-foreground">
              Teks ini akan muncul di bawah rincian total belanja.
            </p>
          </div>

          <Card className="bg-secondary/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-primary">
                <WandSparkles />
                Butuh Ide Promo?
              </CardTitle>
              <CardDescription>
                Biarkan Chika AI membuat teks promo singkat berdasarkan promo
                aktif Anda saat ini.
              </CardDescription>
            </CardHeader>
            <CardContent>
               <AIConfirmationDialog
                  featureName="Teks Promo Struk"
                  featureDescription="Chika AI akan membuat satu baris teks promo yang menarik untuk dicetak di struk Anda."
                  feeSettings={feeSettings}
                  onConfirm={handleGeneratePromo}
                  onSuccess={(result) => setGeneratedPromo(result.promoText)}
                >
                  <Button variant="outline" disabled={!feeSettings}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Buat dengan Chika AI
                  </Button>
                </AIConfirmationDialog>

              {generatedPromo && (
                <div className="mt-4 space-y-4">
                  <Alert className="border-accent bg-accent/10">
                    <Sparkles className="h-4 w-4 !text-accent" />
                    <AlertTitle className="font-semibold text-accent">
                      Saran Teks Promo:
                    </AlertTitle>
                    <AlertDescription>&quot;{generatedPromo}&quot;</AlertDescription>
                  </Alert>
                  <div className="flex gap-2">
                    <Button onClick={handleApplyPromo}>Terapkan</Button>
                    <AIConfirmationDialog
                        featureName="Teks Promo Struk"
                        featureDescription="Chika AI akan membuat satu baris teks promo yang menarik untuk dicetak di struk Anda."
                        feeSettings={feeSettings}
                        onConfirm={handleGeneratePromo}
                        onSuccess={(result) => setGeneratedPromo(result.promoText)}
                    >
                        <Button variant="ghost">
                            Buat Ulang
                        </Button>
                    </AIConfirmationDialog>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-2">
            <Label htmlFor="footer-text">Footer Struk</Label>
            <Textarea
              id="footer-text"
              value={settings.footerText}
              onChange={(e) => handleInputChange('footerText', e.target.value)}
              placeholder="Contoh: Terima kasih, selamat berbelanja kembali!"
              rows={3}
            />
            <p className="text-sm text-muted-foreground">
              Pesan penutup atau ucapan terima kasih untuk pelanggan.
            </p>
          </div>
          <Button onClick={handleSaveChanges} disabled={isSaving}>
            {isSaving ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : <Receipt className="mr-2 h-4 w-4" />}
            Simpan Perubahan
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ReceiptSettingsSkeleton() {
    return (
        <Card>
            <CardHeader>
                <Skeleton className="h-8 w-1/2" />
                <Skeleton className="h-4 w-3/4" />
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid gap-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-24 w-full" />
                </div>
                <div className="grid gap-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-20 w-full" />
                </div>
                <div className="grid gap-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-20 w-full" />
                </div>
                <Skeleton className="h-10 w-40" />
            </CardContent>
        </Card>
    )
}
