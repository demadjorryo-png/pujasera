
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
import { BrainCircuit, Loader, Send, User, Sparkles } from 'lucide-react';
import { AppConsultantInput, AppConsultantOutput } from '@/ai/flows/app-consultant';
import { Input } from '../ui/input';
import { ScrollArea } from '../ui/scroll-area';
import { Avatar, AvatarFallback } from '../ui/avatar';
import ReactMarkdown from 'react-markdown';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/contexts/auth-context';

type Message = {
  id: number;
  sender: 'user' | 'ai';
  text: string;
};

const appConsultantExampleQuestions = [
    "Saya mau buat aplikasi kasir untuk coffee shop.",
    "Bisa bantu saya bikin aplikasi untuk barbershop?",
    "Berapa perkiraan biaya pembuatan aplikasi custom?",
];

type AppConsultantChatDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};


function ChatBody({ messages, isLoading, exampleQuestions, onQuestionClick }: { messages: Message[], isLoading: boolean, exampleQuestions: string[], onQuestionClick: (q:string) => void }) {
    return (
        <div className="space-y-4">
            {messages.map((message) => (
                <div key={message.id} className={`flex items-end gap-2 ${message.sender === 'user' ? 'justify-end' : ''}`}>
                    {message.sender === 'ai' && (
                        <Avatar className='h-8 w-8'>
                            <AvatarFallback className='bg-primary text-primary-foreground'><Sparkles className='h-5 w-5'/></AvatarFallback>
                        </Avatar>
                    )}
                    <div className={`max-w-md rounded-lg p-3 ${message.sender === 'ai' ? 'bg-secondary' : 'bg-primary text-primary-foreground'}`}>
                        <ReactMarkdown className="prose prose-sm dark:prose-invert max-w-none">
                            {message.text}
                        </ReactMarkdown>
                    </div>
                    {message.sender === 'user' && (
                        <Avatar className='h-8 w-8'>
                            <AvatarFallback><User className='h-5 w-5'/></AvatarFallback>
                        </Avatar>
                    )}
                </div>
            ))}
            {isLoading && (
                <div className="flex items-end gap-2">
                    <Avatar className='h-8 w-8'>
                        <AvatarFallback className='bg-primary text-primary-foreground'><Sparkles className='h-5 w-5'/></AvatarFallback>
                    </Avatar>
                    <div className="max-w-xs rounded-lg p-3 bg-secondary">
                        <Loader className="animate-spin" />
                    </div>
                </div>
            )}
            {!isLoading && messages.length === 1 && (
                <div className="pt-4 text-center text-sm">
                    <p className="text-muted-foreground">Atau coba tanya:</p>
                    <div className="mt-2 flex flex-wrap justify-center gap-2">
                    {exampleQuestions.map(q => (
                        <Button key={q} variant="outline" size="sm" onClick={() => onQuestionClick(q)}>{q}</Button>
                    ))}
                    </div>
                </div>
            )}
        </div>
    );
}


export function AppConsultantChatDialog({ open, onOpenChange }: AppConsultantChatDialogProps) {
    const [messages, setMessages] = React.useState<Message[]>([]);
    const [input, setInput] = React.useState('');
    const [isLoading, setIsLoading] = React.useState(false);
    const scrollAreaRef = React.useRef<HTMLDivElement>(null);
    const initialMessage = "Halo, saya Chika, asisten AI. Saya bisa membantu Anda merancang aplikasi baru atau melaporkan kendala teknis. Apa yang bisa saya bantu?";
    const { toast } = useToast();
    
    React.useEffect(() => {
        if (open) {
            if (messages.length === 0) {
                setMessages([{ id: 1, sender: 'ai', text: initialMessage }]);
            }
        } else {
            // Optionally reset state when dialog closes
            // setMessages([]);
            // setInput('');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

     React.useEffect(() => {
        if (scrollAreaRef.current) {
            setTimeout(() => {
                const viewport = scrollAreaRef.current?.querySelector('div[data-radix-scroll-area-viewport]');
                if (viewport) viewport.scrollTop = viewport.scrollHeight;
            }, 100);
        }
    }, [messages]);

    const handleSendMessage = async (question: string) => {
        if (!question.trim() || isLoading) return;
    
        const userMessage: Message = { id: Date.now(), sender: 'user', text: question };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);
    
        try {
            const apiInput: AppConsultantInput = {
                conversationHistory: [...messages, userMessage].map((m) => `${m.sender}: ${m.text}`).join('\n'),
                userInput: question,
            };
    
            const response = await fetch('/api/ai/app-consultant', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(apiInput),
            });
    
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Failed to get response from AI.');
            }
    
            const flowResult: AppConsultantOutput = await response.json();
    
            setMessages((prev) => [...prev, { id: Date.now() + 1, sender: 'ai', text: flowResult.response }]);
    
            if (flowResult.shouldEscalateToAdmin && flowResult.escalationMessage) {
                toast({
                    title: "Mengirim Rangkuman ke Admin",
                    description: "Rangkuman percakapan ini sedang dikirim ke grup admin platform.",
                });
    
                const funcs = getFunctions();
                // Note: The 'sendWhatsapp' callable function is deprecated and may not exist.
                // This call is left for illustrative purposes but might fail.
                const sendWhatsapp = httpsCallable(funcs, 'sendWhatsapp');
                await sendWhatsapp({
                    storeId: "platform", // Special identifier for platform-level actions
                    message: flowResult.escalationMessage,
                    isGroup: true,
                });
            }
    
        } catch (error) {
            console.error("Consultant AI processing error:", error);
            setMessages((prev) => [...prev, { id: Date.now() + 1, sender: 'ai', text: 'Maaf, terjadi kesalahan saat memproses permintaan Anda. Coba lagi.' }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        handleSendMessage(input);
    };
    
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogContent className="sm:max-w-full h-screen flex flex-col sm:rounded-none">
            <DialogHeader>
                <DialogTitle className='font-headline tracking-wider flex items-center gap-2'><BrainCircuit/> Chika AI App Consultant</DialogTitle>
                <DialogDescription>Jelaskan ide aplikasi Anda. Chika akan membantu Anda merangkum kebutuhan proyek.</DialogDescription>
            </DialogHeader>
            <ScrollArea className="flex-grow pr-4 -mr-4" ref={scrollAreaRef}>
                 <ChatBody messages={messages} isLoading={isLoading} exampleQuestions={appConsultantExampleQuestions} onQuestionClick={handleSendMessage} />
            </ScrollArea>
            <DialogFooter>
                <form onSubmit={handleFormSubmit} className="flex w-full items-center gap-2">
                    <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ketik pesan Anda..." disabled={isLoading} />
                    <Button type="submit" disabled={isLoading || !input.trim()}><Send className="h-4 w-4" /></Button>
                </form>
            </DialogFooter>
        </DialogContent>
        </Dialog>
    );
}
