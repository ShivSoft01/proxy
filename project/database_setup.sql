-- Database setup for Proximity Chat
-- Run these commands in your Supabase SQL editor

-- Step 1: Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    wallet_address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 2: Create messages table
CREATE TABLE IF NOT EXISTS messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    username TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 3: Add foreign key constraint (optional but recommended)
ALTER TABLE messages 
ADD CONSTRAINT fk_messages_username 
FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE;

-- Step 4: Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Step 5: Create RLS policies for users table
-- Allow anyone to read users (for displaying user list)
CREATE POLICY "Allow public read access to users" ON users
    FOR SELECT USING (true);

-- Allow authenticated users to insert their own user record
CREATE POLICY "Allow users to insert their own record" ON users
    FOR INSERT WITH CHECK (true);

-- Step 6: Create RLS policies for messages table
-- Allow anyone to read messages (for real-time chat)
CREATE POLICY "Allow public read access to messages" ON messages
    FOR SELECT USING (true);

-- Allow authenticated users to insert messages
CREATE POLICY "Allow users to insert messages" ON messages
    FOR INSERT WITH CHECK (true);

-- Step 7: Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_username ON messages(username);

-- Step 8: Enable real-time for both tables
ALTER PUBLICATION supabase_realtime ADD TABLE users;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- Optional: Insert some sample data for testing
INSERT INTO users (username, wallet_address) VALUES 
    ('CryptoKing', '0x1234567890abcdef1234567890abcdef12345678'),
    ('TokenHolder', '0xabcdef1234567890abcdef1234567890abcdef12')
ON CONFLICT (username) DO NOTHING;

INSERT INTO messages (username, message) VALUES 
    ('SYSTEM', 'Welcome to Proximity Chat! Connect your wallet to start chatting.'),
    ('CryptoKing', 'Hey everyone! How''s the token doing today?')
ON CONFLICT DO NOTHING; 