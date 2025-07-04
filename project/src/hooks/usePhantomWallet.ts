import { useState, useEffect, useCallback } from 'react';

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

  // Check wallet connection status
  const checkConnectionStatus = useCallback(() => {
    if (window.solana && window.solana.isPhantom) {
      const connected = window.solana.isConnected;
      const key = window.solana.publicKey?.toString() || null;
      
      console.log('Checking connection status:', { connected, key });
      
      setIsConnected(connected);
      setPublicKey(key);
      
      return { connected, key };
    }
    return { connected: false, key: null };
  }, []);

  useEffect(() => {
    const checkPhantomInstalled = () => {
      console.log('Checking Phantom installation...');
      
      // Check for Phantom in different possible locations (Edge compatibility)
      const phantomProvider = window.solana || (window as any).phantom?.solana;
      
      if (phantomProvider && phantomProvider.isPhantom) {
        console.log('Phantom detected');
        setIsPhantomInstalled(true);
        
        // Check current connection status
        const { connected, key } = checkConnectionStatus();
        console.log('Initial connection status:', { connected, key });

        // Listen for account changes
        const handleAccountChanged = (publicKey: any) => {
          console.log('Account changed:', publicKey);
          if (publicKey) {
            setPublicKey(publicKey.toString());
            setIsConnected(true);
          } else {
            setPublicKey(null);
            setIsConnected(false);
          }
        };

        // Listen for connection changes
        const handleConnect = () => {
          console.log('Wallet connected');
          checkConnectionStatus();
        };

        const handleDisconnect = () => {
          console.log('Wallet disconnected');
          setIsConnected(false);
          setPublicKey(null);
        };

        phantomProvider.on('accountChanged', handleAccountChanged);
        phantomProvider.on('connect', handleConnect);
        phantomProvider.on('disconnect', handleDisconnect);

        return () => {
          phantomProvider.off('accountChanged', handleAccountChanged);
          phantomProvider.off('connect', handleConnect);
          phantomProvider.off('disconnect', handleDisconnect);
        };
      } else {
        console.log('Phantom not detected');
        setIsPhantomInstalled(false);
      }
    };

    // Check immediately
    checkPhantomInstalled();

    // Also check after a short delay in case Phantom loads asynchronously
    const timer = setTimeout(checkPhantomInstalled, 1000);
    
    // Check again after a longer delay for Edge browser
    const edgeTimer = setTimeout(checkPhantomInstalled, 3000);

    return () => {
      clearTimeout(timer);
      clearTimeout(edgeTimer);
    };
  }, [checkConnectionStatus]);

  const connectWallet = async () => {
    const phantomProvider = window.solana || (window as any).phantom?.solana;
    
    if (!phantomProvider || !phantomProvider.isPhantom) {
      setError('Phantom wallet is not installed');
      return false;
    }

    try {
      setIsConnecting(true);
      setError(null);
      
      console.log('Attempting to connect wallet...');
      const response = await phantomProvider.connect();
      
      if (response.publicKey) {
        console.log('Wallet connected successfully:', response.publicKey.toString());
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
    const phantomProvider = window.solana || (window as any).phantom?.solana;
    if (!phantomProvider) return;

    try {
      await phantomProvider.disconnect();
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