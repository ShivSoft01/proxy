import React, { useState } from 'react';
import { User, X, Loader } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface UsernameModalProps {
  isOpen: boolean;
  walletAddress: string;
  onSubmit: (username: string) => void;
  onClose: () => void;
  isJoining?: boolean;
}

export const UsernameModal: React.FC<UsernameModalProps> = ({
  isOpen,
  walletAddress,
  onSubmit,
  onClose,
  isJoining = false
}) => {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isJoining) return;
    
    if (!username.trim()) {
      setError('Username is required');
      return;
    }

    if (username.length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }

    if (username.length > 20) {
      setError('Username must be less than 20 characters');
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setError('Username can only contain letters, numbers, and underscores');
      return;
    }

    try {
      // Check if username already exists
      const { data: existingUser, error: checkError } = await supabase
        .from('users')
        .select('username')
        .eq('username', username.trim())
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

      if (existingUser) {
        setError('Username already taken. Please choose another one.');
        return;
      }

      // Create new user
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert([
          {
            username: username.trim(),
            wallet_address: walletAddress
          }
        ])
        .select()
        .single();

      if (insertError) {
        console.error('Error creating user:', insertError);
        setError('Failed to create user. Please try again.');
        return;
      }

      // Store username in localStorage
      localStorage.setItem('proximity_chat_username', username.trim());
      localStorage.setItem('proximity_chat_wallet', walletAddress);

      // Call the original onSubmit
    onSubmit(username.trim());
    } catch (error) {
      console.error('Error in username submission:', error);
      setError('An error occurred. Please try again.');
    }
  };

  const getShortAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 pixel-grid">
      <div className="bg-black border-4 border-white p-8 max-w-md w-full mx-4 pixel-border">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white pixel-text">ENTER USERNAME</h2>
          {!isJoining && (
            <button
              onClick={onClose}
              className="text-white hover:text-gray-300 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          )}
        </div>

        <div className="border-2 border-white bg-black p-4 mb-6 pixel-border">
          <div className="flex items-center space-x-3 mb-3">
            <div className="w-3 h-3 bg-green-400 pixel-square animate-pulse"></div>
            <span className="text-green-400 pixel-text font-bold">WALLET CONNECTED</span>
          </div>
          <p className="text-white pixel-text text-sm">
            {getShortAddress(walletAddress)}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label className="block text-white pixel-text font-bold mb-3">
              CHOOSE YOUR USERNAME:
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError('');
                }}
                placeholder="ENTER USERNAME"
                className="w-full bg-black border-2 border-white text-white p-3 pl-12 pixel-text placeholder-gray-400 focus:outline-none focus:border-green-400 pixel-border"
                maxLength={20}
                autoFocus
                disabled={isJoining}
              />
            </div>
            {error && (
              <div className="mt-3 border-2 border-red-600 bg-black p-2 pixel-border">
                <p className="text-red-400 pixel-text text-sm">{error}</p>
              </div>
            )}
          </div>

          <div className="border-2 border-gray-600 bg-gray-900 p-4 mb-6 pixel-border">
            <p className="text-gray-300 pixel-text text-sm">
              YOUR USERNAME WILL BE LINKED TO YOUR WALLET ADDRESS AND DISPLAYED IN THE VOICE CHAT.
            </p>
          </div>

          <div className="flex space-x-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isJoining}
              className="flex-1 px-6 py-3 border-2 border-white bg-black text-white hover:bg-white hover:text-black transition-colors pixel-border pixel-text font-bold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={isJoining}
              className="flex-1 px-6 py-3 border-2 border-green-400 bg-green-400 text-black hover:bg-black hover:text-green-400 transition-colors pixel-border pixel-text font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isJoining ? (
                <>
                  <Loader className="w-4 h-4 mr-2 animate-spin" />
                  JOINING...
                </>
              ) : (
                'JOIN CHAT'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};