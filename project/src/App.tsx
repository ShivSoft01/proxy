import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  MicOff, 
  Phone, 
  Users, 
  Wallet, 
  Shield, 
  MessageCircle,
  Volume2,
  Settings,
  Send, 
  Hash,
  VolumeX,
  Crown,
  Headphones,
  HeadphonesIcon,
  LogOut,
  Twitter
} from 'lucide-react';
import { WalletButton } from './components/WalletButton';
import { UsernameModal } from './components/UsernameModal';
import { usePhantomWallet } from './hooks/usePhantomWallet';
import { supabase, Message, testDatabaseConnection } from './lib/supabase';
//e
// Real-time chat interfacerrrr
interface RealTimeChat {
  users: any[];
  isConnected: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  currentUser: any;
  messages: Message[];
  audioLevel: number;
  toggleMute: () => void;
  toggleDeafen: () => void;
  sendMessage: (message: string) => Promise<void>;
  leaveRoom: () => void;
}

function App() {
  const [isInChat, setIsInChat] = useState(false);
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const { isConnected, publicKey, disconnectWallet } = usePhantomWallet();
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  
  // Real-time chat functionality
  const realTimeChat: RealTimeChat = {
    users: users,
    isConnected: true,
    isMuted: isMuted,
    isDeafened: isDeafened,
    currentUser: currentUsername ? {
      id: 'current',
      username: currentUsername,
      walletAddress: publicKey || '0x0000000000000000000000000000000000000000',
      isSpeaking: false,
      isConnected: true
    } : null,
    messages: messages,
    audioLevel: audioLevel,
    toggleMute: () => setIsMuted(!isMuted),
    toggleDeafen: () => setIsDeafened(!isDeafened),
    sendMessage: async (message: string) => {
      if (!currentUsername) {
        console.error('No current username found');
        return;
      }
      
      try {
        console.log('Sending message:', { username: currentUsername, message: message.trim() });
        
        const { data, error } = await supabase
          .from('messages')
          .insert([
            {
              username: currentUsername,
              message: message.trim()
            }
          ])
          .select();

        if (error) {
          console.error('Error sending message:', error);
          alert('Failed to send message. Please try again.');
        } else {
          console.log('Message sent successfully:', data);
        }
      } catch (error) {
        console.error('Error sending message:', error);
        alert('Failed to send message. Please try again.');
      }
    },
    leaveRoom: () => {}
  };

  // Load existing username from localStorage
  useEffect(() => {
    const savedUsername = localStorage.getItem('proximity_chat_username');
    const savedWallet = localStorage.getItem('proximity_chat_wallet');
    
    if (savedUsername && savedWallet && publicKey && savedWallet === publicKey) {
      setCurrentUsername(savedUsername);
      // Auto-enter chat if wallet is connected and username exists
      if (isConnected) {
        setIsInChat(true);
      }
    }
  }, [isConnected, publicKey]);

  // Test database connection on app load
  useEffect(() => {
    testDatabaseConnection().then((isConnected) => {
      if (!isConnected) {
        console.error('❌ Database connection failed. Please check your Supabase setup.');
        alert('Database connection failed. Please check the console for details.');
      }
    });
  }, []);

  // Load messages and set up real-time subscription
  useEffect(() => {
    if (!isInChat) return;

    console.log('Setting up real-time subscription...');

    // Load last 50 messages
    const loadMessages = async () => {
      try {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .order('created_at', { ascending: true })
          .limit(50);

        if (error) {
          console.error('Error loading messages:', error);
        } else {
          console.log('Loaded messages:', data);
          setMessages(data || []);
        }
      } catch (error) {
        console.error('Error loading messages:', error);
      }
    };

    loadMessages();

    // Set up real-time subscription
    const subscription = supabase
      .channel('messages')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          console.log('Received new message:', payload);
          const newMessage = payload.new as Message;
          setMessages(prev => [...prev, newMessage]);
        }
      )
      .subscribe((status) => {
        console.log('Subscription status:', status);
      });

    return () => {
      console.log('Cleaning up subscription...');
      subscription.unsubscribe();
    };
  }, [isInChat]);

  // Load users
  useEffect(() => {
    if (!isInChat) return;

    const loadUsers = async () => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .order('created_at', { ascending: true });

        if (error) {
          console.error('Error loading users:', error);
        } else {
          const mockUsers = data?.map(user => ({
            id: user.id,
            username: user.username,
            walletAddress: user.wallet_address || '0x0000000000000000000000000000000000000000',
            isSpeaking: false,
            isConnected: true
          })) || [];
          
          setUsers(mockUsers);
        }
      } catch (error) {
        console.error('Error loading users:', error);
      }
    };

    loadUsers();
  }, [isInChat]);

  const handleEnterChat = () => {
    console.log('handleEnterChat called', { isConnected, publicKey });
    
    // Add a small delay to ensure wallet state is updated
    setTimeout(() => {
      console.log('Delayed check:', { isConnected, publicKey });
      
      if (!isConnected) {
        console.log('Wallet not connected');
        alert('Please connect your wallet first. Make sure Phantom is installed and connected.');
        return;
      }
      
      if (!publicKey) {
        console.log('No public key available');
        alert('Wallet connection incomplete. Please try disconnecting and reconnecting your wallet.');
        return;
      }

      // Check if user already has a username
      const savedUsername = localStorage.getItem('proximity_chat_username');
      const savedWallet = localStorage.getItem('proximity_chat_wallet');
      
      console.log('Checking saved data:', { savedUsername, savedWallet, publicKey });
      
      if (savedUsername && savedWallet === publicKey) {
        // User already has username, go directly to chat
        console.log('User has saved username, going to chat');
        setCurrentUsername(savedUsername);
        setIsInChat(true);
      } else {
        // Show username modal
        console.log('Showing username modal');
        setShowUsernameModal(true);
      }
    }, 100); // Small delay to ensure state is updated
  };

  const handleUsernameSubmit = async (username: string) => {
    if (publicKey && !isJoining) {
      setIsJoining(true);
      try {
        setCurrentUsername(username);
        setShowUsernameModal(false);
        setIsInChat(true);
      } catch (error) {
        console.error('Failed to join voice chat:', error);
        alert('Failed to join voice chat. Please try again.');
      } finally {
        setIsJoining(false);
      }
    }
  };

  const handleDisconnectCall = async () => {
    setIsInChat(false);
    setCurrentUsername(null);
    localStorage.removeItem('proximity_chat_username');
    localStorage.removeItem('proximity_chat_wallet');
    await disconnectWallet();
  };

  if (isInChat && realTimeChat.isConnected) {
    return <VoiceChatInterface 
      voiceChat={realTimeChat}
      onDisconnect={handleDisconnectCall}
    />;
  }

  return (
    <>
      <LandingPage onWalletConnected={handleEnterChat} />
      <UsernameModal
        isOpen={showUsernameModal}
        walletAddress={publicKey || ''}
        onSubmit={handleUsernameSubmit}
        onClose={() => {
          setShowUsernameModal(false);
          setIsJoining(false);
        }}
        isJoining={isJoining}
      />
    </>
  );
}

function TypewriterText({ text, speed = 50, delay = 0 }: { text: string; speed?: number; delay?: number }) {
  const [displayText, setDisplayText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (currentIndex < text.length) {
        setDisplayText(prev => prev + text[currentIndex]);
        setCurrentIndex(prev => prev + 1);
      }
    }, currentIndex === 0 ? delay : speed);

    return () => clearTimeout(timer);
  }, [currentIndex, text, speed, delay]);

  return (
    <span>
      {displayText}
      {currentIndex < text.length && <span className="animate-pulse">|</span>}
    </span>
  );
}

function StarField() {
  const stars = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 3 + 1,
    animationDelay: Math.random() * 3,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden">
      {stars.map((star) => (
        <div
          key={star.id}
          className="absolute bg-white rounded-full animate-pulse star-twinkle"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            animationDelay: `${star.animationDelay}s`,
          }}
        />
      ))}
    </div>
  );
}

function PixelAudioIcon() {
  return (
    <div className="flex items-center space-x-1 audio-visualizer">
      <div className="w-1 h-4 bg-white pixel-square audio-bar" style={{ animationDelay: '0ms' }}></div>
      <div className="w-1 h-6 bg-white pixel-square audio-bar" style={{ animationDelay: '150ms' }}></div>
      <div className="w-1 h-3 bg-white pixel-square audio-bar" style={{ animationDelay: '300ms' }}></div>
      <div className="w-1 h-7 bg-white pixel-square audio-bar" style={{ animationDelay: '450ms' }}></div>
      <div className="w-1 h-4 bg-white pixel-square audio-bar" style={{ animationDelay: '600ms' }}></div>
      <div className="w-1 h-5 bg-white pixel-square audio-bar" style={{ animationDelay: '750ms' }}></div>
      <div className="w-1 h-3 bg-white pixel-square audio-bar" style={{ animationDelay: '900ms' }}></div>
    </div>
  );
}

function PixelMicrophoneIcon() {
  return (
    <div className="relative">
      <Mic className="w-8 h-8 text-white" />
    </div>
  );
}

function PixelatedText({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`pixelated-text ${className}`}>
      {text.split('').map((char, index) => (
        <span 
          key={index} 
          className="inline-block pixel-char"
          style={{ animationDelay: `${index * 50}ms` }}
        >
          {char}
        </span>
      ))}
    </div>
  );
}

function AudioLevelIndicator({ level, isSpeaking }: { level: number; isSpeaking: boolean }) {
  const bars = Array.from({ length: 5 }, (_, i) => {
    const threshold = (i + 1) * 20;
    const isActive = level > threshold;
    return (
      <div
        key={i}
        className={`w-1 h-3 pixel-square transition-all duration-100 ${
          isActive && isSpeaking
            ? 'bg-green-400 animate-pulse'
            : 'bg-gray-600'
        }`}
        style={{ height: `${8 + i * 4}px` }}
      />
    );
  });

  return (
    <div className="flex items-end space-x-1">
      {bars}
    </div>
  );
}

function LandingPage({ onWalletConnected }: { onWalletConnected: () => void }) {
  const { isConnected, disconnectWallet } = usePhantomWallet();

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden pixel-grid">
      {/* Star field background */}
      <StarField />

      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-10 w-4 h-4 bg-white animate-bounce pixel-square floating-pixel"></div>
        <div className="absolute top-40 right-20 w-3 h-3 bg-white animate-pulse pixel-square floating-pixel"></div>
        <div className="absolute bottom-20 left-20 w-5 h-5 bg-white animate-ping pixel-square floating-pixel"></div>
        <div className="absolute bottom-40 right-10 w-4 h-4 bg-white animate-bounce delay-75 pixel-square floating-pixel"></div>
        <div className="absolute top-60 left-1/2 w-3 h-3 bg-white animate-pulse delay-150 pixel-square floating-pixel"></div>
        <div className="absolute bottom-60 right-1/3 w-4 h-4 bg-white animate-bounce delay-300 pixel-square floating-pixel"></div>
      </div>

      {/* Header */}
      <header className="relative z-10 p-6 border-b-4 border-white pixel-border slide-down">
        <nav className="flex justify-between items-center max-w-7xl mx-auto">
          {/* $PROXIMITY Logo moved much further to the left */}
          <div className="flex items-center space-x-6 logo-bounce -ml-24">
            <PixelAudioIcon />
            <h1 className="text-4xl md:text-5xl font-bold text-white tracking-wider pixel-text">$PROXIMITY</h1>
            <PixelMicrophoneIcon />
          </div>
          <div className="flex items-center space-x-4">
            <div className="hidden md:flex space-x-4">
              <button className="nav-button px-6 py-3 border-2 border-white bg-black text-white hover:bg-white hover:text-black transition-all duration-300 pixel-text transform hover:scale-105">
                FEATURES
              </button>
              <button className="nav-button px-6 py-3 border-2 border-white bg-black text-white hover:bg-white hover:text-black transition-all duration-300 pixel-text transform hover:scale-105">
                HOW IT WORKS
              </button>
              <button className="nav-button px-6 py-3 border-2 border-white bg-black text-white hover:bg-white hover:text-black transition-all duration-300 pixel-text transform hover:scale-105">
                COMMUNITY
              </button>
            </div>
            {isConnected && (
              <button
                onClick={disconnectWallet}
                className="px-4 py-2 border-2 border-red-600 bg-red-600 text-white hover:bg-black hover:text-red-600 transition-all duration-300 pixel-text transform hover:scale-105 flex items-center space-x-2"
              >
                <LogOut className="w-4 h-4" />
                <span>DISCONNECT</span>
              </button>
            )}
            
            {/* Twitter/X Icon moved to the far right side */}
            <div className="flex items-center ml-6">
              <a 
                href="https://x.com/proximity_chatsol" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-white hover:text-blue-400 transition-colors duration-300 cursor-pointer"
              >
                <Twitter className="w-8 h-8" />
              </a>
            </div>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 pt-20 pb-32 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-block p-8 border-4 border-white bg-black mb-8 pixel-border">
            <div className="flex items-center justify-center space-x-6 mb-4">
              <PixelAudioIcon />
              <h2 className="text-6xl md:text-8xl font-bold text-white pixel-text pixel-glow">
                PROXIMITY
              </h2>
              <PixelMicrophoneIcon />
            </div>
            <p className="text-xl md:text-2xl text-gray-300 mb-8 pixel-text subtitle-fade">
              <TypewriterText 
                text="TALK TO WHO JEETS, OR HODLS IN REAL TIME..." 
                speed={80}
                delay={500}
              />
            </p>
          </div>
          
          <div className="border-2 border-white bg-black p-6 mb-12 pixel-border content-slide">
            <p className="text-lg md:text-xl max-w-3xl mx-auto leading-relaxed pixel-text min-h-[3rem] flex items-center justify-center">
              <TypewriterText 
                text="OWN TOKENS TO ENTER THE PROXIMITY CHAT" 
                speed={60}
                delay={3000}
              />
            </p>
          </div>

          {!isConnected && (
            <div className="border-2 border-yellow-400 bg-black p-4 mb-8 pixel-border">
              <div className="flex items-center justify-center space-x-2">
                <Wallet className="w-5 h-5 text-yellow-400" />
                <p className="text-yellow-400 pixel-text font-bold">
                  CONNECT WALLET TO ACCESS PROXIMITY CHAT
                </p>
              </div>
            </div>
          )}

          {isConnected && (
            <div className="border-2 border-green-400 bg-black p-4 mb-8 pixel-border">
              <div className="flex items-center justify-center space-x-2 mb-4">
                <Wallet className="w-5 h-5 text-green-400" />
                <p className="text-green-400 pixel-text font-bold">
                  WALLET CONNECTED
                </p>
              </div>
              <div className="flex flex-col space-y-3">
                <button
                  onClick={onWalletConnected}
                  className="px-8 py-4 border-2 border-white bg-black text-white hover:bg-white hover:text-black transition-all duration-300 pixel-text transform hover:scale-105 flex items-center justify-center space-x-2 font-bold text-lg"
                >
                  <span>ENTER PROXIMITY CHAT</span>
                </button>
                <button
                  onClick={disconnectWallet}
                  className="px-6 py-3 border-2 border-red-600 bg-red-600 text-white hover:bg-black hover:text-red-600 transition-all duration-300 pixel-text transform hover:scale-105 flex items-center space-x-2 mx-auto"
                >
                  <LogOut className="w-4 h-4" />
                  <span>DISCONNECT WALLET</span>
                </button>
              </div>
            </div>
          )}

          {!isConnected && <WalletButton onWalletConnected={onWalletConnected} />}
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="relative z-10 py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 border-4 border-white bg-black p-6 pixel-border section-fade">
            <h3 className="text-4xl font-bold text-white pixel-text pixel-glow">
              POWER-UPS & FEATURES
            </h3>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8">
            <FeatureCard
              icon={<Shield className="w-12 h-12" />}
              title="VERIFIED HOLDERS ONLY"
              description="SMART CONTRACT VERIFICATION ENSURES ONLY REAL COIN HOLDERS WITH TOKENS CAN ENTER THE PROXIMITY"
            />
            <FeatureCard
              icon={<MessageCircle className="w-12 h-12" />}
              title="VOICE & TEXT CHAT"
              description="TALK WITH OTHER TRADERS THROUGH VOICE CHAT AND REAL-TIME TEXT MESSAGING."
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative z-10 py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="border-4 border-white bg-black p-12 pixel-border cta-float">
            <h3 className="text-3xl font-bold mb-6 text-white pixel-text pixel-glow">
              READY TO LEVEL UP?
            </h3>
            <div className="border-2 border-gray-600 bg-gray-900 p-4 mb-8 pixel-border">
              <p className="text-lg pixel-text">
                JOIN THE FUTURE OF CRYPTO COMMUNICATION. CONNECT WITH HOLDERS, SHARE ALPHA, AND BUILD THE COMMUNITY.
              </p>
            </div>
            <WalletButton onWalletConnected={onWalletConnected} />
          </div>
        </div>
      </section>
    </div>
  );
}

function FeatureCard({ icon, title, description }: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="border-4 border-white bg-black p-8 transform hover:scale-105 transition-all duration-200 hover:shadow-2xl pixel-border hover:bg-white hover:text-black group feature-card-slide">
      <div className="text-white mb-6 group-hover:text-black">
        {icon}
      </div>
      <h4 className="text-xl font-bold mb-4 text-white pixel-text group-hover:text-black">{title}</h4>
      <p className="text-gray-300 leading-relaxed pixel-text group-hover:text-black">{description}</p>
    </div>
  );
}

function VoiceChatInterface({ 
  voiceChat,
  onDisconnect 
}: { 
  voiceChat: RealTimeChat;
  onDisconnect: () => void;
}) {
  const [message, setMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [voiceChat.messages]);

  const sendMessage = async () => {
    if (message.trim()) {
      await voiceChat.sendMessage(message.trim());
      setMessage('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  };

  const getShortAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  // Enhanced profile box color with more vibrant feedback
  const getProfileBoxColor = (user: any, isCurrentUser: boolean = false) => {
    if (isCurrentUser) {
      if (voiceChat.isMuted) {
        return 'border-red-500 bg-red-900/50 shadow-lg shadow-red-500/20';
      } else if (user.isSpeaking) {
        return 'border-green-400 bg-green-900/50 shadow-lg shadow-green-400/30 animate-pulse';
      } else {
        return 'border-white bg-black';
      }
    } else {
      if (user.isSpeaking) {
        return 'border-green-400 bg-green-900/50 shadow-lg shadow-green-400/30 animate-pulse';
      } else {
        return 'border-white bg-black';
      }
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex pixel-grid">
      {/* Left Sidebar - Server List */}
      <div className="w-20 bg-black border-r-4 border-white flex flex-col items-center py-6 space-y-4 pixel-border">
        <div className="w-12 h-12 bg-white text-black flex items-center justify-center font-bold text-lg pixel-border border-2 border-white hover:bg-black hover:text-white transition-all duration-200 cursor-pointer pixel-text">
          P
        </div>
        <div className="w-8 h-1 bg-white pixel-square"></div>
      </div>

      {/* Channel Sidebar */}
      <div className="w-64 bg-black border-r-4 border-white flex flex-col pixel-border">
        {/* Server Header */}
        <div className="p-4 border-b-4 border-white bg-black pixel-border">
          <PixelatedText 
            text="$PROXIMITY CHAT" 
            className="text-lg font-bold text-white pixel-text mb-2"
          />
          <p className="text-sm text-gray-400 pixel-text">1M+ TOKEN HOLDERS</p>
        </div>

        {/* Voice Channels */}
        <div className="flex-1 p-4 overflow-y-auto">
          <div className="mb-6">
            <div className="flex items-center mb-4 p-2 border-2 border-white bg-black pixel-border">
              <Volume2 className="w-4 h-4 mr-2 text-white" />
              <span className="text-sm font-bold text-white pixel-text">VOICE CHANNELS</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center p-3 bg-white text-black border-2 border-white pixel-border hover:bg-black hover:text-white transition-colors cursor-pointer">
                <Hash className="w-4 h-4 mr-2" />
                <span className="text-sm font-bold pixel-text">GENERAL VOICE</span>
                <div className="ml-auto flex items-center">
                  <Users className="w-4 h-4 mr-1" />
                  <span className="text-sm font-bold pixel-text">{voiceChat.users.length + (voiceChat.currentUser ? 1 : 0)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Voice Participants */}
          <div className="mb-4">
            <div className="flex items-center mb-4 p-2 border-2 border-white bg-black pixel-border">
              <span className="text-sm font-bold text-white pixel-text">VOICE — {voiceChat.users.length + (voiceChat.currentUser ? 1 : 0)}</span>
            </div>
            <div className="space-y-2">
              {/* Current User */}
              {voiceChat.currentUser && (
                <div className={`border-2 p-3 pixel-border transition-all duration-200 ${getProfileBoxColor(voiceChat.currentUser, true)}`}>
                  <div className="flex items-center">
                    <div className="relative">
                      <div className="w-8 h-8 bg-green-400 text-black border-2 border-green-400 flex items-center justify-center text-sm pixel-border">
                        🎮
                      </div>
                      {voiceChat.currentUser.isSpeaking && !voiceChat.isMuted && (
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-400 border-2 border-black flex items-center justify-center pixel-border animate-ping">
                          <div className="w-2 h-2 bg-black pixel-square"></div>
                        </div>
                      )}
                    </div>
                    <div className="ml-3 flex-1">
                      <div className="flex items-center">
                        <span className={`text-sm font-bold pixel-text ${voiceChat.isMuted ? 'text-red-400' : voiceChat.currentUser.isSpeaking ? 'text-green-400' : 'text-white'}`}>
                          {voiceChat.currentUser.username} (YOU)
                        </span>
                        {voiceChat.currentUser.isSpeaking && !voiceChat.isMuted && (
                          <div className="ml-2">
                            <AudioLevelIndicator level={voiceChat.audioLevel} isSpeaking={voiceChat.currentUser.isSpeaking} />
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 pixel-text">{getShortAddress(voiceChat.currentUser.walletAddress)}</div>
                      {voiceChat.audioLevel > 0 && (
                        <div className="text-xs text-green-400 pixel-text">
                          AUDIO: {Math.round(voiceChat.audioLevel)}%
                        </div>
                      )}
                    </div>
                    {voiceChat.isMuted && (
                      <MicOff className="w-4 h-4 text-red-400" />
                    )}
                  </div>
                </div>
              )}

              {/* Other Users */}
              {voiceChat.users.map((user) => (
                <div key={user.id} className={`border-2 p-3 hover:bg-white hover:text-black transition-colors cursor-pointer pixel-border group ${getProfileBoxColor(user)}`}>
                  <div className="flex items-center">
                    <div className="relative">
                      <div className="w-8 h-8 bg-white text-black border-2 border-white flex items-center justify-center text-sm pixel-border group-hover:bg-black group-hover:text-white">
                        👑
                      </div>
                      {user.isSpeaking && (
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-400 border-2 border-black flex items-center justify-center pixel-border animate-ping">
                          <div className="w-2 h-2 bg-black pixel-square"></div>
                        </div>
                      )}
                    </div>
                    <div className="ml-3 flex-1">
                      <div className="flex items-center">
                        <span className={`text-sm font-bold pixel-text ${user.isSpeaking ? 'text-green-400' : 'text-white'} group-hover:text-black`}>
                          {user.username}
                        </span>
                        {user.isSpeaking && (
                          <div className="ml-2">
                            <AudioLevelIndicator level={75} isSpeaking={user.isSpeaking} />
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 pixel-text group-hover:text-gray-600">{getShortAddress(user.walletAddress)}</div>
                    </div>
                    {!user.isSpeaking && (
                      <VolumeX className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* User Panel */}
        <div className="p-4 bg-black border-t-4 border-white pixel-border">
          <div className="border-2 border-white bg-black p-3 pixel-border">
            {voiceChat.currentUser && (
              <>
                {/* Online Users Count */}
                <div className="flex items-center justify-center mb-3 p-2 border-2 border-green-400 bg-green-900/20 pixel-border">
                  <Users className="w-4 h-4 mr-2 text-green-400" />
                  <span className="text-sm font-bold text-green-400 pixel-text">
                    {voiceChat.users.length + (voiceChat.currentUser ? 1 : 0)} ONLINE
                  </span>
                </div>
                
                <div className="flex items-center mb-3">
                  <div className="w-8 h-8 bg-green-400 text-black flex items-center justify-center text-sm border-2 border-green-400 pixel-border">
                    🎮
                  </div>
                  <div className="ml-3 flex-1">
                    <div className="text-sm font-bold text-white pixel-text">{voiceChat.currentUser.username}</div>
                    <div className="text-xs text-gray-400 pixel-text">{getShortAddress(voiceChat.currentUser.walletAddress)}</div>
                  </div>
                </div>
                <div className="flex space-x-2">
                  {/* JOIN Telegram Button */}
                  <a
                    href="https://t.me/+O1ycw8Fcp8AyYTJh"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 p-2 border-2 border-green-600 bg-green-600 text-white hover:bg-black hover:text-green-600 transition-colors pixel-border pixel-text text-sm font-bold flex items-center justify-center space-x-2"
                  >
                    <span>JOIN</span>
                  </a>
                  <button className="p-2 border-2 border-white bg-black text-white hover:bg-white hover:text-black transition-colors pixel-border">
                    <Settings className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={onDisconnect}
                    className="p-2 border-2 border-red-600 bg-red-600 text-white hover:bg-black hover:text-red-600 transition-colors pixel-border"
                  >
                    <Phone className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-black">
        {/* Chat Header */}
        <div className="p-4 border-b-4 border-white bg-black pixel-border flex items-center">
          <Hash className="w-6 h-6 mr-2 text-white" />
          <h3 className="font-bold text-white pixel-text">#PROXIMITY-CHAT</h3>
          <div className="ml-auto flex items-center space-x-4">
            <div className="flex items-center text-sm border-2 border-white bg-black px-3 py-1 pixel-border">
              <Users className="w-4 h-4 mr-2 text-white" />
              <span className="font-bold text-white pixel-text">{voiceChat.users.length + (voiceChat.currentUser ? 1 : 0)} ONLINE</span>
            </div>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 p-4 overflow-y-auto space-y-4">
          {voiceChat.messages.map((msg) => (
            <div key={msg.id} className="border-2 border-white bg-black p-4 hover:bg-white hover:text-black transition-colors pixel-border group">
              <div className="flex items-start space-x-3">
                <div className="w-10 h-10 bg-white text-black border-2 border-white flex items-center justify-center text-sm pixel-border flex-shrink-0 group-hover:bg-black group-hover:text-white">
                  {msg.username === voiceChat.currentUser?.username ? '🎮' : msg.username === 'SYSTEM' ? '🤖' : '👑'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline space-x-3 mb-2">
                    <span className="font-bold text-white pixel-text group-hover:text-black">{msg.username}</span>
                    <span className="text-xs text-gray-500 pixel-text group-hover:text-gray-600">
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-gray-300 pixel-text group-hover:text-black break-words">{msg.message}</p>
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input */}
        <div className="p-4 bg-black border-t-4 border-white pixel-border">
          <div className="flex space-x-3">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="MESSAGE #GENERAL-CHAT"
              className="flex-1 bg-black border-2 border-white text-white p-3 pixel-text placeholder-gray-400 focus:outline-none focus:bg-white focus:text-black pixel-border"
            />
            <button
              onClick={sendMessage}
              className="px-6 py-3 border-2 border-white bg-white text-black hover:bg-black hover:text-white transition-colors pixel-border pixel-text font-bold"
            >
              SEND
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;