'use client';

import * as React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ButtonProps } from '@/components/ui/button';
import { AILoadingOverlay } from './ai-loading-overlay';
import { useAuth } from '@/contexts/auth-context';
import type { TransactionFeeSettings } from '@/lib/types';
import { deductAiUsageFee } from '@/lib/server/app-settings';
import { useToast } from '@/hooks/use-toast';
import { Sparkles, Coins } from 'lucide-react';
import { auth } from '@/lib/firebase';

type AIConfirmationDialogProps<T> = {
  featureName: string;
  featureDescription: string;
  feeSettings: TransactionFeeSettings | null;
  feeToDeduct?: number;
  onConfirm: () => Promise<T>;
  onSuccess?: (result: T) => void;
  onError?: (error: Error) => void;
  children: React.ReactNode;
  buttonProps?: ButtonProps;
  skipFeeDeduction?: boolean;
};

export function AIConfirmationDialog<T>({
  featureName,
  featureDescription,
  feeSettings,
  feeToDeduct,
  onConfirm,
  onSuccess,
  onError,
  children,
  skipFeeDeduction = false,
}: AIConfirmationDialogProps<T>) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const { activeStore, pradanaTokenBalance, refreshPradanaTokenBalance } = useAuth();
  const { toast } = useToast();

  const actualFee = feeToDeduct ?? feeSettings?.aiUsageFee ?? 0;

  const handleConfirm = async () => {
    if (!activeStore) {
      toast({ variant: 'destructive', title: 'Error', description: 'Toko tidak aktif.' });
      return;
    }
    
    if (!skipFeeDeduction) {
      if (!feeSettings) {
        toast({ variant: 'destructive', title: 'Error', description: 'Pengaturan biaya tidak tersedia.' });
        return;
      }
      if (pradanaTokenBalance < actualFee) {
        toast({
          variant: 'destructive',
          title: 'Saldo Token Tidak Cukup',
          description: `Penggunaan fitur ini memerlukan ${actualFee} token, tetapi saldo Anda hanya ${pradanaTokenBalance.toFixed(2)}. Silakan top up.`
        });
        setIsOpen(false);
        return;
      }
    }
    
    setIsOpen(false);
    setIsProcessing(true);

    try {
      const result = await onConfirm();
      
      toast({ title: 'Sukses!', description: `${featureName} berhasil diproses.` });
      
      if (onSuccess) {
        onSuccess(result);
      }

    } catch (error) {
      console.error(`Error executing AI feature '${featureName}':`, error);
      toast({
        variant: 'destructive',
        title: `Gagal Memproses ${featureName}`,
        description: (error as Error).message || 'Terjadi kesalahan. Silakan coba lagi.',
      });
      
      if (onError && error instanceof Error) {
        onError(error);
      }

    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
        <AlertDialogTrigger asChild>
          {children}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center justify-center gap-2">
              <Sparkles className="text-primary" />
               Konfirmasi: {featureName}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {featureDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {!skipFeeDeduction && (
            <div className="rounded-lg border bg-secondary/50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Biaya Penggunaan</span>
                <span className="flex items-center gap-2 font-bold text-primary">
                  <Coins className="h-4 w-4" />
                  {actualFee} Pradana Token
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Saldo Token Toko Anda</span>
                <span className="text-sm font-semibold">{pradanaTokenBalance.toFixed(2)} Token</span>
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={!activeStore}>
              Ya, Lanjutkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isProcessing && <AILoadingOverlay featureName={featureName} />}
    </>
  );
}
