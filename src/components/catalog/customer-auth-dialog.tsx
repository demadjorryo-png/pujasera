
'use client';

import * as React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader, LogIn, UserPlus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Customer } from '@/lib/types';
import { formatWhatsappNumber } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

type CustomerAuthDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    storeId: string;
    onLoginSuccess: (customer: Customer) => void;
};

type AuthStep = 'PHONE_INPUT' | 'NAME_INPUT';

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 100 }, (_, i) => (currentYear - 17 - i).toString());
const months = Array.from({ length: 12 }, (_, i) => ({
  value: (i + 1).toString().padStart(2, '0'),
  label: new Date(0, i).toLocaleString('id-ID', { month: 'long' }),
}));
const days = Array.from({ length: 31 }, (_, i) => (i + 1).toString().padStart(2, '0'));


export function CustomerAuthDialog({ open, onOpenChange, storeId, onLoginSuccess }: CustomerAuthDialogProps) {
    const [step, setStep] = React.useState<AuthStep>('PHONE_INPUT');
    const [phone, setPhone] = React.useState('');
    const [name, setName] = React.useState('');
    const [birthDay, setBirthDay] = React.useState('');
    const [birthMonth, setBirthMonth] = React.useState('');
    const [birthYear, setBirthYear] = React.useState('');
    const [isLoading, setIsLoading] = React.useState(false);
    const { toast } = useToast();
    const descriptionId = React.useId();

    React.useEffect(() => {
        if (open) {
            setStep('PHONE_INPUT');
            setPhone('');
            setName('');
            setBirthDay('');
            setBirthMonth('');
            setBirthYear('');
            setIsLoading(false);
        }
    }, [open]);

    const handlePhoneSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (phone.length < 10) {
            toast({ variant: 'destructive', title: 'Nomor tidak valid', description: 'Masukkan nomor WhatsApp yang valid.' });
            return;
        }
        setIsLoading(true);

        try {
            const response = await fetch('/api/customer-auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: formatWhatsappNumber(phone), storeId }),
            });
            const data = await response.json();

            if (!response.ok) throw new Error(data.error || 'Terjadi kesalahan.');

            if (data.status === 'login_success') {
                onLoginSuccess(data.customer);
            } else if (data.status === 'not_found') {
                setStep('NAME_INPUT');
            }
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error', description: (error as Error).message });
        } finally {
            setIsLoading(false);
        }
    };

    const handleRegisterSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (name.length < 2) {
            toast({ variant: 'destructive', title: 'Nama tidak valid', description: 'Masukkan nama Anda.' });
            return;
        }
        setIsLoading(true);

        const birthDate = (birthYear && birthMonth && birthDay)
            ? `${birthYear}-${birthMonth}-${birthDay}`
            : undefined;

        try {
            const response = await fetch('/api/customer-auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: formatWhatsappNumber(phone), name, storeId, birthDate }),
            });
            const data = await response.json();
            
            if (!response.ok) throw new Error(data.error || 'Terjadi kesalahan.');

            if (data.status === 'register_success') {
                onLoginSuccess(data.customer);
            }

        } catch (error) {
            toast({ variant: 'destructive', title: 'Gagal Mendaftar', description: (error as Error).message });
        } finally {
            setIsLoading(false);
        }
    };

    const renderStep = () => {
        switch (step) {
            case 'NAME_INPUT':
                return (
                    <form onSubmit={handleRegisterSubmit} className="space-y-4">
                        <DialogTitle>Selamat Datang!</DialogTitle>
                        <DialogDescription id={descriptionId}>
                            Nomor Anda belum terdaftar. Masukkan nama Anda untuk menjadi member.
                        </DialogDescription>
                        <div className="space-y-2">
                            <Label htmlFor="name">Nama Anda</Label>
                            <Input
                                id="name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Nama Lengkap Anda"
                                autoFocus
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Tanggal Lahir (Opsional)</Label>
                             <div className="grid grid-cols-3 gap-2">
                                <Select onValueChange={setBirthDay} value={birthDay}>
                                    <SelectTrigger><SelectValue placeholder="Tgl" /></SelectTrigger>
                                    <SelectContent>
                                        {days.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <Select onValueChange={setBirthMonth} value={birthMonth}>
                                    <SelectTrigger><SelectValue placeholder="Bulan" /></SelectTrigger>
                                    <SelectContent>
                                        {months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <Select onValueChange={setBirthYear} value={birthYear}>
                                    <SelectTrigger><SelectValue placeholder="Tahun" /></SelectTrigger>
                                    <SelectContent>
                                         {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                             </div>
                        </div>
                        <DialogFooter>
                            <Button variant="ghost" onClick={() => setStep('PHONE_INPUT')}>Kembali</Button>
                            <Button type="submit" disabled={isLoading}>
                                {isLoading ? <Loader className="animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                                Daftar & Masuk
                            </Button>
                        </DialogFooter>
                    </form>
                );
            case 'PHONE_INPUT':
            default:
                return (
                     <form onSubmit={handlePhoneSubmit} className="space-y-4">
                        <DialogTitle>Login atau Daftar</DialogTitle>
                        <DialogDescription id={descriptionId}>
                            Masukkan nomor WhatsApp Anda untuk melanjutkan.
                        </DialogDescription>
                        <div className="space-y-2">
                            <Label htmlFor="phone">Nomor WhatsApp</Label>
                            <Input
                                id="phone"
                                type="tel"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                placeholder="08123456xxxx"
                                autoFocus
                            />
                        </div>
                         <DialogFooter>
                            <Button type="submit" disabled={isLoading} className="w-full">
                                {isLoading ? <Loader className="animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
                                Lanjutkan
                            </Button>
                        </DialogFooter>
                    </form>
                );
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md" aria-describedby={descriptionId}>
                <DialogHeader>
                    {/* The title is now inside the step renderer */}
                </DialogHeader>
                {renderStep()}
            </DialogContent>
        </Dialog>
    );
}
