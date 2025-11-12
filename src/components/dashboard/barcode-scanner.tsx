'use client';

import * as React from 'react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CameraOff } from 'lucide-react';
import jsqr from 'jsqr';
import 'webrtc-adapter';

type BarcodeScannerProps = {
  onScan: (data: string) => void;
};

export function BarcodeScanner({ onScan }: BarcodeScannerProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [hasCameraPermission, setHasCameraPermission] = React.useState<boolean | null>(null);
  const { toast } = useToast();

  React.useEffect(() => {
    let stream: MediaStream | null = null;
    let animationFrameId: number;

    const getCameraPermission = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        setHasCameraPermission(true);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        animationFrameId = requestAnimationFrame(tick);
      } catch (error) {
        console.error('Error accessing camera:', error);
        setHasCameraPermission(false);
        toast({
          variant: 'destructive',
          title: 'Camera Access Denied',
          description:
            'Please enable camera permissions in your browser settings.',
        });
      }
    };

    const tick = () => {
      if (
        videoRef.current &&
        videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA &&
        canvasRef.current
      ) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          canvas.height = video.videoHeight;
          canvas.width = video.videoWidth;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsqr(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert',
          });

          if (code) {
            onScan(code.data);
            return; // Stop scanning once a code is found
          }
        }
      }
      animationFrameId = requestAnimationFrame(tick);
    };

    getCameraPermission();

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [onScan, toast]);

  return (
    <div className="relative w-full">
      <video
        ref={videoRef}
        className="w-full aspect-video rounded-md"
        autoPlay
        muted
        playsInline // Important for iOS
      />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-3/4 h-1/2 border-4 border-primary/50 rounded-lg shadow-inner-lg" />
      </div>
      {hasCameraPermission === false && (
        <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-md">
            <Alert variant="destructive" className="w-auto">
                <CameraOff className="h-4 w-4" />
                <AlertTitle>Camera Access Required</AlertTitle>
                <AlertDescription>
                    Please allow camera access to use this feature.
                </AlertDescription>
            </Alert>
        </div>
      )}
    </div>
  );
}
