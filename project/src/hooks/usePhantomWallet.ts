import { useState, useEffect } from 'react';

interface PhantomProvider {
  isPhantom: boolean;
  connect: () => Promise<{ publicKey: { toString: () => string } }>;
  disconnect: () => Promise<void>;
  on: (event: string, callback: (args: any) => void) => void;
  off: (event: string, callback: (args: any) => void) => void;
  publicKey: { toString: () => string } | null;
  isConnected: boolean;
}

declare global {
  interface Window {
    solana?: PhantomProvider;
  }
}

export const usePhantomWallet = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isPhantomInstalled, setIsPhantomInstalled] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkPhantomInstalled = () => {
      if (window.solana && window.solana.isPhantom) {
        setIsPhantomInstalled(true);
        
        // Check if already connected
        if (window.solana.isConnected && window.solana.publicKey) {
          setIsConnected(true);
          setPublicKey(window.solana.publicKey.toString());
        }

        // Listen for account changes
        const handleAccountChanged = (publicKey: any) => {
          if (publicKey) {
            setPublicKey(publicKey.toString());
            setIsConnected(true);
          } else {
            setPublicKey(null);
            setIsConnected(false);
          }
        };

        window.solana.on('accountChanged', handleAccountChanged);

        return () => {
          window.solana?.off('accountChanged', handleAccountChanged);
        };
      } else {
        setIsPhantomInstalled(false);
      }
    };

    // Check immediately
    checkPhantomInstalled();

    // Also check after a short delay in case Phantom loads asynchronously
    const timer = setTimeout(checkPhantomInstalled, 1000);

    return () => clearTimeout(timer);
  }, []);

  const connectWallet = async () => {
    if (!window.solana || !window.solana.isPhantom) {
      setError('Phantom wallet is not installed');
      return false;
    }

    try {
      setIsConnecting(true);
      setError(null);
      
      const response = await window.solana.connect();
      
      if (response.publicKey) {
        setPublicKey(response.publicKey.toString());
        setIsConnected(true);
        return true;
      }
      
      return false;
    } catch (err: any) {
      console.error('Failed to connect wallet:', err);
      setError(err.message || 'Failed to connect wallet');
      return false;
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = async () => {
    if (!window.solana) return;

    try {
      await window.solana.disconnect();
      setPublicKey(null);
      setIsConnected(false);
      setError(null);
    } catch (err: any) {
      console.error('Failed to disconnect wallet:', err);
      setError(err.message || 'Failed to disconnect wallet');
    }
  };

  const getShortAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  return {
    isConnected,
    publicKey,
    isPhantomInstalled,
    isConnecting,
    error,
    connectWallet,
    disconnectWallet,
    getShortAddress
  };
};