'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { addDoc, collection } from 'firebase/firestore';
import * as React from 'react';
import { Loader } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';


const FormSchema = z.object({
  description: z.string().min(5, {
    message: 'Description must be at least 5 characters.',
  }),
  pointsRequired: z.coerce.number().min(1, 'Points must be greater than 0.'),
  value: z.coerce.number().min(0, 'Value cannot be negative.'),
});

type AddPromotionFormProps = {
  setDialogOpen: (open: boolean) => void;
  onPromotionAdded: () => void;
};

export function AddPromotionForm({ setDialogOpen, onPromotionAdded }: AddPromotionFormProps) {
  const { activeStore } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = React.useState(false);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      description: '',
      pointsRequired: 0,
      value: 0
    },
  });

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    if (!activeStore) {
        toast({ variant: 'destructive', title: 'Toko tidak aktif' });
        return;
    }
    setIsLoading(true);
    
    try {
        await addDoc(collection(db, "stores", activeStore.id, "redemptionOptions"), {
            description: data.description,
            pointsRequired: data.pointsRequired,
            value: data.value,
            isActive: true, // New promotions are active by default
        });

        toast({
            title: 'Promo Berhasil Ditambahkan!',
            description: `"${data.description}" sekarang tersedia untuk penukaran poin.`,
        });

        onPromotionAdded();
        setDialogOpen(false);

    } catch (error) {
        console.error("Error adding promotion:", error);
        toast({
            variant: 'destructive',
            title: 'Gagal Menambahkan Promo',
            description: 'Terjadi kesalahan saat menyimpan data. Silakan coba lagi.',
        });
    } finally {
        setIsLoading(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Deskripsi Promo</FormLabel>
              <FormControl>
                <Input placeholder="Contoh: Potongan Harga Rp 25.000" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="pointsRequired"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Poin yang Dibutuhkan</FormLabel>
              <FormControl>
                <Input type="number" placeholder="100" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="value"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nilai Promo (Rp)</FormLabel>
              <FormControl>
                <Input type="number" placeholder="25000" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading && <Loader className="mr-2 h-4 w-4 animate-spin" />}
          Simpan Promo
        </Button>
      </form>
    </Form>
  );
}
