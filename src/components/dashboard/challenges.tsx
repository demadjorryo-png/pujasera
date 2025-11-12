
'use client';

import * as React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader, Sparkles, Trophy, Calendar as CalendarIcon } from 'lucide-react';
import { generateChallenges } from '@/ai/flows/challenge-generator';
import type { ChallengeGeneratorOutput } from '@/ai/flows/challenge-generator';
import { useToast } from '@/hooks/use-toast';
import { DateRange } from 'react-day-picker';
import { addDays, format } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import { useAuth } from '@/contexts/auth-context';
import { deductAiUsageFee } from '@/lib/app-settings';
import type { TransactionFeeSettings } from '@/lib/app-settings';

type ChallengesProps = {
  feeSettings: TransactionFeeSettings;
};

export default function Challenges({ feeSettings }: ChallengesProps) {
  const [budget, setBudget] = React.useState(500000);
  const [date, setDate] = React.useState<DateRange | undefined>({
    from: new Date(),
    to: addDays(new Date(), 7),
  });
  const [isLoading, setIsLoading] = React.useState(false);
  const [generatedChallenges, setGeneratedChallenges] =
    React.useState<ChallengeGeneratorOutput | null>(null);
  const { toast } = useToast();
  const { pradanaTokenBalance, refreshPradanaTokenBalance } = useAuth();


  const handleGenerateChallenges = async () => {
    if (budget <= 0) {
      toast({
        variant: 'destructive',
        title: 'Anggaran Tidak Valid',
        description: 'Silakan masukkan anggaran lebih besar dari nol.',
      });
      return;
    }
    if (!date?.from || !date?.to) {
        toast({
            variant: 'destructive',
            title: 'Tanggal Tidak Valid',
            description: 'Silakan pilih tanggal mulai dan selesai.',
        });
        return;
    }

    try {
      await deductAiUsageFee(pradanaTokenBalance, feeSettings, toast);
    } catch {
      return; // Stop if not enough tokens
    }

    setIsLoading(true);
    setGeneratedChallenges(null);
    try {
      const result = await generateChallenges({ 
          budget,
          startDate: format(date.from, 'yyyy-MM-dd'),
          endDate: format(date.to, 'yyyy-MM-dd'),
       });
      setGeneratedChallenges(result);
      refreshPradanaTokenBalance();
      toast({
        title: 'Tantangan Dibuat!',
        description: `Chika AI telah berhasil membuat tantangan baru untuk periode ${result.period}.`,
      });
    } catch (error) {
      console.error('Error generating challenges:', error);
      toast({
        variant: 'destructive',
        title: 'Gagal Membuat Tantangan',
        description: 'Tidak dapat membuat tantangan. Silakan coba lagi.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-headline tracking-wider">
            Buat Tantangan Karyawan
          </CardTitle>
          <CardDescription>
            Tetapkan anggaran hadiah dan rentang tanggal. Chika AI akan membuat tantangan penjualan
            yang memotivasi berdasarkan total pendapatan (omset) untuk periode tersebut.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-md space-y-4">
             <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="budget">Anggaran Hadiah (Rp)</Label>
                  <Input
                    id="budget"
                    type="number"
                    value={budget}
                    onChange={(e) => setBudget(Number(e.target.value))}
                    placeholder="e.g., 1000000"
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
            <Button
              onClick={handleGenerateChallenges}
              disabled={isLoading}
              className="w-full"
            >
              {isLoading ? (
                <Loader className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Buat dengan Chika AI ({feeSettings.aiUsageFee} Token)
            </Button>
          </div>
        </CardContent>
      </Card>
      {generatedChallenges && (
        <Card>
          <CardHeader>
            <CardTitle className="font-headline tracking-wider">
              Tantangan yang Dihasilkan
            </CardTitle>
            <CardDescription>
              Tantangan aktif untuk periode: <span className='font-semibold'>{generatedChallenges.period}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {generatedChallenges.challenges.map((challenge, index) => (
              <Card key={index} className="flex flex-col">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Trophy className="h-6 w-6 text-primary" />
                    <span>{challenge.tier}</span>
                  </CardTitle>
                  <CardDescription>{challenge.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex-grow">
                  <div className="space-y-2">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        Target Omset
                      </p>
                      <p className="text-xl font-bold">
                        Rp {challenge.target.toLocaleString('id-ID')}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        Hadiah
                      </p>
                      <p className="text-lg font-semibold text-accent">
                        {challenge.reward}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </CardContent>
          <CardFooter>
            <Button>Simpan & Aktifkan Tantangan</Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
