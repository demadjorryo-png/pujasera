'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader, Send, Volume2, AlertCircle, RefreshCw, Sparkles } from 'lucide-react';
import type { Customer, Store, Transaction } from '@/lib/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { auth, db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import type { TextToSpeechInput, TextToSpeechOutput } from '@/ai/flows/text-to-speech';
import type { OrderReadyFollowUpOutput, OrderReadyFollowUpInput } from '@/ai/flows/order-ready-follow-up';

type OrderReadyDialogProps = {
  transaction: Transaction;
  customer?: Customer;
  store: Store;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

// Firestore Caching Strategy:
// 1. On open, check if `transaction.generatedFollowUpText` exists.
// 2. If yes, use it. If no, wait for user to click generate button.
// 3. After generation, save the new text back to the transaction document in Firestore.

export function OrderReadyDialog({
  transaction,
  customer,
  store,
  open,
  onOpenChange,
  onSuccess
}: OrderReadyDialogProps) {
  const [isGeneratingText, setIsGeneratingText] = React.useState(false);
  const [generatedText, setGeneratedText] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [isGeneratingAudio, setIsGeneratingAudio] = React.useState(false);
  const [audioDataUri, setAudioDataUri] = React.useState('');
  
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const { toast } = useToast();

  const generateAndCacheText = React.useCallback(async (forceRegenerate: boolean = false) => {
    setIsGeneratingText(true);
    setError(null);
    setAudioDataUri('');

    if (transaction.generatedFollowUpText && !forceRegenerate) {
        setGeneratedText(transaction.generatedFollowUpText);
        setIsGeneratingText(false);
        return;
    }

    try {
      const idToken = await auth.currentUser?.getIdToken(true);
      if (!idToken) throw new Error("Authentication token not available.");

      const response = await fetch('/api/ai/order-ready-follow-up', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          customerName: customer?.name || transaction.customerName,
          storeName: store.name,
          itemsOrdered: transaction.items.map(i => i.productName),
          currentTime: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          notificationStyle: store.receiptSettings?.notificationStyle || 'fakta',
        } as OrderReadyFollowUpInput)
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to generate creative text.');
      }

      const result: OrderReadyFollowUpOutput = await response.json();
      const newText = result.followUpMessage;
      setGeneratedText(newText);

      // Save the new text back to Firestore
      try {
        const transactionRef = doc(db, 'stores', store.id, 'transactions', transaction.id);
        await updateDoc(transactionRef, {
          generatedFollowUpText: newText
        });
        toast({
            title: 'Teks Berhasil Dibuat!',
            description: 'Teks notifikasi baru telah disimpan.',
        });
      } catch (firestoreError) {
        console.error("Failed to cache text to Firestore:", firestoreError);
        // Non-critical error
      }

    } catch (e) {
      console.error("Error generating creative text:", e);
      setError((e as Error).message);
    } finally {
      setIsGeneratingText(false);
    }
  }, [customer, transaction, store]);

  React.useEffect(() => {
    if (open) {
      // On open, check for cached text but don't generate automatically
      if (transaction.generatedFollowUpText) {
        setGeneratedText(transaction.generatedFollowUpText);
      } else {
        setGeneratedText(''); // Clear old text if any
      }
      setError(null);
      setAudioDataUri('');
      setIsGeneratingText(false);
      setIsGeneratingAudio(false);
    }
  }, [open, transaction]);


  const handleTextToSpeech = async () => {
    if (!generatedText) {
        toast({ variant: 'destructive', title: 'Teks Kosong', description: 'Buat teks notifikasi terlebih dahulu dengan tombol "Follow Up AI".' });
        return;
    }
    setIsGeneratingAudio(true);
    setAudioDataUri('');
    try {
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) throw new Error("Authentication token not available.");
        const response = await fetch('/api/ai/text-to-speech', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
            body: JSON.stringify({ text: generatedText, gender: 'female' } as TextToSpeechInput),
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to generate audio.');
        }
        const result: TextToSpeechOutput = await response.json();
        setAudioDataUri(result.audioDataUri);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Gagal Membuat Suara', description: (e as Error).message });
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  React.useEffect(() => {
    if (audioDataUri && audioRef.current) {
      audioRef.current.play().catch(e => console.error("Audio playback failed:", e));
    }
  }, [audioDataUri]);

  const handleSendWhatsApp = () => {
     if (!generatedText) {
        toast({ variant: 'destructive', title: 'Teks Kosong', description: 'Buat teks notifikasi terlebih dahulu dengan tombol "Follow Up AI".' });
        return;
    }
    if (!customer?.phone) {
      toast({ variant: 'destructive', title: 'Nomor WhatsApp Tidak Ditemukan' });
      return;
    }
    const whatsappUrl = `https://wa.me/${customer.phone}?text=${encodeURIComponent(generatedText)}`;
    window.open(whatsappUrl, '_blank');
    toast({ title: "Membuka WhatsApp..." });
    onSuccess?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Follow Up Pesanan Cerdas</DialogTitle>
          <DialogDescription>
            Panggil pelanggan atau kirim notifikasi WhatsApp dengan bantuan AI.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          
          {error && (
             <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Gagal Membuat Teks</AlertTitle>
              <AlertDescription>
                {error}
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => generateAndCacheText(true)}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Coba Lagi
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {generatedText ? (
            <Alert variant="default">
              <AlertTitle className="font-semibold">Teks Notifikasi</AlertTitle>
              <AlertDescription className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap mt-2">
                {generatedText}
              </AlertDescription>
            </Alert>
          ) : (
             <Alert variant="default">
              <AlertTitle>Teks Notifikasi Belum Dibuat</AlertTitle>
              <AlertDescription>
                Klik tombol "Follow Up AI" untuk membuat teks notifikasi yang unik untuk pelanggan ini.
              </AlertDescription>
            </Alert>
          )}
              
          <div className="flex flex-col sm:flex-row gap-2 mt-4">
            <Button onClick={() => generateAndCacheText(true)} disabled={isGeneratingText} className="w-full">
                {isGeneratingText ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Follow Up AI
            </Button>
            <Button onClick={handleTextToSpeech} disabled={isGeneratingAudio || !generatedText} className="w-full">
              {isGeneratingAudio ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : <Volume2 className="mr-2 h-4 w-4" />}
              Panggil Suara
            </Button>
            <Button onClick={handleSendWhatsApp} disabled={!customer?.phone || !generatedText} className="w-full">
              <Send className="mr-2 h-4 w-4" /> Kirim WhatsApp
            </Button>
          </div>

          {audioDataUri && (
              <audio ref={audioRef} src={audioDataUri} className="w-full mt-4" controls autoPlay/>
          )}

        </div>
      </DialogContent>
    </Dialog>
  );
}
