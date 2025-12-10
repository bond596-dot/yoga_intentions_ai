'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Send, Volume2, User, Bot } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
  id: string;
  isFloating?: boolean;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'system',
      content:
        'You are an inspired, confident yoga instructor. You want to share meaningful, insightful, and inspiring intentions at the start of class that can also serve as a theme throughout the entire class. You do not want to offend. You want to be a calm presence with these intentions, and help people optimize their yoga practice and overall health.',
      id: 'system-prompt',
    },
  ]);
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [continuousListening, setContinuousListening] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const continuousListeningRef = useRef(continuousListening);
  const messagesRef = useRef(messages);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Keep refs in sync with state
  useEffect(() => {
    continuousListeningRef.current = continuousListening;
  }, [continuousListening]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Handle auto-submit from speech recognition with fresh state
  const handleAutoSubmit = async (text: string) => {
    if (!text.trim() || isLoading) return;

    console.log('handleAutoSubmit called with:', text);
    console.log('Current continuous listening:', continuousListeningRef.current);

    const userMessage: Message = {
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
      id: `user-${Date.now()}`,
      isFloating: true,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messagesRef.current, userMessage].map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const assistantMessage = await response.json();

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: assistantMessage.content,
          timestamp: Date.now(),
          id: `assistant-${Date.now()}`,
        },
      ]);

      // ALWAYS auto-speak when called from speech recognition
      console.log('Auto-speaking response:', assistantMessage.content);
      await speakText(assistantMessage.content);
    } catch (error) {
      console.error('Error getting completion:', error);
      const errorMsg = 'Sorry, I encountered an error. Please try again.';
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: errorMsg,
          timestamp: Date.now(),
          id: `error-${Date.now()}`,
        },
      ]);

      await speakText(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  // Initialize Speech Recognition once on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
          console.log('Speech recognition started');
          setIsListening(true);
        };

        recognition.onresult = (event: any) => {
          console.log('Speech result received:', event.results);
          let interimTranscript = '';
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            console.log(`Result ${i}: ${transcript}, isFinal: ${event.results[i].isFinal}`);
            if (event.results[i].isFinal) {
              finalTranscript += transcript + ' ';
            } else {
              interimTranscript += transcript;
            }
          }

          // Show live transcription in input box
          if (interimTranscript) {
            console.log('Setting interim transcript:', interimTranscript);
            setInput(interimTranscript);
          }

          // When we get a final result (after silence), auto-submit
          if (finalTranscript) {
            const fullText = finalTranscript.trim();
            console.log('Final transcript received:', fullText);
            console.log('Continuous listening ref:', continuousListeningRef.current);
            if (fullText && continuousListeningRef.current) {
              setInput(fullText);
              // Stop listening while we process
              recognition.stop();
              // Auto-submit after a brief delay
              setTimeout(() => {
                console.log('Auto-submitting message:', fullText);
                handleAutoSubmit(fullText);
              }, 500);
            }
          }
        };

        recognition.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
        };

        recognition.onend = () => {
          console.log('Speech recognition ended');
          setIsListening(false);
        };

        recognitionRef.current = recognition;
        console.log('Speech recognition initialized');
      } else {
        console.error('Speech Recognition not supported in this browser');
        alert('Speech Recognition is not supported in this browser. Please use Chrome or Edge.');
      }
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.log('Error stopping recognition on cleanup');
        }
      }
    };
  }, []);

  const startSpeechRecognition = () => {
    if (recognitionRef.current && !isListening) {
      try {
        console.log('Starting speech recognition...');
        recognitionRef.current.start();
      } catch (e) {
        console.log('Recognition already started or error:', e);
      }
    }
  };

  const stopSpeechRecognition = () => {
    if (recognitionRef.current) {
      try {
        console.log('Stopping speech recognition...');
        recognitionRef.current.stop();
        setIsListening(false);
      } catch (e) {
        console.log('Error stopping recognition:', e);
      }
    }
  };

  // Handle continuous listening restart after speech ends or AI finishes speaking
  useEffect(() => {
    if (continuousListening && !isSpeaking && !isListening && !isLoading) {
      console.log('Restarting speech recognition for continuous mode');
      const timer = setTimeout(() => {
        startSpeechRecognition();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [continuousListening, isSpeaking, isListening, isLoading]);

  const startRecording = async () => {
    try {
      // If we already have a stream in continuous mode, just start a new recording
      if (continuousListening && streamRef.current) {
        const mediaRecorder = new MediaRecorder(streamRef.current);
        mediaRecorderRef.current = mediaRecorder;
        chunksRef.current = [];

        mediaRecorder.ondataavailable = (e) => {
          chunksRef.current.push(e.data);
        };

        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
          await transcribeAudio(audioBlob);

          // In continuous mode, restart recording after transcription (unless speaking)
          if (continuousListening && !isSpeaking) {
            setTimeout(() => startRecording(), 100);
          }
        };

        mediaRecorder.start();
        setIsRecording(true);
        return;
      }

      // Initial setup - get the stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await transcribeAudio(audioBlob);

        // In continuous mode, restart recording after transcription (unless speaking)
        if (continuousListening && !isSpeaking) {
          setTimeout(() => startRecording(), 100);
        } else if (!continuousListening) {
          // Clean up stream if not in continuous mode
          stream.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const stopMicrophone = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    try {
      setIsLoading(true);
      const formData = new FormData();
      const file = new File([audioBlob], 'audio.webm', { type: 'audio/webm' });
      formData.append('file', file);

      const response = await fetch('/api/speech', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to transcribe audio');
      }

      const data = await response.json();
      setInput(data.text);
    } catch (error: any) {
      console.error('Error transcribing audio:', error);
      alert(error.message || 'Failed to transcribe audio');
    } finally {
      setIsLoading(false);
    }
  };

  const speakText = async (text: string) => {
    try {
      console.log('Sending text to speech API:', text);

      // Stop speech recognition while AI is speaking
      if (isListening) {
        stopSpeechRecognition();
      }
      // Also stop recording if using mic button
      if (isRecording) {
        stopRecording();
      }
      setIsSpeaking(true);

      const response = await fetch('/api/speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Error response from speech API:', response.status, errorData);
        throw new Error(errorData.error || `Failed to generate speech: ${response.status}`);
      }

      const contentType = response.headers.get('Content-Type');
      console.log('Response content type:', contentType);

      if (!contentType || !contentType.includes('audio/mpeg')) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Invalid response format:', errorData);
        throw new Error(errorData.error || 'Response was not audio format');
      }

      const audioBlob = await response.blob();

      if (audioBlob.size === 0) {
        console.error('Empty audio blob received');
        throw new Error('Empty audio received from API');
      }

      console.log('Audio blob received, size:', audioBlob.size);
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onerror = (e) => {
        console.error('Error playing audio:', e);
        setIsSpeaking(false);
        // Resume speech recognition if in continuous mode
        if (continuousListeningRef.current) {
          console.log('Resuming speech recognition after audio error');
          setTimeout(() => startSpeechRecognition(), 100);
        }
      };

      audio.onended = () => {
        console.log('Audio playback ended');
        setIsSpeaking(false);
        // Resume speech recognition after AI finishes speaking
        if (continuousListeningRef.current) {
          console.log('Resuming speech recognition after audio ended');
          setTimeout(() => startSpeechRecognition(), 500);
        }
      };

      console.log('Starting audio playback...');
      await audio.play();
      console.log('Audio playback started');
    } catch (error: any) {
      console.error('Error generating speech:', error);
      setIsSpeaking(false);
      // Resume speech recognition if in continuous mode even on error
      if (continuousListeningRef.current) {
        setTimeout(() => startSpeechRecognition(), 100);
      }
      alert(error.message || 'Failed to generate speech');
    }
  };

  const submitMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
      id: `user-${Date.now()}`,
      isFloating: true,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const assistantMessage = await response.json();

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: assistantMessage.content,
          timestamp: Date.now(),
          id: `assistant-${Date.now()}`,
        },
      ]);

      // Auto-speak the response in continuous listening mode
      console.log('Continuous listening:', continuousListening, 'Content:', assistantMessage.content);
      if (continuousListening) {
        console.log('Auto-speaking the response...');
        await speakText(assistantMessage.content);
      }
    } catch (error) {
      console.error('Error getting completion:', error);
      const errorMsg = 'Sorry, I encountered an error. Please try again.';
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: errorMsg,
          timestamp: Date.now(),
          id: `error-${Date.now()}`,
        },
      ]);

      // Also speak error message in continuous mode
      if (continuousListening) {
        await speakText(errorMsg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitMessage(input);
  };

  return (
    <div
      className="
        min-h-screen 
        bg-gradient-to-br 
        from-slate-950 
        via-slate-900 
        to-emerald-900 
        text-emerald-50 
        flex 
        justify-center 
        px-4 
        py-8
        font-sans
      "
    >
      <div className="container mx-auto max-w-3xl px-3 py-6">
        <div className="rounded-3xl bg-slate-950/80 border border-emerald-800/50 shadow-xl shadow-black/40 backdrop-blur-md">
          <div className="h-[700px] flex flex-col">
            {/* HEADER */}
            <div className="p-5 border-b border-emerald-800/40">
              <div className="flex justify-between items-center">
                <div>
                  <h1 className="text-3xl font-semibold text-emerald-50">
                    Yoga Intention Studio
                  </h1>
                  <p className="mt-2 text-sm text-emerald-100/80 max-w-xl">
                    Ask for an intention to anchor your practice. You can request
                    a theme like surrender, grounding, empowerment, or share how
                    you’re feeling — I’ll offer a line to move with.
                  </p>
                </div>

                <div className="flex items-center space-x-3">
                  <label
                    className={`flex items-center space-x-2 ${
                      isSpeaking ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                    }`}
                  >
                    <span className="text-[10px] tracking-widest text-emerald-100/80 font-mono uppercase">
                      Continuous Listen
                    </span>
                    <button
                      onClick={async () => {
                        if (isSpeaking) return;
                        const newValue = !continuousListening;
                        if (newValue) {
                          try {
                            await navigator.mediaDevices.getUserMedia({ audio: true });
                            console.log('Microphone permission granted');
                            setContinuousListening(true);
                            startSpeechRecognition();
                          } catch (error) {
                            console.error('Microphone permission denied:', error);
                            alert('Please allow microphone access to use speech recognition');
                          }
                        } else {
                          setContinuousListening(false);
                          stopSpeechRecognition();
                          setInput('');
                        }
                      }}
                      disabled={isSpeaking}
                      className={`rounded-full border border-emerald-500 px-3 py-1 text-xs font-mono transition-colors ${
                        continuousListening
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-slate-900 text-emerald-100'
                      } ${
                        isSpeaking
                          ? 'opacity-50 cursor-not-allowed'
                          : 'hover:bg-emerald-400 hover:text-slate-950'
                      }`}
                    >
                      {continuousListening ? 'ON' : 'OFF'}
                    </button>
                  </label>

                  {isListening && !isSpeaking && (
                    <span className="text-[10px] text-emerald-100/90 flex items-center space-x-1 border border-emerald-500/70 px-2 py-1 rounded-full font-mono bg-slate-900/80">
                      <Mic size={12} className="animate-pulse" />
                      <span>LISTENING</span>
                    </span>
                  )}

                  {isSpeaking && (
                    <span className="text-[10px] text-emerald-50 bg-emerald-600/90 flex items-center space-x-1 border border-emerald-400 px-2 py-1 rounded-full font-mono">
                      <Volume2 size={12} className="animate-pulse" />
                      <span>SPEAKING</span>
                    </span>
                  )}

                  {continuousListening && !isListening && !isSpeaking && (
                    <span className="text-[10px] text-emerald-100/80 border border-emerald-500/60 px-2 py-1 rounded-full font-mono bg-slate-900/80">
                      PAUSED
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* MESSAGES */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-950/40">
              {messages.slice(1).map((message) => {
                const isUser = message.role === 'user';
                const alignment = isUser ? 'justify-end' : 'justify-start';
                const bubbleAlign = isUser ? 'items-end' : 'items-start';
                const bubbleColors = isUser
                  ? 'bg-emerald-700/90 text-emerald-50 border border-emerald-400/80'
                  : 'bg-slate-900/90 text-emerald-50 border border-emerald-700/60';

                return (
                  <div
                    key={message.id}
                    className={`flex items-start space-x-2 ${alignment}`}
                  >
                    {message.role === 'assistant' && (
                      <div className="w-8 h-8 rounded-full border border-emerald-500/70 bg-slate-900/90 flex items-center justify-center flex-shrink-0">
                        <Bot size={18} className="text-emerald-200" />
                      </div>
                    )}

                    <div
                      className={`flex flex-col max-w-[70%] ${bubbleAlign}`}
                      style={{ fontFamily: '"Times New Roman", Times, serif' }}
                    >
                      <div
                        className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${bubbleColors}`}
                      >
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      </div>

                      {message.role === 'assistant' && (
                        <button
                          onClick={() => speakText(message.content)}
                          className="mt-1 text-[11px] text-emerald-200 hover:text-emerald-100 hover:bg-slate-900/80 transition-colors border border-emerald-600/70 px-2 py-1 rounded-full bg-slate-950/80 font-mono"
                          aria-label="Text to speech"
                        >
                          <div className="flex items-center space-x-1">
                            <Volume2 size={12} />
                            <span>PLAY</span>
                          </div>
                        </button>
                      )}

                      {message.timestamp && (
                        <span className="text-[10px] text-emerald-300/70 mt-1 font-mono">
                          {new Date(message.timestamp).toLocaleTimeString()}
                        </span>
                      )}
                    </div>

                    {isUser && (
                      <div className="w-8 h-8 rounded-full border border-emerald-500/70 bg-emerald-700/80 flex items-center justify-center flex-shrink-0">
                        <User size={18} className="text-emerald-50" />
                      </div>
                    )}
                  </div>
                );
              })}

              {isLoading && (
                <div className="flex justify-start items-center space-x-2">
                  <div className="w-8 h-8 rounded-full border border-emerald-500/70 bg-slate-900/90 flex items-center justify-center">
                    <Bot size={18} className="text-emerald-200" />
                  </div>
                  <div className="bg-slate-900/90 border border-emerald-700/60 rounded-2xl px-4 py-3">
                    <div className="flex space-x-2">
                      <div
                        className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce"
                        style={{ animationDelay: '0ms' }}
                      ></div>
                      <div
                        className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce"
                        style={{ animationDelay: '150ms' }}
                      ></div>
                      <div
                        className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce"
                        style={{ animationDelay: '300ms' }}
                      ></div>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* INPUT AREA */}
            <div className="p-4 bg-slate-950/80 border-t border-emerald-800/60">
              <form onSubmit={handleSubmit} className="flex items-center space-x-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    isListening
                      ? '>>> LISTENING… speak now'
                      : 'Share how you feel or ask for an intention...'
                  }
                  className={`flex-1 rounded-2xl border border-emerald-700/70 bg-slate-900/80 px-4 py-3 text-sm text-emerald-50 placeholder:text-emerald-200/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/80 transition-all ${
                    isListening ? 'ring-2 ring-emerald-400/80 font-mono' : ''
                  }`}
                  style={{
                    fontFamily: isListening
                      ? 'monospace'
                      : '"Times New Roman", Times, serif',
                  }}
                  disabled={isLoading}
                  readOnly={isListening}
                />

                <button
                  type="button"
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`p-2 rounded-2xl border border-emerald-600/80 transition-colors ${
                    isRecording
                      ? 'bg-emerald-600 text-slate-950 animate-pulse'
                      : 'bg-slate-900 text-emerald-100 hover:bg-emerald-600 hover:text-slate-950'
                  }`}
                  disabled={isLoading || continuousListening}
                  title={
                    continuousListening
                      ? 'Mic is auto-managed in continuous mode'
                      : 'Push to talk'
                  }
                >
                  {isRecording ? <Square size={18} /> : <Mic size={18} />}
                </button>

                <button
                  type="submit"
                  className="p-2 rounded-2xl bg-emerald-500 text-slate-950 border border-emerald-400 hover:bg-emerald-400 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!input.trim() || isLoading}
                >
                  <Send size={18} />
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
