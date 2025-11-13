
'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
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
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/dashboard/logo';
import { Loader, Eye, EyeOff, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

const registerTenantSchema = z.object({
  storeName: z.string().min(3, { message: 'Nama toko minimal 3 karakter.' }),
  adminName: z.string().min(2, { message: 'Nama Anda minimal 2 karakter.' }),
  email: z.string().email({ message: 'Format email tidak valid.' }),
  whatsapp: z.string().min(10, { message: 'Nomor WhatsApp minimal 10 digit.' }),
  password: z.string().min(6, { message: 'Password minimal 6 karakter.' }),
});

type RegisterTenantFormValues = z.infer<typeof registerTenantSchema>;

function TenantRegistrationForm() {
  const [isLoading, setIsLoading] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const pujaseraGroupSlug = searchParams.get('pujasera');

  const form = useForm<RegisterTenantFormValues>({
    resolver: zodResolver(registerTenantSchema),
    defaultValues: {
      storeName: '',
      adminName: '',
      email: '',
      whatsapp: '',
      password: '',
    },
  });

  const handleRegister = async (values: RegisterTenantFormValues) => {
    setIsLoading(true);
    try {
        const response = await fetch('/api/register/tenant', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...values, pujaseraGroupSlug }),
        });

        const result = await response.json();

        if (response.ok) {
            toast({
                title: 'Pendaftaran Tenant Berhasil!',
                description: 'Akun dan toko Anda telah dibuat. Silakan login untuk memulai.',
            });
            router.push('/login');
        } else {
            throw new Error(result.error || "Terjadi kesalahan pada server.");
        }
    } catch (error) {
        console.error('Tenant registration error:', error);
        toast({
            variant: 'destructive',
            title: 'Pendaftaran Gagal',
            description: (error as Error).message,
        });
    } finally {
        setIsLoading(false);
    }
  };

  if (!pujaseraGroupSlug) {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center p-4">
            <div className="w-full max-w-md space-y-6 text-center">
                 <div className="flex justify-center">
                    <Logo />
                </div>
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Link Tidak Valid</AlertTitle>
                    <AlertDescription>
                        Link undangan untuk pendaftaran tenant tidak valid atau tidak lengkap. Silakan minta link baru dari pengelola pujasera Anda.
                    </AlertDescription>
                </Alert>
                <Button asChild>
                    <Link href="/login">Kembali ke Halaman Login</Link>
                </Button>
            </div>
        </main>
    )
  }

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
                <CardTitle className="font-headline text-2xl tracking-wider">DAFTAR TENANT BARU</CardTitle>
                <CardDescription>
                  Anda diundang untuk bergabung dengan grup pujasera <span className="font-bold text-primary">{pujaseraGroupSlug.split('-').slice(0, -1).join(' ')}</span>.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <p className="text-sm font-semibold text-primary">Informasi Toko Anda</p>
                 <FormField
                  control={form.control}
                  name="storeName"
                  render={({ field }) => (
                    <FormItem>
                      <Label>Nama Toko/Tenant</Label>
                      <FormControl>
                        <Input placeholder="Contoh: Kopi Chika" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <p className="text-sm font-semibold text-primary pt-2">Informasi Admin Toko</p>
                <FormField
                  control={form.control}
                  name="adminName"
                  render={({ field }) => (
                    <FormItem>
                      <Label>Nama Lengkap Anda</Label>
                      <FormControl>
                        <Input placeholder="Nama Anda" {...field} />
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
                        <Input type="email" placeholder="email@tokoanda.com" {...field} />
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
                  Daftarkan Tenant Saya
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

function RegistrationPageSkeleton() {
  return (
     <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <Logo />
        </div>
        <Card>
            <CardHeader className="text-center">
              <Skeleton className="h-7 w-4/5 mx-auto" />
              <Skeleton className="h-4 w-full mt-2 mx-auto" />
            </CardHeader>
            <CardContent className="grid gap-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-4 w-32 mt-2" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
            <CardFooter className="flex-col gap-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </CardFooter>
        </Card>
      </div>
    </main>
  )
}

export default function RegisterTenantPage() {
  return (
    <Suspense fallback={<RegistrationPageSkeleton />}>
      <TenantRegistrationForm />
    </Suspense>
  )
}
