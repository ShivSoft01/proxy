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

interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'join-room' | 'leave-room' | 'user-joined' | 'user-left';
  roomId: string;
  userId: string;
  username: string;
  walletAddress: string;
  data?: any;
  targetUserId?: string;
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
  connectionError: string | null;
}

// STUN servers for NAT traversal
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' }
];

export const useWebRTCVoiceChat = (): VoiceChatHook => {
  const [users, setUsers] = useState<User[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [audioLevel, setAudioLevel] = useState(0);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const signalingSocketRef = useRef<WebSocket | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteAudioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const roomIdRef = useRef<string | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectionStateRef = useRef<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const reconnectAttemptsRef = useRef<number>(0);
  const maxReconnectAttempts = 5;

  // Get signaling server URL
  const getSignalingUrl = useCallback(() => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) {
      throw new Error('VITE_SUPABASE_URL environment variable is not set');
    }
    
    // Convert HTTP(S) URL to WebSocket URL for Supabase Edge Functions
    const wsUrl = supabaseUrl
      .replace('https://', 'wss://')
      .replace('http://', 'ws://') + '/functions/v1/voice-signaling';
    
    return wsUrl;
  }, []);

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

      // Set up voice activity detection
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 512;
      analyserRef.current.smoothingTimeConstant = 0.3;
      
      const microphoneSource = audioContextRef.current.createMediaStreamSource(stream);
      microphoneSource.connect(analyserRef.current);

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

  // Voice activity detection
  const detectVoiceActivity = useCallback(() => {
    if (!analyserRef.current || !currentUser) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const checkAudio = () => {
      if (!analyserRef.current || !currentUser) return;

      analyserRef.current.getByteFrequencyData(dataArray);
      
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / bufferLength);
      const normalizedLevel = Math.min(100, (rms / 128) * 100);
      setAudioLevel(normalizedLevel);
      
      const baseThreshold = 15;
      const isSpeaking = normalizedLevel > baseThreshold && !isMuted;

      if (currentUser.isSpeaking !== isSpeaking) {
        setCurrentUser(prev => prev ? { ...prev, isSpeaking } : null);
      }

      animationFrameRef.current = requestAnimationFrame(checkAudio);
    };

    checkAudio();
  }, [currentUser, isMuted]);

  // Create peer connection
  const createPeerConnection = useCallback((userId: string): RTCPeerConnection => {
    console.log('Creating peer connection for user:', userId);
    
    const peerConnection = new RTCPeerConnection({ 
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 10
    });

    // Add local stream to peer connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        console.log('Adding track to peer connection:', track.kind);
        peerConnection.addTrack(track, localStreamRef.current!);
      });
    }

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      console.log('Received remote stream from user:', userId);
      const [remoteStream] = event.streams;
      
      // Create audio element for remote stream
      let audioElement = remoteAudioElementsRef.current.get(userId);
      if (!audioElement) {
        audioElement = new Audio();
        audioElement.autoplay = true;
        audioElement.volume = isDeafened ? 0 : 1;
        remoteAudioElementsRef.current.set(userId, audioElement);
      }
      
      audioElement.srcObject = remoteStream;
      audioElement.play().catch(error => {
        console.error('Error playing remote audio:', error);
      });

      // Update user speaking status based on audio level
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(remoteStream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      const checkRemoteAudio = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const isSpeaking = average > 10;

        setUsers(prev => prev.map(user => 
          user.id === userId ? { ...user, isSpeaking } : user
        ));

        if (remoteAudioElementsRef.current.has(userId)) {
          requestAnimationFrame(checkRemoteAudio);
        }
      };
      
      checkRemoteAudio();
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && signalingSocketRef.current && signalingSocketRef.current.readyState === WebSocket.OPEN) {
        const message: SignalingMessage = {
          type: 'ice-candidate',
          roomId: roomIdRef.current!,
          userId: currentUser!.id,
          username: currentUser!.username,
          walletAddress: currentUser!.walletAddress,
          targetUserId: userId,
          data: event.candidate
        };
        signalingSocketRef.current.send(JSON.stringify(message));
      }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      console.log(`Peer connection state with ${userId}:`, peerConnection.connectionState);
      
      if (peerConnection.connectionState === 'connected') {
        setUsers(prev => prev.map(user => 
          user.id === userId ? { ...user, isConnected: true } : user
        ));
      } else if (peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'failed') {
        setUsers(prev => prev.map(user => 
          user.id === userId ? { ...user, isConnected: false } : user
        ));
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      console.log(`ICE connection state with ${userId}:`, peerConnection.iceConnectionState);
    };

    return peerConnection;
  }, [currentUser, isDeafened]);

  // Handle signaling messages
  const handleSignalingMessage = useCallback(async (message: SignalingMessage) => {
    console.log('Handling signaling message:', message.type, 'from:', message.username);

    try {
      switch (message.type) {
        case 'user-joined':
          if (message.userId !== currentUser?.id) {
            console.log('User joined:', message.username);
            
            // Add user to list
            setUsers(prev => {
              const exists = prev.find(u => u.id === message.userId);
              if (!exists) {
                return [...prev, {
                  id: message.userId,
                  username: message.username,
                  walletAddress: message.walletAddress,
                  isSpeaking: false,
                  isConnected: false
                }];
              }
              return prev;
            });

            // Create peer connection and send offer
            const peerConnection = createPeerConnection(message.userId);
            peerConnectionsRef.current.set(message.userId, peerConnection);

            const offer = await peerConnection.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: false
            });
            await peerConnection.setLocalDescription(offer);

            const offerMessage: SignalingMessage = {
              type: 'offer',
              roomId: roomIdRef.current!,
              userId: currentUser!.id,
              username: currentUser!.username,
              walletAddress: currentUser!.walletAddress,
              targetUserId: message.userId,
              data: offer
            };
            
            if (signalingSocketRef.current && signalingSocketRef.current.readyState === WebSocket.OPEN) {
              signalingSocketRef.current.send(JSON.stringify(offerMessage));
            }
          }
          break;

        case 'user-left':
          console.log('User left:', message.userId);
          
          // Remove user from list
          setUsers(prev => prev.filter(u => u.id !== message.userId));
          
          // Clean up peer connection
          const peerConnection = peerConnectionsRef.current.get(message.userId);
          if (peerConnection) {
            peerConnection.close();
            peerConnectionsRef.current.delete(message.userId);
          }
          
          // Clean up audio element
          const audioElement = remoteAudioElementsRef.current.get(message.userId);
          if (audioElement) {
            audioElement.pause();
            audioElement.srcObject = null;
            remoteAudioElementsRef.current.delete(message.userId);
          }
          break;

        case 'offer':
          if (message.userId !== currentUser?.id && message.targetUserId === currentUser?.id) {
            console.log('Received offer from:', message.username);
            
            const peerConnection = createPeerConnection(message.userId);
            peerConnectionsRef.current.set(message.userId, peerConnection);

            await peerConnection.setRemoteDescription(new RTCSessionDescription(message.data));
            
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);

            const answerMessage: SignalingMessage = {
              type: 'answer',
              roomId: roomIdRef.current!,
              userId: currentUser!.id,
              username: currentUser!.username,
              walletAddress: currentUser!.walletAddress,
              targetUserId: message.userId,
              data: answer
            };
            
            if (signalingSocketRef.current && signalingSocketRef.current.readyState === WebSocket.OPEN) {
              signalingSocketRef.current.send(JSON.stringify(answerMessage));
            }
          }
          break;

        case 'answer':
          if (message.userId !== currentUser?.id && message.targetUserId === currentUser?.id) {
            console.log('Received answer from:', message.username);
            
            const peerConnection = peerConnectionsRef.current.get(message.userId);
            if (peerConnection) {
              await peerConnection.setRemoteDescription(new RTCSessionDescription(message.data));
            }
          }
          break;

        case 'ice-candidate':
          if (message.userId !== currentUser?.id && message.targetUserId === currentUser?.id) {
            const peerConnection = peerConnectionsRef.current.get(message.userId);
            if (peerConnection && message.data) {
              await peerConnection.addIceCandidate(new RTCIceCandidate(message.data));
            }
          }
          break;
      }
    } catch (error) {
      console.error('Error handling signaling message:', error);
    }
  }, [currentUser, createPeerConnection]);

  // Connect to signaling server with reconnection logic
  const connectToSignalingServer = useCallback(() => {
    if (connectionStateRef.current === 'connecting' || connectionStateRef.current === 'connected') {
      return;
    }

    // Check if we've exceeded max reconnection attempts
    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      setConnectionError('Failed to connect to voice server after multiple attempts. Please check your internet connection and try again.');
      return;
    }

    try {
      connectionStateRef.current = 'connecting';
      setConnectionError(null);
      
      const wsUrl = getSignalingUrl();
      console.log('Connecting to signaling server:', wsUrl);
      
      const socket = new WebSocket(wsUrl);

      // Set a connection timeout
      const connectionTimeout = setTimeout(() => {
        if (socket.readyState === WebSocket.CONNECTING) {
          socket.close();
          console.error('WebSocket connection timeout');
          setConnectionError('Connection timeout. The voice server may be unavailable.');
        }
      }, 10000); // 10 second timeout

      socket.onopen = () => {
        console.log('Connected to signaling server');
        connectionStateRef.current = 'connected';
        signalingSocketRef.current = socket;
        reconnectAttemptsRef.current = 0; // Reset reconnection attempts on successful connection
        setConnectionError(null);
        
        clearTimeout(connectionTimeout);
        
        // Clear any reconnection timeout
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }

        // Join room if we have current user info
        if (currentUser && roomIdRef.current) {
          const joinMessage: SignalingMessage = {
            type: 'join-room',
            roomId: roomIdRef.current,
            userId: currentUser.id,
            username: currentUser.username,
            walletAddress: currentUser.walletAddress
          };
          socket.send(JSON.stringify(joinMessage));
        }
      };

      socket.onmessage = (event) => {
        try {
          const message: SignalingMessage = JSON.parse(event.data);
          handleSignalingMessage(message);
        } catch (error) {
          console.error('Error parsing signaling message:', error);
        }
      };

      socket.onclose = (event) => {
        console.log('Signaling server connection closed:', event.code, event.reason);
        connectionStateRef.current = 'disconnected';
        signalingSocketRef.current = null;
        clearTimeout(connectionTimeout);
        
        // Only attempt to reconnect if we were previously connected and have user info
        if (currentUser && roomIdRef.current && !reconnectTimeoutRef.current && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current - 1), 10000); // Exponential backoff, max 10s
          console.log(`Attempting to reconnect in ${delay}ms... (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);
          
          setConnectionError(`Connection lost. Reconnecting... (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectTimeoutRef.current = null;
            connectToSignalingServer();
          }, delay);
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          setConnectionError('Failed to reconnect to voice server. Please refresh the page and try again.');
        }
      };

      socket.onerror = (error) => {
        console.error('Signaling server error:', error);
        connectionStateRef.current = 'disconnected';
        clearTimeout(connectionTimeout);
        
        // Set a more user-friendly error message
        if (reconnectAttemptsRef.current === 0) {
          setConnectionError('Unable to connect to voice server. This may be due to network issues or the server being unavailable.');
        }
      };

    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
      connectionStateRef.current = 'disconnected';
      setConnectionError('Failed to initialize voice connection. Please check your internet connection.');
    }
  }, [currentUser, getSignalingUrl, handleSignalingMessage]);

  // Join voice room
  const joinRoom = useCallback(async (username: string, walletAddress: string, roomId: string) => {
    try {
      console.log('Joining room...', { username, roomId });
      
      // Reset connection error and reconnection attempts
      setConnectionError(null);
      reconnectAttemptsRef.current = 0;
      
      // Initialize audio first
      await initializeAudio();

      const user: User = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        username,
        walletAddress,
        isSpeaking: false,
        isConnected: true
      };

      setCurrentUser(user);
      roomIdRef.current = roomId;

      // Connect to signaling server
      connectToSignalingServer();

      // Start voice activity detection
      detectVoiceActivity();

      // Set connected state
      setIsConnected(true);

      // Add welcome message
      setTimeout(() => {
        setMessages([{
          id: 'welcome-msg',
          username: 'SYSTEM',
          message: `Welcome to Proximity Chat, ${username}! 🎮 Voice chat is now active. Speak to test your microphone.`,
          timestamp: new Date(),
          walletAddress: 'SYSTEM'
        }]);
      }, 1000);

      console.log('Successfully joined room');

    } catch (error) {
      console.error('Error joining room:', error);
      setConnectionError(error instanceof Error ? error.message : 'Failed to join voice chat');
      throw error;
    }
  }, [initializeAudio, detectVoiceActivity, connectToSignalingServer]);

  // Leave room
  const leaveRoom = useCallback(() => {
    console.log('Leaving room...');
    
    // Send leave message
    if (signalingSocketRef.current && signalingSocketRef.current.readyState === WebSocket.OPEN && currentUser && roomIdRef.current) {
      const leaveMessage: SignalingMessage = {
        type: 'leave-room',
        roomId: roomIdRef.current,
        userId: currentUser.id,
        username: currentUser.username,
        walletAddress: currentUser.walletAddress
      };
      signalingSocketRef.current.send(JSON.stringify(leaveMessage));
    }

    // Clear reconnection timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Close signaling socket
    if (signalingSocketRef.current) {
      signalingSocketRef.current.close();
      signalingSocketRef.current = null;
    }

    // Close all peer connections
    peerConnectionsRef.current.forEach(pc => {
      pc.close();
    });
    peerConnectionsRef.current.clear();

    // Clean up all remote audio elements
    remoteAudioElementsRef.current.forEach(audio => {
      audio.pause();
      audio.srcObject = null;
    });
    remoteAudioElementsRef.current.clear();

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
      audioContextRef.current.close().catch(console.error);
      audioContextRef.current = null;
    }

    // Reset state
    connectionStateRef.current = 'disconnected';
    reconnectAttemptsRef.current = 0;
    setUsers([]);
    setIsConnected(false);
    setCurrentUser(null);
    setMessages([]);
    setIsMuted(false);
    setIsDeafened(false);
    setAudioLevel(0);
    setConnectionError(null);
    roomIdRef.current = null;

    console.log('Left room successfully');
  }, [currentUser]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = isMuted;
        setIsMuted(!isMuted);
        
        if (!isMuted && currentUser) {
          setCurrentUser(prev => prev ? { ...prev, isSpeaking: false } : null);
        }
        
        console.log('Mute toggled:', !isMuted);
      }
    }
  }, [isMuted, currentUser]);

  // Toggle deafen
  const toggleDeafen = useCallback(() => {
    const newDeafenState = !isDeafened;
    setIsDeafened(newDeafenState);
    
    // Mute/unmute all remote audio elements
    remoteAudioElementsRef.current.forEach(audio => {
      audio.volume = newDeafenState ? 0 : 1;
    });
    
    console.log('Deafen toggled:', newDeafenState);
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
    audioLevel,
    connectionError
  };
};