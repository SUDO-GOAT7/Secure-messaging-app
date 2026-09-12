const WebSocket = require('ws');
const path = require('path');
const http = require('http');
const fs = require('fs');

// HTTP server for serving static files
const server = http.createServer((req, res) => {
  // Serve static files from public directory
  let filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);

  // Security: prevent directory traversal
  if (filePath.includes('..')) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath);
  let contentType = 'text/html';

  switch (ext) {
    case '.js':
      contentType = 'text/javascript';
      break;
    case '.css':
      contentType = 'text/css';
      break;
    case '.json':
      contentType = 'application/json';
      break;
    case '.png':
      contentType = 'image/png';
      break;
    case '.jpg':
    case '.jpeg':
      contentType = 'image/jpeg';
      break;
    case '.svg':
      contentType = 'image/svg+xml';
      break;
    case '.ico':
      contentType = 'image/x-icon';
      break;
    case '.webmanifest':
      contentType = 'application/manifest+json';
      break;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // File not found
        fs.readFile(path.join(__dirname, 'public', 'index.html'), (err, content) => {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(content, 'utf-8');
        });
      } else {
        // Server error
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      // Success
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

// WebSocket server for signaling
const wss = new WebSocket.Server({ server });

// Store connected clients
const clients = new Map();

// Store chat rooms (for group chats)
const rooms = new Map();

// Store media files (in-memory for demo, use database/storage in production)
const mediaStore = new Map();

// Generate unique ID
function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

wss.on('connection', (ws) => {
  // Generate client ID
  const clientId = generateId();
  const username = `User_${clientId.substring(0, 6)}`;

  // Store client info
  clients.set(ws, {
    id: clientId,
    username: username,
    rooms: new Set()
  });

  console.log(`Client connected: ${username} (${clientId})`);

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'welcome',
    clientId: clientId,
    username: username
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'join-room':
          handleJoinRoom(ws, data);
          break;

        case 'leave-room':
          handleLeaveRoom(ws, data);
          break;

        case 'send-message':
          handleSendMessage(ws, data);
          break;

        case 'add-reaction':
          handleAddReaction(ws, data);
          break;

        case 'remove-reaction':
          handleRemoveReaction(ws, data);
          break;

        case 'upload-media':
          handleUploadMedia(ws, data);
          break;

        case 'get-media':
          handleGetMedia(ws, data);
          break;

        case 'typing':
          handleTyping(ws, data);
          break;

        case 'call-request':
          handleCallRequest(ws, data);
          break;

        case 'call-response':
          handleCallResponse(ws, data);
          break;

        case 'end-call':
          handleEndCall(ws, data);
          break;

        default:
          console.log('Unknown message type:', data.type);
      }
    } catch (err) {
      console.error('Error processing message:', err);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format'
      }));
    }
  });

  ws.on('close', () => {
    handleClientDisconnect(ws);
    console.log(`Client disconnected: ${clients.get(ws)?.username || 'Unknown'}`);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
});

function handleJoinRoom(ws, data) {
  const client = clients.get(ws);
  if (!client) return;

  const roomId = data.roomId || generateId();
  const roomName = data.roomName || `Room ${roomId.substring(0, 4)}`;

  // Create room if it doesn't exist
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      id: roomId,
      name: roomName,
      members: new Set(),
      messages: [],
      reactions: new Map() // messageId -> reactions
    });
  }

  const room = rooms.get(roomId);

  // Add client to room
  room.members.add(client.id);
  client.rooms.add(roomId);

  // Notify others in room
  room.members.forEach(memberId => {
    const memberWs = Array.from(clients.entries()).find(([_, c]) => c.id === memberId)?.[0];
    if (memberWs && memberWs.readyState === WebSocket.OPEN) {
      memberWs.send(JSON.stringify({
        type: 'user-joined',
        roomId: roomId,
        userId: client.id,
        username: client.username
      }));
    }
  });

  // Send room info to client
  ws.send(JSON.stringify({
    type: 'room-joined',
    room: {
      id: room.id,
      name: room.name,
      members: Array.from(room.members).map(id => {
        const member = Array.from(clients.values()).find(c => c.id === id);
        return member ? { id: member.id, username: member.username } : null;
      }).filter(Boolean),
      messages: room.messages.map(msg => ({
        ...msg,
        // Decrypt for display (in real app, decrypt client-side)
        text: typeof msg.text === 'string' && msg.text.startsWith('enc:')
          ? `[Encrypted: ${msg.text.substring(4)}]`
          : msg.text
      }))
    }
  }));
}

function handleLeaveRoom(ws, data) {
  const client = clients.get(ws);
  if (!client || !data.roomId) return;

  const room = rooms.get(data.roomId);
  if (!room) return;

  // Remove client from room
  room.members.delete(client.id);
  client.rooms.delete(data.roomId);

  // Notify others in room
  room.members.forEach(memberId => {
    const memberWs = Array.from(clients.entries()).find(([_, c]) => c.id === memberId)?.[0];
    if (memberWs && memberWs.readyState === WebSocket.OPEN) {
      memberWs.send(JSON.stringify({
        type: 'user-left',
        roomId: data.roomId,
        userId: client.id
      }));
    }
  });

  // Clean up empty rooms
  if (room.members.size === 0) {
    rooms.delete(data.roomId);
  }
}

function handleSendMessage(ws, data) {
  const client = clients.get(ws);
  if (!client || !data.roomId) return;

  const room = rooms.get(data.roomId);
  if (!room || !room.members.has(client.id)) return;

  const messageId = generateId();
  const timestamp = Date.now();

  // Encrypt message (demo - in real app use proper encryption)
  const encryptedText = `enc:${btoa(unescape(encodeURIComponent(data.text)))}`;

  const message = {
    id: messageId,
    roomId: data.roomId,
    senderId: client.id,
    senderName: client.username,
    text: encryptedText,
    timestamp: timestamp,
    type: data.type || 'text', // text, image, video, file
    mediaUrl: data.mediaUrl || null,
    reactions: new Map() // emoji -> count
  };

  // Store message in room
  room.messages.push(message);

  // Keep only last 100 messages per room (for demo)
  if (room.messages.length > 100) {
    room.messages = room.messages.slice(-100);
  }

  // Broadcast to room members
  room.members.forEach(memberId => {
    const memberWs = Array.from(clients.entries()).find(([_, c]) => c.id === memberId)?.[0];
    if (memberWs && memberWs.readyState === WebSocket.OPEN) {
      memberWs.send(JSON.stringify({
        type: 'new-message',
        message: {
          ...message,
          // Don't send encrypted text to sender (they already know what they sent)
          // In real app, client would decrypt
          text: memberId === client.id ? data.text : encryptedText
        }
      }));
    }
  });
}

function handleAddReaction(ws, data) {
  const client = clients.get(ws);
  if (!client || !data.roomId || !data.messageId) return;

  const room = rooms.get(data.roomId);
  if (!room) return;

  const message = room.messages.find(m => m.id === data.messageId);
  if (!message) return;

  // Update reaction count
  const currentCount = message.reactions.get(data.emoji) || 0;
  message.reactions.set(data.emoji, currentCount + 1);

  // Broadcast reaction update
  room.members.forEach(memberId => {
    const memberWs = Array.from(clients.entries()).find(([_, c]) => c.id === memberId)?.[0];
    if (memberWs && memberWs.readyState === WebSocket.OPEN) {
      memberWs.send(JSON.stringify({
        type: 'reaction-updated',
        roomId: data.roomId,
        messageId: data.messageId,
        emoji: data.emoji,
        count: message.reactions.get(data.emoji) || 0
      }));
    }
  });
}

function handleRemoveReaction(ws, data) {
  const client = clients.get(ws);
  if (!client || !data.roomId || !data.messageId) return;

  const room = rooms.get(data.roomId);
  if (!room) return;

  const message = room.messages.find(m => m.id === data.messageId);
  if (!message) return;

  // Update reaction count
  const currentCount = message.reactions.get(data.emoji) || 0;
  if (currentCount > 0) {
    const newCount = currentCount - 1;
    if (newCount === 0) {
      message.reactions.delete(data.emoji);
    } else {
      message.reactions.set(data.emoji, newCount);
    }

    // Broadcast reaction update
    room.members.forEach(memberId => {
      const memberWs = Array.from(clients.entries()).find(([_, c]) => c.id === memberId)?.[0];
      if (memberWs && memberWs.readyState === WebSocket.OPEN) {
        memberWs.send(JSON.stringify({
          type: 'reaction-updated',
          roomId: data.roomId,
          messageId: data.messageId,
          emoji: data.emoji,
          count: message.reactions.get(data.emoji) || 0
        }));
      }
    });
  }
}

function handleUploadMedia(ws, data) {
  const client = clients.get(ws);
  if (!client) return;

  // In a real app, you would:
  // 1. Validate file type and size
  // 2. Store file securely (S3, local storage, etc.)
  // 3. Return a secure URL
  //
  // For demo, we'll simulate with an in-memory store

  const mediaId = generateId();
  const mediaData = {
    id: mediaId,
    uploaderId: client.id,
    uploaderName: client.username,
    type: data.type, // image, video, file
    name: data.name,
    size: data.size,
    data: data.data, // base64 data (in real app, don't do this!)
    timestamp: Date.now(),
    roomId: data.roomId
  };

  mediaStore.set(mediaId, mediaData);

  // Generate a media URL (in real app, this would be a secure endpoint)
  const mediaUrl = `/media/${mediaId}`;

  // Notify user of successful upload
  ws.send(JSON.stringify({
    type: 'media-uploaded',
    mediaId: mediaId,
    mediaUrl: mediaUrl
  }));

  // If this is for a message, also send the message
  if (data.forMessage) {
    const messageData = {
      roomId: data.roomId,
      text: data.text || '',
      type: data.type,
      mediaUrl: mediaUrl
    };

    // Temporarily override handleSendMessage to use our media
    const originalSend = handleSendMessage;
    handleSendMessage = function(ws, data) {
      // Add mediaUrl to the data
      data.mediaUrl = messageData.mediaUrl;
      data.type = messageData.type;
      originalSend(ws, data);
      // Restore original
      handleSendMessage = originalSend;
    };

    handleSendMessage(ws, messageData);

    // Restore original
    handleSendMessage = originalSend;
  }
}

function handleGetMedia(ws, data) {
  const media = mediaStore.get(data.mediaId);
  if (!media) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Media not found'
    }));
    return;
  }

  // Check if user has access to this media (in room)
  const client = clients.get(ws);
  if (!client) return;

  const room = rooms.get(media.roomId);
  if (!room || !room.members.has(client.id)) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Access denied'
    }));
    return;
  }

  // In real app, you would stream the file or redirect to secure storage
  // For demo, we'll send the data (NOT SECURE - for demonstration only)
  ws.send(JSON.stringify({
    type: 'media-data',
    media: {
      id: media.id,
      type: media.type,
      name: media.name,
      size: media.size,
      // In real app: send only metadata, serve file via secure endpoint
      // For demo: include data (WARNING: NOT SECURE)
      data: media.data
    }
  }));
}

function handleTyping(ws, data) {
  const client = clients.get(ws);
  if (!client || !data.roomId) return;

  const room = rooms.get(data.roomId);
  if (!room) return;

  // Notify others in room that user is typing
  room.members.forEach(memberId => {
    if (memberId !== client.id) {
      const memberWs = Array.from(clients.entries()).find(([_, c]) => c.id === memberId)?.[0];
      if (memberWs && memberWs.readyState === WebSocket.OPEN) {
        memberWs.send(JSON.stringify({
          type: 'typing',
          roomId: data.roomId,
          userId: client.id,
          username: client.username,
          isTyping: data.isTyping
        }));
      }
    }
  });
}

function handleCallRequest(ws, data) {
  const client = clients.get(ws);
  if (!client || !data.roomId || !data.targetUserId) return;

  const room = rooms.get(data.roomId);
  if (!room) return;

  // Check if target user is in the room
  if (!room.members.has(data.targetUserId)) {
    ws.send(JSON.stringify({
      type: 'call-error',
      message: 'User not in room'
    }));
    return;
  }

  // Find target user's WebSocket connection
  const targetWs = Array.from(clients.entries()).find(([_, c]) => c.id === data.targetUserId)?.[0];

  if (targetWs && targetWs.readyState === WebSocket.OPEN) {
    // Forward call request to target user
    targetWs.send(JSON.stringify({
      type: 'incoming-call',
      roomId: data.roomId,
      callerId: client.id,
      callerName: client.username,
      callId: data.callId || generateId(),
      isVideo: data.isVideo || false
    }));
  } else {
    ws.send(JSON.stringify({
      type: 'call-error',
      message: 'User not available'
    }));
  }
}

function handleCallResponse(ws, data) {
  const client = clients.get(ws);
  if (!client || !data.roomId || !data.callerId) return;

  const room = rooms.get(data.roomId);
  if (!room) return;

  // Find caller's WebSocket connection
  const callerWs = Array.from(clients.entries()).find(([_, c]) => c.id === data.callerId)?.[0];

  if (callerWs && callerWs.readyState === WebSocket.OPEN) {
    // Forward call response to caller
    callerWs.send(JSON.stringify({
      type: 'call-response',
      roomId: data.roomId,
      responderId: client.id,
      responderName: client.username,
      callId: data.callId,
      accepted: data.accepted
    }));
  }
}

function handleEndCall(ws, data) {
  const client = clients.get(ws);
  if (!client || !data.roomId || !data.callId) return;

  const room = rooms.get(data.roomId);
  if (!room) return;

  // Notify others in room that call ended
  room.members.forEach(memberId => {
    if (memberId !== client.id) {
      const memberWs = Array.from(clients.entries()).find(([_, c]) => c.id === memberId)?.[0];
      if (memberWs && memberWs.readyState === WebSocket.OPEN) {
        memberWs.send(JSON.stringify({
          type: 'call-ended',
          roomId: data.roomId,
          callId: data.callId,
          endedBy: client.id
        }));
      }
    }
  });
}

function handleClientDisconnect(ws) {
  const client = clients.get(ws);
  if (!client) return;

  // Remove client from all rooms
  client.rooms.forEach(roomId => {
    const room = rooms.get(roomId);
    if (room) {
      room.members.delete(client.id);

      // Notify others in room
      room.members.forEach(memberId => {
        const memberWs = Array.from(clients.entries()).find(([_, c]) => c.id === memberId)?.[0];
        if (memberWs && memberWs.readyState === WebSocket.OPEN) {
          memberWs.send(JSON.stringify({
            type: 'user-left',
            roomId: roomId,
            userId: client.id
          }));
        }
      });

      // Clean up empty rooms
      if (room.members.size === 0) {
        rooms.delete(roomId);
      }
    }
  });

  // Remove client
  clients.delete(ws);
}

// HTTP endpoint for serving media (in real app, use proper storage)
server.listen(3000, () => {
  console.log('HTTP server running on port 3000');
  console.log('WebSocket signaling server running on port 3000');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  wss.close();
  server.close(() => {
    process.exit(0);
  });
});