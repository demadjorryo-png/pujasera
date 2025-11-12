
'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Form, FormField, FormItem, FormControl, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/dashboard/logo';
import { Loader, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { auth, db } from '@/lib/firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, writeBatch } from 'firebase/firestore';

const registerSchema = z.object({
  pujaseraName: z.string().min(3, { message: 'Nama pujasera minimal 3 karakter.' }),
  pujaseraLocation: z.string().min(3, { message: 'Lokasi pujasera minimal 3 karakter.' }),
  adminName: z.string().min(2, { message: 'Nama Anda minimal 2 karakter.' }),
  email: z.string().email({ message: 'Format email tidak valid.' }),
  whatsapp: z.string().min(10, { message: 'Nomor WhatsApp minimal 10 digit.' }),
  password: z.string().min(6, { message: 'Password minimal 6 karakter.' }),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function RegisterPujaseraPage() {
  const [isLoading, setIsLoading] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      pujaseraName: '',
      pujaseraLocation: '',
      adminName: '',
      email: '',
      whatsapp: '',
      password: '',
    },
  });

  const handleRegister = async (values: RegisterFormValues) => {
    setIsLoading(true);
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(values),
        });

        const result = await response.json();

        if (response.ok) {
            toast({
                title: 'Pendaftaran Pujasera Berhasil!',
                description: 'Grup pujasera dan akun admin Anda telah dibuat. Silakan login.',
            });
            router.push('/login');
        } else {
            throw new Error(result.error || "Terjadi kesalahan pada server.");
        }
    } catch (error) {
        console.error('Registration error:', error);
        toast({
            variant: 'destructive',
            title: 'Pendaftaran Gagal',
            description: (error as Error).message,
        });
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <Logo />
        </div>
        <Card>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleRegister)}>
              <CardHeader className="text-center">
                <CardTitle className="font-headline text-2xl tracking-wider">DAFTARKAN PUJASERA ANDA</CardTitle>
                <CardDescription>
                  Buat grup pujasera baru dan akun admin utama Anda.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <p className="text-sm font-semibold text-primary">Informasi Pujasera / Grup</p>
                <FormField
                  control={form.control}
                  name="pujaseraName"
                  render={({ field }) => (
                    <FormItem>
                      <Label>Nama Pujasera / Grup UMKM</Label>
                      <FormControl>
                        <Input placeholder="Contoh: Pujasera Blok M" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="pujaseraLocation"
                  render={({ field }) => (
                    <FormItem>
                      <Label>Lokasi Pujasera</Label>
                      <FormControl>
                        <Input placeholder="Contoh: Jakarta Selatan" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <p className="text-sm font-semibold text-primary pt-2">Informasi Admin Utama</p>
                <FormField
                  control={form.control}
                  name="adminName"
                  render={({ field }) => (
                    <FormItem>
                      <Label>Nama Lengkap Anda</Label>
                      <FormControl>
                        <Input placeholder="Nama Pengelola" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <Label>Email (untuk login)</Label>
                      <FormControl>
                        <Input type="email" placeholder="admin@pujasera.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="whatsapp"
                  render={({ field }) => (
                    <FormItem>
                      <Label>Nomor WhatsApp</Label>
                      <FormControl>
                        <Input type="tel" placeholder="08123666xxxx" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <Label>Password</Label>
                      <div className="relative">
                        <FormControl>
                          <Input type={showPassword ? 'text' : 'password'} {...field} />
                        </FormControl>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
              <CardFooter className="flex-col gap-4">
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading && <Loader className="mr-2 h-4 w-4 animate-spin" />}
                  Daftarkan Pujasera
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  Sudah punya akun? <Link href="/login" className="font-semibold text-primary hover:underline">Masuk di sini</Link>
                </p>
              </CardFooter>
            </form>
          </Form>
        </Card>
      </div>
    </main>
  );
}
