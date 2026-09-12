# Secure Messenger

A secure, encrypted messaging application with built-in voice/video calling, group chats, message reactions, and media sharing. Built as a Progressive Web App (PWA) that works on desktop and mobile devices.

## 🔒 Features

- **End-to-End Encrypted Messaging** (Demo implementation)
- **Group Chats** - Create and participate in multi-user conversations
- **Message Reactions** - React to messages with emojis (👍 ❤️ 😂 😮 😢 👏)
- **Media Sharing** - Share photos and videos with preview
- **Voice & Video Calling** - Built-in calling simulation (WebRTC ready)
- **Real-time Communication** - WebSocket-based signaling
- **Progressive Web App** - Installable, works offline
- **User Presence** - See who's online/offline
- **Typing Indicators** - See when others are typing
- **Responsive Design** - Works on mobile and desktop

## 📱 How to Use

### 1. Installation & Setup

```bash
# Clone the repository
git clone <repository-url>
cd secure-messenger

# Install dependencies
npm install

# Start the server
npm start
```

### 2. Using the Application

1. Open your browser and go to `http://localhost:3000`
2. On mobile Chrome/Safari, you can "Add to Home screen" to install as PWA
3. Select a contact or group from the sidebar to start chatting
4. Use the attachment button (📎) to share photos/videos
5. Tap and hold on messages to add reactions
6. Use the call (📞) or video (🎥) buttons to start calls

## 🛠️ Technical Implementation

### Frontend (Public Directory)
- `index.html` - Main application UI with group chats, reactions, media sharing
- `manifest.json` - PWA manifest for installable web app
- `sw.js` - Service worker for offline caching
- `icon-*.png` - PWA icons

### Backend
- `server.js` - WebSocket signaling server with:
  - Room-based group chat support
  - Media upload handling (demo implementation)
  - Reaction tracking
  - Typing indicators
  - Call signaling
  - User presence management

### Security Notes
⚠️ **IMPORTANT**: This is a DEMO implementation for educational purposes only.
- Encryption uses simple base64 encoding (NOT secure for production)
- No authentication or user management
- Media storage is in-memory (not persistent)
- For production use, you would need to:
  1. Replace demo encryption with libsodium or Web Crypto API
  2. Add proper user authentication
  3. Implement secure media storage (S3, encrypted local storage)
  4. Add message persistence (database)
  5. Implement actual WebRTC for real calling
  6. Add proper access controls and validation

## 📱 PWA Features

This application is a Progressive Web App, which means:
- ✅ Installable on mobile devices (like a native app)
- ✅ Works offline (cached core assets)
- ✅ Responsive design (mobile/desktop)
- ✅ Background sync capabilities
- ✅ Push notification ready

To install on mobile:
1. Visit `http://[YOUR_SERVER_IP]:3000` in Chrome
2. Tap the menu (⋮) → "Add to Home screen"
3. Confirm installation

## 🔧 Extending the Application

### To Add Real Encryption:
Replace the `encryptMessage`/`decryptMessage` functions with:
```javascript
// Using Web Crypto API (simplified example)
async function encryptMessage(text, key) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );
  return { iv: Array.from(iv), data: Array.from(new Uint8Array(encrypted)) };
}
```

### To Add Media Storage:
Modify `handleUploadMedia` in `server.js` to use:
- AWS S3 / Google Cloud Storage
- Encrypted local storage with access tokens
- Database references to stored files

### To Add User Authentication:
1. Add login/register endpoints
2. Implement JWT or session-based auth
3. Associate clients with authenticated users
4. Add authorization checks for room access

### To Add Persistence:
1. Add a database (PostgreSQL, MongoDB, etc.)
2. Store messages, rooms, and media references
3. Implement message history retrieval
4. Add backup/export functionality

## 📄 License

MIT License - feel free to modify and extend for your own use.

## 🙏 Acknowledgments

- Built with Node.js and WebSocket signaling
- Inspired by secure messaging protocols
- PWA capabilities for broad device support
- Demo encryption for educational purposes only

---
**Remember**: For actual secure communication, consult with security professionals and use audited encryption libraries like libsodium or the Signal Protocol.