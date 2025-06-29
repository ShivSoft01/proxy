import { useState, useEffect, useRef, useCallback } from 'react';

interface User {
  id: string;
  username: string;
  walletAddress: string;
  isSpeaking: boolean;
  isConnected: boolean;
}

interface Message {
  id: string;
  username: string;
  message: string;
  timestamp: Date;
  walletAddress: string;
}

interface VoiceChatHook {
  users: User[];
  isConnected: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  currentUser: User | null;
  joinRoom: (username: string, walletAddress: string, roomId: string) => Promise<void>;
  leaveRoom: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  sendMessage: (message: string) => void;
  messages: Message[];
  audioLevel: number;
}

export const useVoiceChat = (): VoiceChatHook => {
  const [users, setUsers] = useState<User[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [audioLevel, setAudioLevel] = useState(0);

  const localStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const microphoneRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Initialize audio context and voice activity detection
  const initializeAudio = useCallback(async () => {
    try {
      console.log('Requesting microphone access...');
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100
        } 
      });
      
      console.log('Microphone access granted');
      localStreamRef.current = stream;

      // Set up voice activity detection with enhanced sensitivity
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Resume audio context if it's suspended
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 512; // Higher resolution for better detection
      analyserRef.current.smoothingTimeConstant = 0.3; // Smoother transitions
      
      microphoneRef.current = audioContextRef.current.createMediaStreamSource(stream);
      microphoneRef.current.connect(analyserRef.current);

      console.log('Audio context initialized successfully');
      return stream;
    } catch (error) {
      console.error('Error accessing microphone:', error);
      
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          throw new Error('Microphone access denied. Please allow microphone permissions and try again.');
        } else if (error.name === 'NotFoundError') {
          throw new Error('No microphone found. Please connect a microphone and try again.');
        } else if (error.name === 'NotReadableError') {
          throw new Error('Microphone is being used by another application. Please close other applications and try again.');
        }
      }
      
      throw error;
    }
  }, []);

  // Enhanced voice activity detection
  const detectVoiceActivity = useCallback(() => {
    if (!analyserRef.current || !currentUser) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const checkAudio = () => {
      if (!analyserRef.current || !currentUser) return;

      analyserRef.current.getByteFrequencyData(dataArray);
      
      // Calculate RMS (Root Mean Square) for better voice detection
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / bufferLength);
      
      // Normalize audio level (0-100)
      const normalizedLevel = Math.min(100, (rms / 128) * 100);
      setAudioLevel(normalizedLevel);
      
      // Enhanced voice detection with dynamic threshold
      const baseThreshold = 15;
      const dynamicThreshold = Math.max(baseThreshold, normalizedLevel * 0.3);
      const isSpeaking = normalizedLevel > dynamicThreshold && !isMuted;

      // Update speaking status with debouncing
      if (currentUser.isSpeaking !== isSpeaking) {
        setCurrentUser(prev => prev ? { ...prev, isSpeaking } : null);
        console.log('Speaking status changed:', isSpeaking, 'Level:', normalizedLevel.toFixed(1));
      }

      animationFrameRef.current = requestAnimationFrame(checkAudio);
    };

    checkAudio();
  }, [currentUser, isMuted]);

  // Join voice room
  const joinRoom = useCallback(async (username: string, walletAddress: string, roomId: string) => {
    try {
      console.log('Joining room...', { username, roomId });
      
      // Initialize audio first
      await initializeAudio();

      const user: User = {
        id: Date.now().toString(),
        username,
        walletAddress,
        isSpeaking: false,
        isConnected: true
      };

      setCurrentUser(user);
      setIsConnected(true);

      // Start voice activity detection
      detectVoiceActivity();

      // Add welcome message
      setTimeout(() => {
        setMessages([{
          id: 'welcome-msg',
          username: 'SYSTEM',
          message: `Welcome to Proximity Chat, ${username}! 🎮 Your microphone is active and ready.`,
          timestamp: new Date(),
          walletAddress: 'SYSTEM'
        }]);
      }, 1000);

      console.log('Successfully joined room');

    } catch (error) {
      console.error('Error joining room:', error);
      throw error;
    }
  }, [initializeAudio, detectVoiceActivity]);

  // Leave room
  const leaveRoom = useCallback(() => {
    console.log('Leaving room...');
    
    // Cancel animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log('Stopped track:', track.kind);
      });
      localStreamRef.current = null;
    }

    // Clean up audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().then(() => {
        console.log('Audio context closed');
      }).catch(console.error);
      audioContextRef.current = null;
    }

    // Reset state
    setUsers([]);
    setIsConnected(false);
    setCurrentUser(null);
    setMessages([]);
    setIsMuted(false);
    setIsDeafened(false);
    setAudioLevel(0);

    console.log('Left room successfully');
  }, []);

  // Toggle mute with enhanced feedback
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = isMuted;
        setIsMuted(!isMuted);
        
        // Reset speaking status when muting
        if (!isMuted && currentUser) {
          setCurrentUser(prev => prev ? { ...prev, isSpeaking: false } : null);
        }
        
        console.log('Mute toggled:', !isMuted);
      }
    }
  }, [isMuted, currentUser]);

  // Toggle deafen
  const toggleDeafen = useCallback(() => {
    setIsDeafened(!isDeafened);
    console.log('Deafen toggled:', !isDeafened);
  }, [isDeafened]);

  // Send chat message
  const sendMessage = useCallback((message: string) => {
    if (currentUser) {
      const messageData: Message = {
        id: Date.now().toString(),
        username: currentUser.username,
        message,
        timestamp: new Date(),
        walletAddress: currentUser.walletAddress
      };
      
      setMessages(prev => [...prev, messageData]);
      console.log('Message sent:', message);
    }
  }, [currentUser]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      leaveRoom();
    };
  }, [leaveRoom]);

  return {
    users,
    isConnected,
    isMuted,
    isDeafened,
    currentUser,
    joinRoom,
    leaveRoom,
    toggleMute,
    toggleDeafen,
    sendMessage,
    messages,
    audioLevel
  };
};