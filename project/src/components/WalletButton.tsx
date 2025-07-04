import React from 'react';
import { Wallet, ExternalLink, AlertCircle } from 'lucide-react';
import { usePhantomWallet } from '../hooks/usePhantomWallet';

interface WalletButtonProps {
  onWalletConnected: () => void;
  className?: string;
}

export const WalletButton: React.FC<WalletButtonProps> = ({ 
  onWalletConnected, 
  className = "" 
}) => {
  const {
    isConnected,
    publicKey,
    isPhantomInstalled,
    isConnecting,
    error,
    connectWallet,
    getShortAddress
  } = usePhantomWallet();

  const handleConnect = async () => {
    if (!isPhantomInstalled) {
      window.open('https://phantom.app/', '_blank');
      return;
    }

    const success = await connectWallet();
    if (success) {
      onWalletConnected();
    }
  };

  if (!isPhantomInstalled) {
    return (
      <div className="text-center">
        <button
          onClick={handleConnect}
          className={`group relative px-12 py-6 bg-white text-black border-4 border-white font-bold text-xl transform hover:scale-105 transition-all duration-200 hover:shadow-2xl pixel-button hover:bg-black hover:text-white ${className}`}
        >
          <ExternalLink className="inline-block w-6 h-6 mr-3" />
          INSTALL PHANTOM WALLET
        </button>
        <div className="mt-6 border-2 border-red-600 bg-black p-3 inline-block pixel-border">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <p className="text-sm text-red-400 pixel-text">
              PHANTOM WALLET NOT DETECTED
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isConnected && publicKey) {
    return (
      <div className="text-center">
        <div className="border-4 border-green-400 bg-black p-6 pixel-border mb-4">
          <div className="flex items-center justify-center space-x-3 mb-3">
            <div className="w-3 h-3 bg-green-400 pixel-square animate-pulse"></div>
            <span className="text-green-400 pixel-text font-bold">WALLET CONNECTED</span>
          </div>
          <div className="border-2 border-white bg-black p-3 pixel-border">
            <p className="text-white pixel-text text-sm">
              ADDRESS: {getShortAddress(publicKey)}
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            console.log('ENTER PROXIMITY CHAT button clicked');
            onWalletConnected();
          }}
          className={`px-12 py-6 bg-green-400 text-black border-4 border-green-400 font-bold text-xl transform hover:scale-105 transition-all duration-200 hover:shadow-2xl pixel-button hover:bg-black hover:text-green-400 ${className}`}
        >
          ENTER PROXIMITY CHAT
        </button>
      </div>
    );
  }

  return (
    <div className="text-center">
      <button
        onClick={handleConnect}
        disabled={isConnecting}
        className={`group relative px-12 py-6 bg-white text-black border-4 border-white font-bold text-xl transform hover:scale-105 transition-all duration-200 hover:shadow-2xl pixel-button hover:bg-black hover:text-white disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      >
        <Wallet className="inline-block w-6 h-6 mr-3" />
        {isConnecting ? 'CONNECTING...' : 'CONNECT PHANTOM WALLET'}
      </button>
      
      {error && (
        <div className="mt-6 border-2 border-red-600 bg-black p-3 inline-block pixel-border">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <p className="text-sm text-red-400 pixel-text">
              {error.toUpperCase()}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};