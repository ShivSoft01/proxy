# 🚀 Proximity Chat Setup Guide

## 📋 Prerequisites
- Supabase account and project
- Node.js and npm installed
- Phantom wallet extension

## 🔧 Step 1: Environment Variables

Your `.env` file should contain:
```env
VITE_SUPABASE_URL=https://jginylwkzglmsrqcpxje.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnaW55bHdremdsbXNycWNweGplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEyMzMxNDksImV4cCI6MjA2NjgwOTE0OX0.Lh19FxFNNhJ2Fx7JYivo7kLIaDT9TrnoEmzXZ_Ryd3Q
```

## 🗄️ Step 2: Database Setup

### Run these SQL commands in your Supabase SQL Editor:

```sql
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

-- Step 3: Add foreign key constraint
ALTER TABLE messages 
ADD CONSTRAINT fk_messages_username 
FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE;

-- Step 4: Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Step 5: Create RLS policies for users table
CREATE POLICY "Allow public read access to users" ON users
    FOR SELECT USING (true);

CREATE POLICY "Allow users to insert their own record" ON users
    FOR INSERT WITH CHECK (true);

-- Step 6: Create RLS policies for messages table
CREATE POLICY "Allow public read access to messages" ON messages
    FOR SELECT USING (true);

CREATE POLICY "Allow users to insert messages" ON messages
    FOR INSERT WITH CHECK (true);

-- Step 7: Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_username ON messages(username);

-- Step 8: Enable real-time for both tables
ALTER PUBLICATION supabase_realtime ADD TABLE users;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- Step 9: Insert sample data
INSERT INTO users (username, wallet_address) VALUES 
    ('CryptoKing', '0x1234567890abcdef1234567890abcdef12345678'),
    ('TokenHolder', '0xabcdef1234567890abcdef1234567890abcdef12')
ON CONFLICT (username) DO NOTHING;

INSERT INTO messages (username, message) VALUES 
    ('SYSTEM', 'Welcome to Proximity Chat! Connect your wallet to start chatting.'),
    ('CryptoKing', 'Hey everyone! How''s the token doing today?')
ON CONFLICT DO NOTHING;
```

## 🚀 Step 3: Start the Application

```bash
cd project
npm install
npm run dev
```

## 🎯 Features

### ✅ Real-time Chat
- Live message updates
- Auto-scroll to new messages
- Enter key support for sending

### ✅ User Management
- Username uniqueness validation
- Wallet address linking
- Session persistence

### ✅ Database Integration
- Supabase real-time subscriptions
- Optimized queries with indexes
- Secure RLS policies

### ✅ UI Features
- Beautiful pixel-art design
- Responsive layout
- Smooth animations
- Error handling

## 🔍 Troubleshooting

### Environment Variables Error
If you see "Missing Supabase environment variables":
1. Check your `.env` file exists in the `project` folder
2. Ensure variables use `VITE_` prefix (not `NEXT_PUBLIC_`)
3. Restart the development server

### Database Connection Error
If you see database errors:
1. Run the SQL commands in Supabase SQL Editor
2. Check your Supabase URL and anon key are correct
3. Ensure RLS policies are created

### Real-time Not Working
If messages don't update in real-time:
1. Check Supabase real-time is enabled
2. Verify tables are added to real-time publication
3. Check browser console for subscription errors

## 📱 Usage

1. **Connect Wallet**: Click "Connect Wallet" and approve in Phantom
2. **Enter Username**: Choose a unique username (3-20 characters)
3. **Start Chatting**: Send messages and see them in real-time
4. **View Users**: See other connected users in the sidebar

## 🛠️ Development

- **Frontend**: React + TypeScript + Vite
- **Styling**: Tailwind CSS with custom pixel-art classes
- **Database**: Supabase (PostgreSQL)
- **Real-time**: Supabase real-time subscriptions
- **Wallet**: Phantom wallet integration 