import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables:');
  console.error('- VITE_SUPABASE_URL:', supabaseUrl ? '✅ Set' : '❌ Missing');
  console.error('- VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? '✅ Set' : '❌ Missing');
  console.error('Please check your .env file and ensure both variables are set.');
  throw new Error('Missing Supabase environment variables. Please check your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database types
export interface User {
  id: string;
  username: string;
  created_at: string;
}

export interface Message {
  id: string;
  username: string;
  message: string;
  created_at: string;
}

// Test database connectivity
export const testDatabaseConnection = async () => {
  try {
    console.log('Testing database connection...');
    
    // Test users table
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('count')
      .limit(1);
    
    if (usersError) {
      console.error('Users table error:', usersError);
      return false;
    }
    
    // Test messages table
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('count')
      .limit(1);
    
    if (messagesError) {
      console.error('Messages table error:', messagesError);
      return false;
    }
    
    console.log('✅ Database connection successful');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
}; 