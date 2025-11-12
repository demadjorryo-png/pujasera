'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
// Hapus import { generateChallenges } from '@/ai/flows/challenge-generator';
// Hapus import type { ChallengeGeneratorOutput, Challenge } from '@/ai/flows/challenge-generator';
import { Loader, Sparkles, Trophy, Save, Calendar as CalendarIcon, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useDashboard } from '@/contexts/dashboard-context';
import { addDoc, collection, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DateRange } from 'react-day-picker';
import { addDays, format } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import { AIConfirmationDialog } from '@/components/dashboard/ai-confirmation-dialog';
import { Switch } from '@/components/ui/switch';
import type { ChallengePeriod } from '@/lib/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface Challenge {
  tier: string;
  description: string;
  target: number;
  reward: string;
}

interface ChallengeGeneratorOutput {
  challenges: Challenge[];
  period: string;
}

interface ChallengeGeneratorInput {
  budget: number;
  startDate: string;
  endDate: string;
  activeStoreName: string;
  businessDescription: string;
}

function ChallengePeriodCard({ period, onStatusChange, onDelete, isProcessing }: { period: ChallengePeriod, onStatusChange: (id: string, newStatus: boolean) => void, onDelete: (id: string) => void, isProcessing: boolean }) {
  const [isOpen, setIsOpen] = React.useState(period.isActive);
  
  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>{period.period}</CardTitle>
            <CardDescription>{period.challenges.length} tingkatan tantangan</CardDescription>
          </div>
          <CollapsibleTrigger asChild>
             <Button variant="ghost" size="sm" className="w-9 p-0">
                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                <span className="sr-only">Toggle</span>
            </Button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
            <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {period.challenges.map((challenge: Challenge, index: number) => (
                <Card key={index} className="flex flex-col bg-secondary/50">
                    <CardHeader>
                    <CardTitle className='text-base flex items-center gap-2'>
                        <Trophy className='w-4 h-4 text-primary'/>
                        {challenge.tier}
                    </CardTitle>
                    <CardDescription>{challenge.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-grow space-y-2">
                        <div>
                            <p className="text-xs text-muted-foreground">Target Omset</p>
                            <p className="font-semibold text-lg">Rp {challenge.target.toLocaleString('id-ID')}</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">Hadiah</p>
                            <p className="font-semibold text-accent">{challenge.reward}</p>
                        </div>
                    </CardContent>
                </Card>
            ))}
            </CardContent>
        </CollapsibleContent>
        <CardFooter className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
                <Switch
                    id={`active-switch-${period.id}`}
                    checked={period.isActive}
                    onCheckedChange={(checked) => onStatusChange(period.id, checked)}
                    disabled={isProcessing}
                />
                <Label htmlFor={`active-switch-${period.id}`}>{period.isActive ? 'Aktif' : 'Non-Aktif'}</Label>
            </div>
            <Button variant="destructive" size="sm" onClick={() => onDelete(period.id)} disabled={isProcessing}>
                <Trash2 className="mr-2 h-4 w-4" />
                Hapus
            </Button>
        </CardFooter>
      </Collapsible>
    </Card>
  );
}


export default function Challenges() {
  const { currentUser, activeStore } = useAuth();
  const { dashboardData, refreshData } = useDashboard();
  const { feeSettings, challengePeriods } = dashboardData;
  const { toast } = useToast();

  const [budget, setBudget] = React.useState(500000);
  const [date, setDate] = React.useState<DateRange | undefined>({
    from: new Date(),
    to: addDays(new Date(), 30),
  });
  const [isSaving, setIsSaving] = React.useState(false);
  const [generatedChallenges, setGeneratedChallenges] = React.useState<ChallengeGeneratorOutput | null>(null);

  const [isProcessingAction, setIsProcessingAction] = React.useState(false);
  const [periodToDelete, setPeriodToDelete] = React.useState<ChallengePeriod | null>(null);

  const handleGenerateChallenges = async (): Promise<ChallengeGeneratorOutput> => {
    if (!activeStore || !currentUser || !feeSettings) {
        toast({ variant: 'destructive', title: 'Error', description: 'Data tidak lengkap untuk membuat tantangan.'});
        throw new Error('Incomplete data');
    }

    if (budget <= 0) {
      toast({
        variant: 'destructive',
        title: 'Anggaran Tidak Valid',
        description: 'Silakan masukkan anggaran lebih besar dari nol.',
      });
      throw new Error('Invalid budget');
    }
    if (!date?.from || !date?.to) {
        toast({
            variant: 'destructive',
            title: 'Tanggal Tidak Valid',
            description: 'Silakan pilih tanggal mulai dan selesai.',
        });
        throw new Error('Invalid date');
    }
    
    setGeneratedChallenges(null);

    const inputData: ChallengeGeneratorInput = {
        budget,
        startDate: format(date.from, 'yyyy-MM-dd'),
        endDate: format(date.to, 'yyyy-MM-dd'),
        activeStoreName: activeStore.name,
        businessDescription: activeStore.businessDescription || 'bisnis',
    };

    const response = await fetch('/api/ai/challenge-generator', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(inputData),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate challenges');
    }

    return response.json();
  };

  const handleSaveChallenges = async () => {
    if (!generatedChallenges || !activeStore) return;

    setIsSaving(true);
    try {
      await addDoc(collection(db, 'stores', activeStore.id, 'challengePeriods'), {
        startDate: format(date?.from || new Date(), 'yyyy-MM-dd'),
        endDate: format(date?.to || new Date(), 'yyyy-MM-dd'),
        period: generatedChallenges.period,
        challenges: generatedChallenges.challenges,
        isActive: true,
        createdAt: new Date().toISOString(),
      });
      
      toast({ title: 'Tantangan Berhasil Disimpan!', description: 'Periode tantangan baru kini aktif untuk para tenant.' });
      setGeneratedChallenges(null);
      refreshData();
    } catch {
      toast({ variant: 'destructive', title: 'Gagal Menyimpan Tantangan' });
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleStatusChange = async (id: string, newStatus: boolean) => {
    if (!activeStore) return;
    setIsProcessingAction(true);
    try {
      const periodRef = doc(db, 'stores', activeStore.id, 'challengePeriods', id);
      await updateDoc(periodRef, { isActive: newStatus });
      toast({ title: 'Status Diperbarui', description: 'Status periode tantangan telah diubah.' });
      refreshData();
    } catch {
      toast({ variant: 'destructive', title: 'Gagal Memperbarui Status' });
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleDelete = (period: ChallengePeriod) => {
    setPeriodToDelete(period);
  };
  
  const confirmDelete = async () => {
    if (!periodToDelete || !activeStore) return;
    setIsProcessingAction(true);
    try {
      await deleteDoc(doc(db, 'stores', activeStore.id, 'challengePeriods', periodToDelete.id));
      toast({ title: 'Periode Dihapus', description: `Periode tantangan ${periodToDelete.period} telah dihapus.` });
      refreshData();
      setPeriodToDelete(null);
    } catch {
       toast({ variant: 'destructive', title: 'Gagal Menghapus' });
    } finally {
       setIsProcessingAction(false);
    }
  };


  return (
    <>
    <div className="grid gap-6">
        <Card>
        <CardHeader>
            <CardTitle className="font-headline tracking-wider">Generator Tantangan Tenant</CardTitle>
            <CardDescription>
            Tetapkan anggaran hadiah dan rentang tanggal. Chika AI akan membuat tantangan penjualan yang memotivasi antar tenant berdasarkan total pendapatan (omset).
            </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
                <Label htmlFor="budget">Anggaran Hadiah (Rp)</Label>
                <Input
                id="budget"
                type="number"
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
                placeholder="e.g., 500000"
                step="50000"
                />
            </div>
                <div className="space-y-2">
                <Label htmlFor="date">Periode Tantangan</Label>
                <Popover>
                    <PopoverTrigger asChild>
                    <Button
                        id="date"
                        variant={"outline"}
                        className={cn(
                        "w-full justify-start text-left font-normal",
                        !date && "text-muted-foreground"
                        )}
                    >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {date?.from ? (
                        date.to ? (
                            <>
                            {format(date.from, "LLL dd, y")} -{" "}
                            {format(date.to, "LLL dd, y")}
                            </>
                        ) : (
                            format(date.from, "LLL dd, y")
                        )
                        ) : (
                        <span>Pilih tanggal</span>
                        )}
                    </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                        initialFocus
                        mode="range"
                        defaultMonth={date?.from}
                        selected={date}
                        onSelect={setDate}
                        numberOfMonths={2}
                    />
                    </PopoverContent>
                </Popover>
            </div>
            </div>
            <div className="pt-2">
                <AIConfirmationDialog
                featureName="Tantangan Tenant"
                featureDescription="Anda akan membuat satu set tantangan penjualan berjenjang untuk para tenant berdasarkan anggaran dan periode yang Anda tentukan."
                feeSettings={feeSettings}
                onConfirm={handleGenerateChallenges}
                onSuccess={setGeneratedChallenges}
                >
                <Button className="w-full" disabled={!feeSettings}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Buat dengan Chika AI
                </Button>
            </AIConfirmationDialog>
            </div>
        </CardContent>
        </Card>

        {generatedChallenges && (
        <Card>
            <CardHeader>
            <CardTitle className="font-headline tracking-wider">
                Draf Tantangan yang Dihasilkan
            </CardTitle>
            <CardDescription>
                Tantangan untuk periode: <span className='font-semibold'>{generatedChallenges.period}</span>. Simpan untuk mengaktifkannya.
            </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {generatedChallenges.challenges.map((challenge, index) => (
                <Card key={index} className="flex flex-col">
                <CardHeader>
                    <CardTitle className='text-base flex items-center gap-2'>
                    <Trophy className='w-4 h-4 text-primary'/>
                    {challenge.tier}
                    </CardTitle>
                    <CardDescription>{challenge.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex-grow space-y-2">
                    <div>
                        <p className="text-xs text-muted-foreground">Target Omset</p>
                        <p className="font-semibold text-lg">Rp {challenge.target.toLocaleString('id-ID')}</p>
                    </div>
                        <div>
                        <p className="text-xs text-muted-foreground">Hadiah</p>
                        <p className="font-semibold text-accent">{challenge.reward}</p>
                    </div>
                </CardContent>
                </Card>
            ))}
            </CardContent>
            <CardFooter className='flex justify-end p-6'>
                <Button onClick={handleSaveChallenges} disabled={isSaving}>
                    {isSaving ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Simpan & Aktifkan
                </Button>
            </CardFooter>
        </Card>
        )}

       {challengePeriods && challengePeriods.length > 0 && (
         <Card>
            <CardHeader>
                <CardTitle className="font-headline tracking-wider">Daftar Periode Tantangan</CardTitle>
                <CardDescription>Kelola semua periode tantangan yang telah Anda buat.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {challengePeriods.map(period => (
                    <ChallengePeriodCard 
                        key={period.id} 
                        period={period} 
                        onStatusChange={handleStatusChange} 
                        onDelete={() => handleDelete(period)}
                        isProcessing={isProcessingAction}
                    />
                ))}
            </CardContent>
         </Card>
       )}
    </div>

    <AlertDialog open={!!periodToDelete} onOpenChange={() => setPeriodToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Anda yakin ingin menghapus?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini tidak dapat dibatalkan. Periode tantangan <strong>{periodToDelete?.period}</strong> akan dihapus secara permanen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={isProcessingAction}>Ya, Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
