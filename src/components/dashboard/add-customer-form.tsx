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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { db } from '@/lib/firebase';
import { addDoc, collection } from 'firebase/firestore';
import * as React from 'react';
import { Loader, ScanBarcode } from 'lucide-react';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { BarcodeScanner } from './barcode-scanner';
import { useAuth } from '@/contexts/auth-context';

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 100 }, (_, i) =>
  (currentYear - 17 - i).toString()
);
const months = Array.from({ length: 12 }, (_, i) => ({
  value: (i + 1).toString().padStart(2, '0'),
  label: new Date(0, i).toLocaleString('id-ID', { month: 'long' }),
}));
const days = Array.from({ length: 31 }, (_, i) =>
  (i + 1).toString().padStart(2, '0')
);

const FormSchema = z
  .object({
    name: z.string().min(2, {
      message: 'Nama minimal harus 2 karakter.',
    }),
    phone: z.string().min(10, {
      message: 'Nomor telepon minimal harus 10 digit.',
    }),
    birthDay: z.string().optional(),
    birthMonth: z.string().optional(),
    birthYear: z.string().optional(),
  })

type AddCustomerFormProps = {
  setDialogOpen: (open: boolean) => void;
  onCustomerAdded?: () => void;
};

export function AddCustomerForm({ setDialogOpen, onCustomerAdded }: AddCustomerFormProps) {
  const { toast } = useToast();
  const { activeStore } = useAuth(); // Mengambil activeStore dari context
  const [isLoading, setIsLoading] = React.useState(false);
  const [isScannerOpen, setIsScannerOpen] = React.useState(false);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: '',
      phone: '',
    },
  });

  const handlePhoneScanned = (scannedPhone: string) => {
    // Basic cleaning for scanned phone number
    const cleanedPhone = scannedPhone.replace(/\D/g, ''); 
    form.setValue('phone', cleanedPhone);
    toast({
      title: 'Nomor HP Terbaca!',
      description: `Nomor ${cleanedPhone} telah diisi.`,
    });
    setIsScannerOpen(false);
  };

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    if (!activeStore) {
        toast({
            variant: 'destructive',
            title: 'Toko Tidak Aktif',
            description: 'Tidak ada toko yang aktif untuk menambahkan pelanggan.'
        });
        return;
    }
      
    setIsLoading(true);
    const birthDate = (data.birthYear && data.birthMonth && data.birthDay) 
        ? `${data.birthYear}-${data.birthMonth}-${data.birthDay}` 
        : new Date(0).toISOString().split('T')[0]; // Default date if not provided
        
    const avatarUrl = PlaceHolderImages[Math.floor(Math.random() * PlaceHolderImages.length)].imageUrl;

    try {
        await addDoc(collection(db, 'stores', activeStore.id, 'customers'), {
            name: data.name,
            phone: data.phone,
            birthDate: birthDate,
            joinDate: new Date().toISOString(),
            loyaltyPoints: 0,
            memberTier: 'Bronze',
            avatarUrl: avatarUrl,
        });

        toast({
            title: 'Pelanggan Berhasil Didaftarkan!',
            description: `${data.name} sekarang telah terdaftar di toko ${activeStore.name}.`,
        });

        onCustomerAdded?.();
        setDialogOpen(false);

    } catch (error) {
        console.error("Error adding customer:", error);
        toast({
            variant: 'destructive',
            title: 'Gagal Mendaftarkan Pelanggan',
            description: 'Terjadi kesalahan saat menyimpan data. Silakan coba lagi.',
        });
    } finally {
        setIsLoading(false);
    }
  }

  return (
    <>
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nama Lengkap</FormLabel>
              <FormControl>
                <Input placeholder="Budi Santoso" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nomor Telepon</FormLabel>
                <div className="flex gap-2">
                    <FormControl>
                        <Input placeholder="081234567890" type="tel" {...field} />
                    </FormControl>
                    <Button variant="outline" size="icon" type="button" onClick={() => setIsScannerOpen(true)}>
                        <ScanBarcode className="h-4 w-4" />
                        <span className="sr-only">Scan QR Code</span>
                    </Button>
                </div>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="space-y-2">
          <FormLabel>Tanggal Lahir (Opsional)</FormLabel>
          <div className="grid grid-cols-3 gap-2">
            <FormField
              control={form.control}
              name="birthDay"
              render={({ field }) => (
                <FormItem>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Tgl" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {days.map((day) => (
                        <SelectItem key={day} value={day}>
                          {day}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="birthMonth"
              render={({ field }) => (
                <FormItem>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Bulan" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {months.map((month) => (
                        <SelectItem key={month.value} value={month.value}>
                          {month.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="birthYear"
              render={({ field }) => (
                <FormItem>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Tahun" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {years.map((year) => (
                        <SelectItem key={year} value={year}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
          </div>
          <FormMessage>
            {form.formState.errors.birthDay?.message ||
              form.formState.errors.birthMonth?.message ||
              form.formState.errors.birthYear?.message}
          </FormMessage>
        </div>
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading && <Loader className="mr-2 h-4 w-4 animate-spin" />}
          Daftarkan Pelanggan
        </Button>
      </form>
    </Form>

    <Dialog open={isScannerOpen} onOpenChange={setIsScannerOpen}>
        <DialogContent className="sm:max-w-[425px] md:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-headline tracking-wider">Scan Nomor Telepon</DialogTitle>
            <DialogDescription>
              Arahkan kamera ke QR code yang berisi nomor telepon.
            </DialogDescription>
          </DialogHeader>
          <BarcodeScanner onScan={handlePhoneScanned} />
        </DialogContent>
      </Dialog>
    </>
  );
}
