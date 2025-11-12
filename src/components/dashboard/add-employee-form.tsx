
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
import * as React from 'react';
import { Eye, EyeOff, Loader } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { auth } from '@/lib/firebase';

const FormSchema = z.object({
    email: z.string().email({
        message: "Format email tidak valid."
    }),
    name: z.string().min(2, {
      message: 'Nama minimal 2 karakter.',
    }),
    role: z.enum(['admin', 'cashier', 'kitchen', 'pujasera_cashier'], {
        required_error: "Silakan pilih peran."
    }),
    password: z.string().min(6, {
      message: 'Password minimal 6 karakter.',
    }),
  });

type AddEmployeeFormProps = {
  setDialogOpen: (open: boolean) => void;
  onEmployeeAdded: () => void;
};

export function AddEmployeeForm({ setDialogOpen, onEmployeeAdded }: AddEmployeeFormProps) {
  const { activeStore, currentUser } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);

  const defaultRole = currentUser?.role === 'pujasera_admin' ? 'pujasera_cashier' : 'cashier';

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      email: '',
      name: '',
      password: '',
      role: defaultRole,
    },
  });

  async function onSubmit(data: z.infer<typeof FormSchema>) {
      if (!activeStore) {
          toast({ variant: 'destructive', title: 'Toko Tidak Aktif', description: 'Tidak ada toko aktif yang dipilih.'});
          return;
      }
      setIsLoading(true);
      
      try {
        const idToken = await auth.currentUser?.getIdToken(true);
        if (!idToken) {
          throw new Error("Tidak dapat memperoleh token otentikasi.");
        }

        const response = await fetch('/api/employees', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`,
            },
            body: JSON.stringify({ ...data, storeId: activeStore.id }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Server error response:", errorText);
          try {
            const errorJson = JSON.parse(errorText);
            throw new Error(errorJson.error || 'Gagal menambahkan karyawan.');
          } catch {
            // If parsing as JSON fails, use the raw text as the error message.
            // This is useful for catching HTML error pages or other non-JSON responses.
            throw new Error(errorText || 'Gagal menambahkan karyawan: Terjadi kesalahan tidak terduga.');
          }
        }


        toast({
            title: 'Karyawan Berhasil Ditambahkan!',
            description: `Akun untuk ${data.name} telah berhasil dibuat.`,
        });
        
        onEmployeeAdded();
        setDialogOpen(false);

      } catch (error) {
        console.error("Error adding employee:", error);
        toast({
            variant: 'destructive',
            title: 'Terjadi Kesalahan',
            description: (error as Error).message,
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
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nama Lengkap</FormLabel>
              <FormControl>
                <Input placeholder="Budi Perkasa" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
            <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
                <FormItem>
                <FormLabel>Email (untuk login)</FormLabel>
                <FormControl>
                    <Input placeholder="budi@tokosaya.com" type="email" {...field} />
                </FormControl>
                <FormMessage />
                </FormItem>
            )}
            />
            <FormField
            control={form.control}
            name="role"
            render={({ field }) => (
                <FormItem>
                <FormLabel>Peran</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                    <SelectTrigger>
                        <SelectValue placeholder="Pilih peran" />
                    </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                        {currentUser?.role === 'pujasera_admin' ? (
                            <SelectItem value="pujasera_cashier">Kasir Pujasera</SelectItem>
                        ) : (
                            <>
                                <SelectItem value="cashier">Kasir</SelectItem>
                                <SelectItem value="kitchen">Dapur</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                            </>
                        )}
                    </SelectContent>
                </Select>
                <FormMessage />
                </FormItem>
            )}
            />
        </div>
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <div className="relative">
                <FormControl>
                  <Input placeholder="••••••••" type={showPassword ? 'text' : 'password'} {...field} />
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
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading && <Loader className="mr-2 h-4 w-4 animate-spin" />}
          Tambah Karyawan
        </Button>
      </form>
    </Form>
  );
}
