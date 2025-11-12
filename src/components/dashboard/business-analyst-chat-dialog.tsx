
'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { BrainCircuit, Loader, Send, Sparkles, Clock, Hourglass, CheckCircle, MessageSquare, AlertCircle } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { Input } from '../ui/input';
import { ScrollArea } from '../ui/scroll-area';
import { useDashboard } from '@/contexts/dashboard-context';
import ReactMarkdown from 'react-markdown';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../ui/alert-dialog';
import { ProactiveBusinessAnalystOutput } from '@/ai/flows/proactive-business-analyst';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { auth } from '@/lib/firebase';
import { ChikaAnalystOutput } from '@/ai/flows/business-analyst';

// --- Types ---
type Message = { id: number; sender: 'user' | 'ai'; text: string };
type SessionPhase = 'CONFIRMATION' | 'ANALYSING' | 'PRESENTING' | 'CHATTING' | 'SESSION_ENDED';
type BusinessAnalystChatDialogProps = { open: boolean; onOpenChange: (open: boolean) => void; };

// --- Helpers ---
const formatTime = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

// --- Main Component ---
export function BusinessAnalystChatDialog({ open, onOpenChange }: BusinessAnalystChatDialogProps) {
    const { currentUser, activeStore } = useAuth();
    const { feeSettings, products } = useDashboard();
    const { toast } = useToast();

    // --- Dynamic Config ---
    const sessionDurationMinutes = feeSettings?.aiSessionDurationMinutes || 30;
    const sessionDurationSeconds = sessionDurationMinutes * 60;
    const sessionFee = feeSettings?.aiSessionFee || 5;

    // --- State Management ---
    const [phase, setPhase] = React.useState<SessionPhase>('CONFIRMATION');
    const [timeLeft, setTimeLeft] = React.useState(sessionDurationSeconds);
    const [initialAnalysis, setInitialAnalysis] = React.useState<ProactiveBusinessAnalystOutput | null>(null);
    const [analysisError, setAnalysisError] = React.useState<string | null>(null);
    const [messages, setMessages] = React.useState<Message[]>([]);
    const [input, setInput] = React.useState('');
    const [isSendingMessage, setIsSendingMessage] = React.useState(false);

    // --- Effects ---
    React.useEffect(() => { // Session Timer
        if (phase === 'CHATTING' && timeLeft > 0) {
            const timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
            return () => clearInterval(timer);
        } else if (timeLeft <= 0 && phase === 'CHATTING') {
            setPhase('SESSION_ENDED');
        }
    }, [phase, timeLeft]);

    React.useEffect(() => { // Dialog Lifecycle
        if (open) {
            setPhase('CONFIRMATION');
            setTimeLeft(sessionDurationSeconds);
            setInitialAnalysis(null);
            setAnalysisError(null);
            setMessages([]);
            setInput('');
        }
    }, [open, sessionDurationSeconds]);

    // --- API Calls ---
    const runInitialAnalysis = async () => {
        setPhase('ANALYSING');
        setAnalysisError(null);
        try {
            const idToken = await auth.currentUser?.getIdToken(true);
            const response = await fetch('/api/ai/proactive-business-analyst', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                body: JSON.stringify({ activeStore }),
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Failed to get analysis.');
            }
            const result: ProactiveBusinessAnalystOutput = await response.json();
            setInitialAnalysis(result);
            setPhase('PRESENTING');
        } catch (e) {
            setAnalysisError((e as Error).message);
            setPhase('CONFIRMATION'); // Revert to confirmation on error
        }
    };

    const handleSendMessage = async (question: string) => {
        if (!question.trim() || !activeStore) return;

        const newUserMessage: Message = { id: Date.now(), sender: 'user', text: question };
        setMessages((prev) => [...prev, newUserMessage]);
        setInput('');
        setIsSendingMessage(true);

        try {
            const idToken = await auth.currentUser?.getIdToken(true);
            
            const response = await fetch('/api/ai/business-analyst', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                body: JSON.stringify({
                    question,
                    activeStore,
                }),
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Failed to get response from AI.');
            }

            const result: ChikaAnalystOutput = await response.json();
            const newAiMessage: Message = { id: Date.now() + 1, sender: 'ai', text: result.answer };
            setMessages((prev) => [...prev, newAiMessage]);

        } catch (e) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: (e as Error).message,
            });
            // Optional: remove the user's message if the API call fails
            setMessages(prev => prev.filter(m => m.id !== newUserMessage.id));
        } finally {
            setIsSendingMessage(false);
        }
    };


    // --- Event Handlers ---
    const startChatting = (topic?: string) => {
        if (!initialAnalysis) return;
        const firstMessage = topic || "Baik, mari kita mulai diskusinya.";
        const userMessage: Message = { id: Date.now(), sender: 'user', text: firstMessage };
        setMessages([
            { id: Date.now() - 1, sender: 'ai', text: initialAnalysis.openingStatement },
        ]);
        setPhase('CHATTING');
        if (topic) {
            handleSendMessage(topic);
        }
    };

    const extendSession = () => {
        setTimeLeft(sessionDurationSeconds);
        setPhase('CHATTING');
    };

    // --- Render Logic ---
    if (!open) return null;

    const renderConfirmation = () => (
        <DialogContent aria-describedby="confirmation-description">
            <DialogHeader>
                <DialogTitle className='font-headline tracking-wider flex items-center gap-2'><Sparkles className='text-primary'/> Konfirmasi Sesi Konsultasi</DialogTitle>
            </DialogHeader>
            {analysisError && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Gagal Memulai Analisis</AlertTitle>
                    <AlertDescription>{analysisError}</AlertDescription>
                </Alert>
            )}
            <div className='py-4 space-y-4'>
                <p id="confirmation-description">Chika AI akan menganalisis data penjualan Anda secara proaktif untuk menemukan peluang dan memberikan saran untuk meningkatkan bisnis.</p>
                <div className='border rounded-lg p-4 space-y-2'>
                    <div className='flex justify-between items-center'><span className='text-muted-foreground flex items-center gap-2'><Hourglass className='h-4 w-4'/> Durasi Sesi</span><span className='font-bold'>{sessionDurationMinutes} Menit</span></div>
                    <div className='flex justify-between items-center'><span className='text-muted-foreground flex items-center gap-2'><Sparkles className='h-4 w-4'/> Biaya per Pertanyaan</span><span className='font-bold text-primary'>{sessionFee} Token</span></div>
                </div>
            </div>
            <DialogFooter>
                <Button variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
                <Button onClick={runInitialAnalysis}><CheckCircle className='mr-2 h-4 w-4'/> Ya, Mulai Analisis</Button>
            </DialogFooter>
        </DialogContent>
    );

    const renderAnalysing = () => (
        <DialogContent aria-describedby="analysing-description">
            <div className="flex flex-col items-center justify-center h-48 gap-4">
                <Loader className="h-10 w-10 animate-spin text-primary" />
                <p id="analysing-description" className="text-lg">Chika sedang menganalisis data Anda...</p>
                <span className="text-sm text-muted-foreground">Ini mungkin memakan waktu beberapa saat.</span>
            </div>
        </DialogContent>
    );

    const renderPresenting = () => (
        <DialogContent className="sm:max-w-lg" aria-describedby="presenting-description">
            <DialogHeader>
                <DialogTitle className='font-headline tracking-wider'>Hasil Analisis Awal</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-4">
                <div className="p-4 bg-secondary rounded-lg">
                    <p id="presenting-description">{initialAnalysis?.openingStatement}</p>
                </div>
                <p className="text-sm font-semibold">Area mana yang ingin kita diskusikan?</p>
                <div className="flex flex-col gap-2">
                    {initialAnalysis?.suggestedTopics.map(topic => (
                        <Button key={topic} variant="outline" onClick={() => startChatting(topic)}>{topic}</Button>
                    ))}
                </div>
                 <Button variant="link" size="sm" onClick={() => startChatting()}>Atau, mulai dengan pertanyaan Anda sendiri.</Button>
            </div>
        </DialogContent>
    );

    const renderChatting = () => (
        <>
            <DialogContent className="sm:max-w-lg h-screen sm:h-[80vh] flex flex-col sm:rounded-lg">
                <DialogHeader>
                    <DialogTitle className='font-headline tracking-wider flex items-center gap-2'><BrainCircuit/> Sesi Konsultasi AI</DialogTitle>
                    <div className='flex justify-between items-center'>
                        <DialogDescription>Sisa Waktu Sesi:</DialogDescription>
                        <div className={`flex items-center gap-2 font-mono text-sm px-2 py-1 rounded-md ${timeLeft < 60 ? 'text-destructive font-bold' : ''}`}>
                            <Clock className="h-4 w-4" />{formatTime(timeLeft)}
                        </div>
                    </div>
                </DialogHeader>
                <ScrollArea className="flex-grow pr-4 -mr-4">
                    <div className="flex flex-col gap-4">
                        {messages.map((message) => (
                            <div key={message.id} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`p-3 rounded-lg max-w-[80%] ${message.sender === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                                    <ReactMarkdown className="prose prose-sm dark:prose-invert max-w-none">{message.text}</ReactMarkdown>
                                </div>
                            </div>
                        ))}
                        {isSendingMessage && (
                           <div className='flex justify-start'>
                                <div className='p-3 rounded-lg bg-muted flex items-center gap-2'>
                                    <Loader className="h-4 w-4 animate-spin" />
                                    <span>Chika sedang berpikir...</span>
                                </div>
                           </div>
                        )}
                    </div>
                </ScrollArea>
                <DialogFooter>
                    <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(input); }} className="flex w-full items-center gap-2">
                        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ketik pesan Anda..." disabled={isSendingMessage || timeLeft === 0} />
                        <Button type="submit" disabled={isSendingMessage || !input.trim() || timeLeft === 0}><Send className="h-4 w-4" /></Button>
                    </form>
                </DialogFooter>
            </DialogContent>
            <AlertDialog open={phase === 'SESSION_ENDED'}>
                <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Waktu Sesi Habis</AlertDialogTitle><AlertDialogDescription>Waktu sesi konsultasi Anda telah berakhir. Apakah Anda ingin memulai sesi baru ({sessionDurationMinutes} menit) lagi?</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel onClick={() => onOpenChange(false)}>Tutup</AlertDialogCancel><AlertDialogAction onClick={extendSession}>Ya, Mulai Sesi Baru</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {
                {
                    'CONFIRMATION': renderConfirmation(),
                    'ANALYSING': renderAnalysing(),
                    'PRESENTING': renderPresenting(),
                    'CHATTING': renderChatting(),
                    'SESSION_ENDED': renderChatting(),
                }[phase]
            }
        </Dialog>
    );
}
