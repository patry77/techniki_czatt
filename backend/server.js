// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "http://localhost:3000",
    credentials: true
  }
});

// Middleware
app.use(cors({
  origin: "http://localhost:3000",
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Konfiguracja sesji
app.use(session({
  secret: process.env.SESSION_SECRET || 'tajny-klucz-sesji',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Inicjalizacja Passport
app.use(passport.initialize());
app.use(passport.session());

// Połączenie z MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/chat-app', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Modele MongoDB
// Model użytkownika
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String },
  googleId: { type: String }, // ID Google dla SSO
  username: { type: String, required: true },
  profilePicture: { type: String, default: '/default-avatar.png' },
  isOnline: { type: Boolean, default: false },
  lastSeen: { type: Date, default: Date.now },
  joinedChannels: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Channel' }],
  createdAt: { type: Date, default: Date.now }
});

// Model kanału
const channelSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isPrivate: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

// Model wiadomości
const messageSchema = new mongoose.Schema({
  channel: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel' },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Dla wiadomości prywatnych
  content: { type: String },
  type: { type: String, enum: ['text', 'image', 'file'], default: 'text' },
  fileUrl: { type: String },
  fileName: { type: String },
  reactions: [{
    emoji: String,
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  }],
  edited: { type: Boolean, default: false },
  editedAt: { type: Date },
  isPrivate: { type: Boolean, default: false },
  read: { type: Boolean, default: false },
  // Pola dla wątków
  parentMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' }, // ID wiadomości nadrzędnej
  threadReplies: { type: Number, default: 0 }, // Liczba odpowiedzi w wątku
  lastReplyAt: { type: Date }, // Data ostatniej odpowiedzi w wątku
  createdAt: { type: Date, default: Date.now }
});

// Model powiadomień push
const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['message', 'mention', 'channel_invite', 'private_message'], required: true },
  title: { type: String, required: true },
  body: { type: String, required: true },
  data: { type: mongoose.Schema.Types.Mixed },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Channel = mongoose.model('Channel', channelSchema);
const Message = mongoose.model('Message', messageSchema);
const Notification = mongoose.model('Notification', notificationSchema);

// Konfiguracja Google OAuth
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // Sprawdź czy użytkownik już istnieje
    let user = await User.findOne({ googleId: profile.id });
    
    if (user) {
      return done(null, user);
    }
    
    // Sprawdź czy email już istnieje
    user = await User.findOne({ email: profile.emails[0].value });
    
    if (user) {
      // Połącz konto Google z istniejącym kontem
      user.googleId = profile.id;
      await user.save();
      return done(null, user);
    }
    
    // Utwórz nowego użytkownika
    user = await User.create({
      googleId: profile.id,
      email: profile.emails[0].value,
      username: profile.displayName,
      profilePicture: profile.photos[0].value
    });
    
    return done(null, user);
  } catch (error) {
    return done(error, null);
  }
}));

passport.serializeUser((user, done) => {
  done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Konfiguracja uploadu plików
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // Limit 10MB
  },
  fileFilter: (req, file, cb) => {
    // Dozwolone typy plików
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt|zip/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Niedozwolony typ pliku'));
    }
  }
});

// Middleware autoryzacji
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.sendStatus(401);
  }
  
  jwt.verify(token, process.env.JWT_SECRET || 'secret', (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Endpointy API

// Rejestracja użytkownika
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, username } = req.body;
    
    // Sprawdź czy użytkownik już istnieje
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Użytkownik już istnieje' });
    }
    
    // Hashowanie hasła
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Tworzenie nowego użytkownika
    const user = await User.create({
      email,
      password: hashedPassword,
      username
    });
    
    // Generowanie tokena JWT
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '24h' }
    );
    
    res.status(201).json({
      token,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        profilePicture: user.profilePicture
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Błąd serwera', error: error.message });
  }
});

// Logowanie użytkownika
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Znajdź użytkownika
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Nieprawidłowy email lub hasło' });
    }
    
    // Sprawdź hasło
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Nieprawidłowy email lub hasło' });
    }
    
    // Generowanie tokena JWT
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '24h' }
    );
    
    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        profilePicture: user.profilePicture
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Błąd serwera', error: error.message });
  }
});

// Google OAuth endpoints
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login' }),
  async (req, res) => {
    // Generuj token JWT dla użytkownika Google
    const token = jwt.sign(
      { userId: req.user._id, email: req.user.email },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '24h' }
    );
    
    // Przekieruj do frontendu z tokenem
    res.redirect(`http://localhost:3000/auth-success?token=${token}`);
  }
);

// Pobierz profil użytkownika
app.get('/api/users/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Błąd serwera' });
  }
});

// Aktualizuj profil użytkownika
app.put('/api/users/profile', authenticateToken, upload.single('profilePicture'), async (req, res) => {
  try {
    const { username } = req.body;
    const updateData = {};
    
    if (username) updateData.username = username;
    if (req.file) updateData.profilePicture = `/uploads/${req.file.filename}`;
    
    const user = await User.findByIdAndUpdate(
      req.user.userId,
      updateData,
      { new: true }
    ).select('-password');
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Błąd serwera' });
  }
});

// Tworzenie kanału
app.post('/api/channels', authenticateToken, async (req, res) => {
  try {
    const { name, description, isPrivate } = req.body;
    
    const channel = await Channel.create({
      name,
      description,
      creator: req.user.userId,
      members: [req.user.userId],
      isPrivate
    });
    
    // Dodaj kanał do listy kanałów użytkownika
    await User.findByIdAndUpdate(req.user.userId, {
      $push: { joinedChannels: channel._id }
    });
    
    // Powiadom wszystkich połączonych użytkowników o nowym kanale przez WebSocket
    // ale tylko jeśli kanał jest publiczny
    if (!isPrivate) {
      io.emit('newChannel', { channel });
    }
    
    res.status(201).json(channel);
  } catch (error) {
    res.status(500).json({ message: 'Błąd serwera' });
  }
});

// Pobierz wszystkie kanały użytkownika
app.get('/api/channels', authenticateToken, async (req, res) => {
  try {
    // Pobierz wszystkie publiczne kanały oraz prywatne kanały, do których użytkownik należy
    const channels = await Channel.find({
      $or: [
        { isPrivate: false }, // Wszystkie publiczne kanały
        { members: req.user.userId } // Prywatne kanały, do których użytkownik należy
      ]
    }).sort({ createdAt: 1 });
    
    res.json(channels);
  } catch (error) {
    res.status(500).json({ message: 'Błąd serwera' });
  }
});

// Dołącz do kanału
app.post('/api/channels/:channelId/join', authenticateToken, async (req, res) => {
  try {
    const { channelId } = req.params;
    
    // Dodaj użytkownika do kanału
    await Channel.findByIdAndUpdate(channelId, {
      $addToSet: { members: req.user.userId }
    });
    
    // Dodaj kanał do listy kanałów użytkownika
    await User.findByIdAndUpdate(req.user.userId, {
      $addToSet: { joinedChannels: channelId }
    });
    
    res.json({ message: 'Dołączono do kanału' });
  } catch (error) {
    res.status(500).json({ message: 'Błąd serwera' });
  }
});

// Pobierz wiadomości z kanału
app.get('/api/channels/:channelId/messages', authenticateToken, async (req, res) => {
  try {
    const { channelId } = req.params;
    const { limit = 50, before } = req.query;
    
    const query = { channel: channelId };
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }
    
    const messages = await Message.find(query)
      .populate('sender', 'username profilePicture')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));
    
    res.json(messages.reverse());
  } catch (error) {
    res.status(500).json({ message: 'Błąd serwera' });
  }
});

// Pobierz wiadomości prywatne
app.get('/api/messages/private/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50, before } = req.query;
    
    const query = {
      isPrivate: true,
      $or: [
        { sender: req.user.userId, receiver: userId },
        { sender: userId, receiver: req.user.userId }
      ]
    };
    
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }
    
    const messages = await Message.find(query)
      .populate('sender', 'username profilePicture')
      .populate('receiver', 'username profilePicture')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));
    
    // Oznacz wiadomości jako przeczytane
    await Message.updateMany(
      { 
        isPrivate: true,
        receiver: req.user.userId,
        sender: userId,
        read: false 
      },
      { read: true }
    );
    
    res.json(messages.reverse());
  } catch (error) {
    res.status(500).json({ message: 'Błąd serwera' });
  }
});

// Wyślij wiadomość prywatną
app.post('/api/messages/private/:userId', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { content, type = 'text', parentMessageId } = req.body;
    
    const messageData = {
      sender: req.user.userId,
      receiver: userId,
      type,
      isPrivate: true
    };
    
    // Jeśli to odpowiedź w wątku
    if (parentMessageId) {
      messageData.parentMessage = parentMessageId;
    }
    
    if (type === 'text') {
      messageData.content = content;
    } else if (req.file) {
      messageData.fileUrl = `/uploads/${req.file.filename}`;
      messageData.fileName = req.file.originalname;
    }
    
    const message = await Message.create(messageData);
    await message.populate('sender', 'username profilePicture');
    await message.populate('receiver', 'username profilePicture');
    
    // Jeśli to odpowiedź w wątku, zaktualizuj wiadomość nadrzędną
    if (parentMessageId) {
      await Message.findByIdAndUpdate(parentMessageId, {
        $inc: { threadReplies: 1 },
        lastReplyAt: new Date()
      });
    }
    
    // Emituj wiadomość przez Socket.IO do odbiorcy i nadawcy
    io.to(`user-${userId}`).emit('privateMessage', message);
    io.to(`user-${req.user.userId}`).emit('privateMessage', message);
    
    // Utwórz powiadomienie
    await Notification.create({
      user: userId,
      type: 'private_message',
      title: `Nowa wiadomość od ${message.sender.username}`,
      body: type === 'text' ? content.substring(0, 100) : 'Przesłał(a) plik',
      data: { senderId: req.user.userId, messageId: message._id }
    });
    
    res.status(201).json(message);
  } catch (error) {
    res.status(500).json({ message: 'Błąd serwera' });
  }
});

// Pobierz nieprzeczytane wiadomości
app.get('/api/messages/unread', authenticateToken, async (req, res) => {
  try {
    const unreadCounts = await Message.aggregate([
      {
        $match: {
          receiver: mongoose.Types.ObjectId(req.user.userId),
          isPrivate: true,
          read: false
        }
      },
      {
        $group: {
          _id: '$sender',
          count: { $sum: 1 }
        }
      }
    ]);
    
    res.json(unreadCounts);
  } catch (error) {
    res.status(500).json({ message: 'Błąd serwera' });
  }
});

// Pobierz listę rozpoczętych konwersacji prywatnych
app.get('/api/messages/conversations', authenticateToken, async (req, res) => {
  try {
    // Znajdź wszystkie wiadomości prywatne gdzie użytkownik jest nadawcą lub odbiorcą
    const conversations = await Message.aggregate([
      {
        $match: {
          isPrivate: true,
          $or: [
            { sender: mongoose.Types.ObjectId(req.user.userId) },
            { receiver: mongoose.Types.ObjectId(req.user.userId) }
          ]
        }
      },
      {
        $addFields: {
          conversationWith: {
            $cond: {
              if: { $eq: ['$sender', mongoose.Types.ObjectId(req.user.userId)] },
              then: '$receiver',
              else: '$sender'
            }
          }
        }
      },
      {
        $group: {
          _id: '$conversationWith',
          lastMessageDate: { $max: '$createdAt' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $project: {
          _id: 1,
          username: '$user.username',
          profilePicture: '$user.profilePicture',
          isOnline: '$user.isOnline',
          lastMessageDate: 1
        }
      },
      {
        $sort: { lastMessageDate: -1 }
      }
    ]);
    
    res.json(conversations);
  } catch (error) {
    res.status(500).json({ message: 'Błąd serwera' });
  }
});

// Pobierz listę użytkowników
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.user.userId } })
      .select('username email profilePicture isOnline lastSeen')
      .sort({ isOnline: -1, username: 1 });
    
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Błąd serwera' });
  }
});

// Pobierz powiadomienia
app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user.userId })
      .sort({ createdAt: -1 })
      .limit(20);
    
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ message: 'Błąd serwera' });
  }
});

// Oznacz powiadomienia jako przeczytane
app.put('/api/notifications/read', authenticateToken, async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user.userId, read: false },
      { read: true }
    );
    
    res.json({ message: 'Powiadomienia oznaczone jako przeczytane' });
  } catch (error) {
    res.status(500).json({ message: 'Błąd serwera' });
  }
});

// Wyślij wiadomość
app.post('/api/channels/:channelId/messages', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { channelId } = req.params;
    const { content, type = 'text', parentMessageId } = req.body;
    
    const messageData = {
      channel: channelId,
      sender: req.user.userId,
      type
    };
    
    // Jeśli to odpowiedź w wątku
    if (parentMessageId) {
      messageData.parentMessage = parentMessageId;
    }
    
    if (type === 'text') {
      messageData.content = content;
    } else if (req.file) {
      messageData.fileUrl = `/uploads/${req.file.filename}`;
      messageData.fileName = req.file.originalname;
    }
    
    const message = await Message.create(messageData);
    await message.populate('sender', 'username profilePicture');
    
    // Jeśli to odpowiedź w wątku, zaktualizuj wiadomość nadrzędną
    if (parentMessageId) {
      await Message.findByIdAndUpdate(parentMessageId, {
        $inc: { threadReplies: 1 },
        lastReplyAt: new Date()
      });
    }
    
    // Emituj wiadomość przez Socket.IO
    io.to(channelId).emit('newMessage', message);
    
    // Utwórz powiadomienia dla członków kanału
    const channel = await Channel.findById(channelId).populate('members');
    const otherMembers = channel.members.filter(member => member._id.toString() !== req.user.userId);
    
    for (const member of otherMembers) {
      await Notification.create({
        user: member._id,
        type: 'message',
        title: `Nowa wiadomość w #${channel.name}`,
        body: `${message.sender.username}: ${type === 'text' ? content.substring(0, 100) : 'przesłał(a) plik'}`,
        data: { channelId, messageId: message._id }
      });
    }
    
    res.status(201).json(message);
  } catch (error) {
    res.status(500).json({ message: 'Błąd serwera' });
  }
});

// Pobierz wiadomości z wątku
app.get('/api/messages/:messageId/thread', authenticateToken, async (req, res) => {
  try {
    const { messageId } = req.params;
    const { limit = 50 } = req.query;
    
    // Pobierz wiadomość nadrzędną
    const parentMessage = await Message.findById(messageId)
      .populate('sender', 'username profilePicture');
    
    if (!parentMessage) {
      return res.status(404).json({ message: 'Wiadomość nie znaleziona' });
    }
    
    // Pobierz odpowiedzi w wątku
    const threadMessages = await Message.find({ parentMessage: messageId })
      .populate('sender', 'username profilePicture')
      .sort({ createdAt: 1 })
      .limit(parseInt(limit));
    
    res.json({
      parentMessage,
      threadMessages
    });
  } catch (error) {
    res.status(500).json({ message: 'Błąd serwera' });
  }
});

// Odpowiedz w wątku kanałowym
app.post('/api/messages/:messageId/thread/reply', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content, type = 'text', parentMessageId } = req.body;
    
    // Pobierz wiadomość nadrzędną aby sprawdzić kanał
    const parentMessage = await Message.findById(parentMessageId || messageId);
    if (!parentMessage) {
      return res.status(404).json({ message: 'Wiadomość nadrzędna nie znaleziona' });
    }
    
    const messageData = {
      channel: parentMessage.channel,
      sender: req.user.userId,
      type,
      parentMessage: parentMessageId || messageId
    };
    
    if (type === 'text') {
      messageData.content = content;
    } else if (req.file) {
      messageData.fileUrl = `/uploads/${req.file.filename}`;
      messageData.fileName = req.file.originalname;
    }
    
    const message = await Message.create(messageData);
    await message.populate('sender', 'username profilePicture');
    
    // Zaktualizuj wiadomość nadrzędną
    await Message.findByIdAndUpdate(parentMessageId || messageId, {
      $inc: { threadReplies: 1 },
      lastReplyAt: new Date()
    });
    
    // Emituj specjalny event dla odpowiedzi w wątku zamiast zwykłej wiadomości
    io.to(parentMessage.channel.toString()).emit('threadReply', {
      ...message.toObject(),
      parentMessageId: parentMessageId || messageId
    });
    
    res.status(201).json(message);
  } catch (error) {
    res.status(500).json({ message: 'Błąd serwera' });
  }
});

// Odpowiedz w wątku prywatnym
app.post('/api/messages/private/:userId/thread', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { content, type = 'text', parentMessageId } = req.body;
    
    const messageData = {
      sender: req.user.userId,
      receiver: userId,
      type,
      isPrivate: true,
      parentMessage: parentMessageId
    };
    
    if (type === 'text') {
      messageData.content = content;
    } else if (req.file) {
      messageData.fileUrl = `/uploads/${req.file.filename}`;
      messageData.fileName = req.file.originalname;
    }
    
    const message = await Message.create(messageData);
    await message.populate('sender', 'username profilePicture');
    await message.populate('receiver', 'username profilePicture');
    
    // Zaktualizuj wiadomość nadrzędną
    await Message.findByIdAndUpdate(parentMessageId, {
      $inc: { threadReplies: 1 },
      lastReplyAt: new Date()
    });
    
    // Emituj specjalny event dla odpowiedzi w wątku prywatnym
    io.to(`user-${userId}`).emit('privateThreadReply', {
      ...message.toObject(),
      parentMessageId: parentMessageId
    });
    io.to(`user-${req.user.userId}`).emit('privateThreadReply', {
      ...message.toObject(),
      parentMessageId: parentMessageId
    });
    
    res.status(201).json(message);
  } catch (error) {
    res.status(500).json({ message: 'Błąd serwera' });
  }
});

// Socket.IO
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  
  if (!token) {
    return next(new Error('Brak autoryzacji'));
  }
  
  jwt.verify(token, process.env.JWT_SECRET || 'secret', async (err, decoded) => {
    if (err) return next(new Error('Nieprawidłowy token'));
    
    socket.userId = decoded.userId;
    const user = await User.findById(decoded.userId);
    socket.user = user;
    next();
  });
});

io.on('connection', async (socket) => {
  console.log('Użytkownik połączony:', socket.user.username);
  
  // Dołącz do osobistego pokoju użytkownika
  socket.join(`user-${socket.userId}`);
  
  // Automatycznie dołącz do wszystkich dostępnych kanałów
  try {
    const channels = await Channel.find({
      $or: [
        { isPrivate: false }, // Wszystkie publiczne kanały
        { members: socket.userId } // Prywatne kanały, do których użytkownik należy
      ]
    });
    
    // Dołącz do pokojów wszystkich kanałów
    for (const channel of channels) {
      socket.join(channel._id.toString());
      console.log(`Użytkownik ${socket.user.username} dołączył do kanału: ${channel.name}`);
    }
  } catch (error) {
    console.error('Błąd dołączania do kanałów:', error);
  }
  
  // Aktualizuj status online
  await User.findByIdAndUpdate(socket.userId, { 
    isOnline: true 
  });
  
  // Powiadom innych o statusie online
  socket.broadcast.emit('userStatusUpdate', {
    userId: socket.userId,
    isOnline: true
  });
  
  // Dołącz do pokoi kanałów (handler dla frontendu)
  socket.on('joinChannels', async (channelIds) => {
    for (const channelId of channelIds) {
      socket.join(channelId);
      console.log(`Użytkownik ${socket.user.username} ręcznie dołączył do kanału: ${channelId}`);
      socket.to(channelId).emit('userOnline', {
        userId: socket.userId,
        username: socket.user.username
      });
    }
  });
  
  // Dołącz do konkretnego kanału
  socket.on('joinChannel', async (channelId) => {
    try {
      socket.join(channelId);
      console.log(`Użytkownik ${socket.user.username} dołączył do kanału: ${channelId}`);
      
      // Powiadom innych w kanale
      socket.to(channelId).emit('userJoinedChannel', {
        userId: socket.userId,
        username: socket.user.username
      });
    } catch (error) {
      console.error('Błąd dołączania do kanału:', error);
    }
  });
  
  // Pisanie wiadomości
  socket.on('typing', ({ channelId, isTyping }) => {
    socket.to(channelId).emit('userTyping', {
      userId: socket.userId,
      username: socket.user.username,
      channelId,
      isTyping
    });
  });
  
  // Pisanie wiadomości prywatnej
  socket.on('privateTyping', ({ userId, isTyping }) => {
    socket.to(`user-${userId}`).emit('userPrivateTyping', {
      userId: socket.userId,
      username: socket.user.username,
      isTyping
    });
  });
  
  // Reakcje na wiadomości
  socket.on('addReaction', async ({ messageId, emoji, channelId, privateUserId }) => {
    try {
      const message = await Message.findById(messageId);
      
      // Znajdź lub utwórz reakcję
      let reaction = message.reactions.find(r => r.emoji === emoji);
      if (!reaction) {
        message.reactions.push({ emoji, users: [socket.userId] });
      } else {
        if (!reaction.users.includes(socket.userId)) {
          reaction.users.push(socket.userId);
        }
      }
      
      await message.save();
      
      if (privateUserId) {
        // Dla wiadomości prywatnych
        io.to(`user-${message.sender}`).to(`user-${message.receiver}`).emit('reactionAdded', { 
          messageId, 
          emoji, 
          userId: socket.userId 
        });
      } else if (channelId) {
        // Dla wiadomości kanałowych
        io.to(channelId).emit('reactionAdded', { messageId, emoji, userId: socket.userId });
      }
    } catch (error) {
      console.error('Błąd dodawania reakcji:', error);
    }
  });
  
  // Subskrypcja powiadomień push
  socket.on('subscribePush', async (subscription) => {
    try {
      await User.findByIdAndUpdate(socket.userId, {
        pushSubscription: subscription
      });
      console.log('Zapisano subskrypcję push dla:', socket.user.username);
    } catch (error) {
      console.error('Błąd zapisywania subskrypcji push:', error);
    }
  });
  
  // Rozłączenie
  socket.on('disconnect', () => {
    console.log('Użytkownik rozłączony:', socket.user.username);
    
    // Aktualizuj status offline
    User.findByIdAndUpdate(socket.userId, { 
      isOnline: false,
      lastSeen: new Date()
    }).exec();
    
    // Powiadom innych użytkowników
    socket.broadcast.emit('userStatusUpdate', {
      userId: socket.userId,
      isOnline: false
    });
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Serwer działa na porcie ${PORT}`);
});

module.exports = { User, Channel, Message };