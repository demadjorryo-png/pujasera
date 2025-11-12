'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Loader2, PlusCircle, Link as LinkIcon, Share2, Wallet, Calendar, Users, Power, PowerOff, MapPin, User, Phone, Settings2 } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useDashboard } from '@/contexts/dashboard-context';
import { Table, TableBody, TableCell, TableHeader, TableHead, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Store, PosMode } from '@/lib/types';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { cn } from '@/lib/utils';


function InviteTenantDialog({ open, onOpenChange, pujaseraSlug }: { open: boolean, onOpenChange: (open: boolean) => void, pujaseraSlug: string }) {
    const { toast } = useToast();
    const registrationLink = `${window.location.origin}/register/tenant?pujasera=${pujaseraSlug}`;

    const copyToClipboard = () => {
        navigator.clipboard.writeText(registrationLink).then(() => {
            toast({ title: 'Link disalin!' });
        }).catch(() => {
            toast({ variant: 'destructive', title: 'Gagal menyalin link.' });
        });
    };

    const shareToWhatsApp = () => {
        const message = `Halo, kami mengundang Anda untuk bergabung dengan pujasera kami. Silakan daftar melalui link berikut: ${registrationLink}`;
        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Undang Tenant Baru</DialogTitle>
                    <DialogDescription>
                        Bagikan link di bawah ini kepada calon tenant untuk mendaftar ke pujasera Anda.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="registration-link">Link Pendaftaran Unik</Label>
                        <Input id="registration-link" value={registrationLink} readOnly />
                    </div>
                     <div className="grid grid-cols-2 gap-2">
                        <Button onClick={copyToClipboard} variant="outline">
                            <LinkIcon className="mr-2 h-4 w-4" />
                            Salin Link
                        </Button>
                        <Button onClick={shareToWhatsApp}>
                            <Share2 className="mr-2 h-4 w-4" />
                            Bagikan ke WhatsApp
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

function TenantDetailDialog({ tenant, open, onOpenChange, onStatusToggle, isProcessing }: { tenant: Store | null, open: boolean, onOpenChange: (open: boolean) => void, onStatusToggle: (tenant: Store) => void, isProcessing: boolean }) {
    const { dashboardData } = useDashboard();
    
    if (!tenant) return null;
    
    const isPosCurrentlyEnabled = tenant.isPosEnabled !== false;
    
    // Find the primary admin for this tenant
    const adminUser = dashboardData.users.find(u => tenant.adminUids.includes(u.id));

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{tenant.name}</DialogTitle>
                    <DialogDescription>Detail untuk tenant ID: {tenant.id}</DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-2">
                    {adminUser && (
                        <>
                        <div className="flex items-center justify-between rounded-lg border p-3">
                            <span className="text-sm text-muted-foreground flex items-center gap-2"><User/> Admin Utama</span>
                            <span className="font-semibold">{adminUser.name}</span>
                        </div>
                        <div className="flex items-center justify-between rounded-lg border p-3">
                            <span className="text-sm text-muted-foreground flex items-center gap-2"><Phone/> WhatsApp</span>
                            <span className="font-semibold">{adminUser.whatsapp || '-'}</span>
                        </div>
                        </>
                    )}
                     <div className="flex items-center justify-between rounded-lg border p-3">
                        <span className="text-sm text-muted-foreground flex items-center gap-2"><Wallet/> Saldo Token</span>
                        <span className="font-semibold">{tenant.pradanaTokenBalance.toLocaleString('id-ID')}</span>
                    </div>
                     <div className="flex items-center justify-between rounded-lg border p-3">
                        <span className="text-sm text-muted-foreground flex items-center gap-2"><MapPin/> Lokasi</span>
                        <span className="font-semibold">{tenant.location}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-3">
                        <span className="text-sm text-muted-foreground flex items-center gap-2"><Calendar/> Tanggal Bergabung</span>
                        <span className="font-semibold">{format(new Date(tenant.createdAt), "d MMMM yyyy", { locale: idLocale })}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-3">
                        <span className="text-sm text-muted-foreground flex items-center gap-2"><Users/> Jumlah Admin</span>
                        <span className="font-semibold">{tenant.adminUids.length}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-3">
                        <span className="text-sm text-muted-foreground flex items-center gap-2"><Settings2/> Mode POS</span>
                        <Badge variant="outline">Terpusat</Badge>
                    </div>
                     <div className="flex items-center justify-between rounded-lg border p-3">
                        <span className="text-sm text-muted-foreground flex items-center gap-2">Status POS</span>
                        <div className="flex items-center gap-2">
                            <Badge variant={isPosCurrentlyEnabled ? "default" : "destructive"} className={cn(isPosCurrentlyEnabled && 'bg-green-600')}>{isPosCurrentlyEnabled ? "Aktif" : "Non-Aktif"}</Badge>
                            <Button 
                                variant={isPosCurrentlyEnabled ? "destructive" : "secondary"} 
                                size="sm"
                                onClick={() => onStatusToggle(tenant)}
                                disabled={isProcessing}
                            >
                                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin"/> : isPosCurrentlyEnabled ? <PowerOff className="mr-2 h-4 w-4"/> : <Power className="mr-2 h-4 w-4"/>}
                                {isPosCurrentlyEnabled ? "Non-aktifkan" : "Aktifkan"}
                            </Button>
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Tutup</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}


export default function TenantsManagement() {
  const { activeStore, pujaseraTenants } = useAuth();
  const { dashboardData, isLoading, refreshData } = useDashboard();

  const [isAddTenantOpen, setIsAddTenantOpen] = React.useState(false);
  const [isInviteTenantOpen, setIsInviteTenantOpen] = React.useState(false);
  const [updatingTenantId, setUpdatingTenantId] = React.useState<string | null>(null);
  const [selectedTenant, setSelectedTenant] = React.useState<Store | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = React.useState(false);
  const { toast } = useToast();

  const handleRowClick = (tenant: Store) => {
    setSelectedTenant(tenant);
    setIsDetailDialogOpen(true);
  };

  const handleTogglePosStatus = async (tenant: Store) => {
    setUpdatingTenantId(tenant.id);
    const newStatus = tenant.isPosEnabled === false; // Toggle the status
    try {
      const tenantRef = doc(db, 'stores', tenant.id);
      await updateDoc(tenantRef, { isPosEnabled: newStatus });
      toast({
        title: 'Status Tenant Diperbarui',
        description: `POS untuk ${tenant.name} telah ${newStatus ? 'diaktifkan' : 'dinonaktifkan'}.`,
      });
      refreshData();
      setIsDetailDialogOpen(false); // Close dialog on success
    } catch (error) {
       toast({
            variant: 'destructive',
            title: 'Gagal Memperbarui Status',
            description: (error as Error).message,
        });
    } finally {
        setUpdatingTenantId(null);
    }
  }


  return (
    <>
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
                <div>
                    <CardTitle className="font-headline tracking-wider">Manajemen Tenant</CardTitle>
                    <CardDescription>
                        Lihat, kelola, dan atur mode kasir untuk semua tenant di pujasera Anda.
                    </CardDescription>
                </div>
                <div className="flex gap-2">
                    <Dialog open={isAddTenantOpen} onOpenChange={setIsAddTenantOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm" className="gap-1" variant="outline">
                                <PlusCircle className="h-3.5 w-3.5" />
                                <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                                    Tambah Manual
                                </span>
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Tambah Tenant Baru</DialogTitle>
                                <DialogDescription>
                                    Fitur untuk mendaftarkan tenant secara manual akan segera hadir.
                                </DialogDescription>
                            </DialogHeader>
                            <p className="py-4">Untuk saat ini, silakan gunakan fitur "Undang Tenant" untuk membagikan link pendaftaran.</p>
                        </DialogContent>
                    </Dialog>
                    <Button size="sm" className="gap-1" onClick={() => setIsInviteTenantOpen(true)} disabled={!activeStore?.pujaseraGroupSlug}>
                        <Share2 className="h-3.5 w-3.5" />
                        <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                            Undang Tenant
                        </span>
                    </Button>
                </div>
            </div>
          </CardHeader>
          <CardContent>
             <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Nama Tenant</TableHead>
                        <TableHead className="text-center">Status POS</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {isLoading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                            <TableRow key={i}>
                                <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                                <TableCell className="text-center"><Skeleton className="h-10 w-24 mx-auto" /></TableCell>
                            </TableRow>
                        ))
                    ) : (
                        pujaseraTenants.map((tenant) => (
                            <TableRow key={tenant.id} onClick={() => handleRowClick(tenant)} className="cursor-pointer">
                                <TableCell className="font-medium">{tenant.name}</TableCell>
                                <TableCell className="text-center w-48">
                                    <Badge variant={tenant.isPosEnabled !== false ? "default" : "destructive"} className={cn(tenant.isPosEnabled !== false && 'bg-green-600')}>{tenant.isPosEnabled !== false ? "Aktif" : "Non-Aktif"}</Badge>
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
             </Table>
          </CardContent>
        </Card>
      </div>

       <InviteTenantDialog 
            open={isInviteTenantOpen}
            onOpenChange={setIsInviteTenantOpen}
            pujaseraSlug={activeStore?.pujaseraGroupSlug || ''}
       />
       
       <TenantDetailDialog
            tenant={selectedTenant}
            open={isDetailDialogOpen}
            onOpenChange={setIsDetailDialogOpen}
            onStatusToggle={handleTogglePosStatus}
            isProcessing={!!updatingTenantId}
       />
    </>
  );
}
