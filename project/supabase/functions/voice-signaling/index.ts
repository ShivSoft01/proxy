/*
  # Voice Chat Signaling Server

  1. WebSocket Support
    - Handles WebSocket upgrade requests
    - Manages real-time signaling for WebRTC voice chat
    - Supports room-based communication

  2. Message Types
    - join-room: User joins a voice chat room
    - leave-room: User leaves a voice chat room
    - offer/answer: WebRTC negotiation messages
    - ice-candidate: ICE candidate exchange

  3. Room Management
    - Tracks users in each room
    - Broadcasts messages to room participants
    - Handles user cleanup on disconnect
*/

interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'join-room' | 'leave-room' | 'user-joined' | 'user-left';
  roomId: string;
  userId: string;
  username: string;
  walletAddress: string;
  data?: any;
  targetUserId?: string;
}

interface RoomUser {
  id: string;
  username: string;
  walletAddress: string;
  socket: WebSocket;
}

// Store rooms and their users
const rooms = new Map<string, Map<string, RoomUser>>();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function broadcastToRoom(roomId: string, message: SignalingMessage, excludeUserId?: string) {
  const room = rooms.get(roomId);
  if (!room) return;

  const messageStr = JSON.stringify(message);
  
  room.forEach((user, userId) => {
    if (userId !== excludeUserId && user.socket.readyState === WebSocket.OPEN) {
      try {
        user.socket.send(messageStr);
      } catch (error) {
        console.error('Error sending message to user:', userId, error);
        // Remove disconnected user
        room.delete(userId);
      }
    }
  });
}

function handleUserJoin(roomId: string, userId: string, username: string, walletAddress: string, socket: WebSocket) {
  // Create room if it doesn't exist
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Map());
  }
  
  const room = rooms.get(roomId)!;
  
  // Add user to room
  room.set(userId, { id: userId, username, walletAddress, socket });
  
  // Notify existing users about new user
  const joinMessage: SignalingMessage = {
    type: 'user-joined',
    roomId,
    userId,
    username,
    walletAddress
  };
  
  broadcastToRoom(roomId, joinMessage, userId);
  
  console.log(`User ${username} (${userId}) joined room ${roomId}`);
}

function handleUserLeave(roomId: string, userId: string, username: string, walletAddress: string) {
  const room = rooms.get(roomId);
  if (!room) return;
  
  // Remove user from room
  room.delete(userId);
  
  // Clean up empty room
  if (room.size === 0) {
    rooms.delete(roomId);
  }
  
  // Notify remaining users
  const leaveMessage: SignalingMessage = {
    type: 'user-left',
    roomId,
    userId,
    username,
    walletAddress
  };
  
  broadcastToRoom(roomId, leaveMessage);
  
  console.log(`User ${username} (${userId}) left room ${roomId}`);
}

function handleSignalingMessage(message: SignalingMessage) {
  const { type, roomId, userId, targetUserId } = message;
  
  switch (type) {
    case 'offer':
    case 'answer':
    case 'ice-candidate':
      // Forward signaling messages to target user
      if (targetUserId) {
        const room = rooms.get(roomId);
        const targetUser = room?.get(targetUserId);
        
        if (targetUser && targetUser.socket.readyState === WebSocket.OPEN) {
          try {
            targetUser.socket.send(JSON.stringify(message));
          } catch (error) {
            console.error('Error forwarding message to target user:', error);
          }
        }
      }
      break;
      
    default:
      console.log('Unknown signaling message type:', type);
  }
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    // Check if this is a WebSocket upgrade request
    const upgrade = req.headers.get("upgrade");
    if (upgrade !== "websocket") {
      return new Response("Expected WebSocket upgrade", { 
        status: 426,
        headers: corsHeaders 
      });
    }

    // Upgrade to WebSocket
    const { socket, response } = Deno.upgradeWebSocket(req);
    
    let currentRoomId: string | null = null;
    let currentUserId: string | null = null;
    let currentUsername: string | null = null;
    let currentWalletAddress: string | null = null;

    socket.onopen = () => {
      console.log("WebSocket connection opened");
    };

    socket.onmessage = (event) => {
      try {
        const message: SignalingMessage = JSON.parse(event.data);
        console.log("Received message:", message.type);

        switch (message.type) {
          case 'join-room':
            currentRoomId = message.roomId;
            currentUserId = message.userId;
            currentUsername = message.username;
            currentWalletAddress = message.walletAddress;
            
            handleUserJoin(
              message.roomId,
              message.userId,
              message.username,
              message.walletAddress,
              socket
            );
            break;

          case 'leave-room':
            if (currentRoomId && currentUserId && currentUsername && currentWalletAddress) {
              handleUserLeave(currentRoomId, currentUserId, currentUsername, currentWalletAddress);
            }
            break;

          case 'offer':
          case 'answer':
          case 'ice-candidate':
            handleSignalingMessage(message);
            break;

          default:
            console.log('Unknown message type:', message.type);
        }
      } catch (error) {
        console.error("Error processing message:", error);
      }
    };

    socket.onclose = () => {
      console.log("WebSocket connection closed");
      
      // Clean up user from room
      if (currentRoomId && currentUserId && currentUsername && currentWalletAddress) {
        handleUserLeave(currentRoomId, currentUserId, currentUsername, currentWalletAddress);
      }
    };

    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    return response;

  } catch (error) {
    console.error("Error in voice signaling function:", error);
    
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});