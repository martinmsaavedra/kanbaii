'use client';

import { useState, useRef, useCallback } from 'react';
import { Mic, MicOff, X, Check } from 'lucide-react';
import { useToastStore } from '@/stores/toastStore';

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  onClose: () => void;
}

export function VoiceInput({ onTranscript, onClose }: VoiceInputProps) {
  const addToast = useToastStore((s) => s.addToast);
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [editing, setEditing] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<any>(null);

  const startRecording = useCallback(async () => {
    // Try Web Speech API first (works in Chrome)
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let text = '';
        for (let i = 0; i < event.results.length; i++) {
          text += event.results[i][0].transcript;
        }
        setTranscript(text);
      };

      recognition.onerror = (event: any) => {
        if (event.error !== 'aborted') {
          addToast(`Voice error: ${event.error}`, 'error');
        }
        setRecording(false);
      };

      recognition.onend = () => {
        setRecording(false);
        setEditing(true);
      };

      recognitionRef.current = recognition;
      recognition.start();
      setRecording(true);
    } else {
      addToast('Speech recognition not supported in this browser', 'error');
    }
  }, [addToast]);

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    if (mediaRef.current) {
      mediaRef.current.stop();
      mediaRef.current = null;
    }
    setRecording(false);
    if (transcript) setEditing(true);
  };

  const handleConfirm = () => {
    if (transcript.trim()) {
      onTranscript(transcript.trim());
    }
    onClose();
  };

  return (
    <div className="p-4 border border-border rounded-md bg-card animate-fade-in-up">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-text">Voice Input</span>
        <button className="btn-icon" onClick={onClose}><X size={14} /></button>
      </div>

      {!editing ? (
        <div className="flex flex-col items-center gap-3 py-5 relative">
          <button
            className={`w-14 h-14 rounded-full flex items-center justify-center bg-surface border-2 border-border text-text-muted transition-all duration-200 ease-out-expo relative z-[1] hover:border-accent hover:text-accent ${recording ? 'bg-danger-dim border-[rgba(248,113,113,0.3)] text-danger animate-breathe' : ''}`}
            onClick={recording ? stopRecording : startRecording}
          >
            {recording ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
          <div className="text-label text-text-muted font-mono">
            {recording ? 'Listening... click to stop' : 'Click to start recording'}
          </div>
          {recording && (
            <div className="absolute top-1/2 left-1/2 w-20 h-20 rounded-full -translate-x-1/2 -translate-y-1/2 border-2 border-[rgba(248,113,113,0.2)] animate-pulse" />
          )}
          {transcript && !recording && (
            <div className="text-xs text-text-secondary text-center leading-relaxed px-4 py-2 bg-bg rounded-sm border border-border max-h-20 overflow-y-auto w-full">
              {transcript}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <textarea
            className="text-xs leading-relaxed resize-none"
            value={transcript}
            onChange={e => setTranscript(e.target.value)}
            rows={4}
            autoFocus
          />
          <div className="flex justify-end gap-1.5">
            <button className="btn-ghost" onClick={() => { setTranscript(''); setEditing(false); }}>Re-record</button>
            <button className="btn-primary" onClick={handleConfirm} disabled={!transcript.trim()}>
              <Check size={12} /> Use Transcript
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
