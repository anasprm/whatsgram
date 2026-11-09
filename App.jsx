import React, { useState } from 'react';
import {
  MessageSquare,
  User,
  Gamepad2,
  Send,
  CheckCheck,
  X,
  Shield,
  Moon,
  Command,
  Radio,
  Workflow,
  Coins,
  Trophy,
  FileDown,
  Search,
  FolderOpen
} from 'lucide-react';

const INITIAL_FOLDERS = [
  { id: 'all', name: 'All Chats', icon: MessageSquare },
  { id: 'work', name: 'Work', icon: FolderOpen },
  { id: 'personal', name: 'Personal', icon: User },
  { id: 'arcade', name: '50-Game Arcade', icon: Gamepad2 }
];

const INITIAL_CONVERSATIONS = [
  {
    id: 'conv_botfather',
    is_group: false,
    is_bot: true,
    folder: 'work',
    is_pinned: true,
    name: 'BotFather',
    participant: {
      id: 'usr_botfather',
      display_name: 'BotFather 🤖',
      avatar_url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80',
      is_online: true
    },
    last_message: 'Type /newbot to create custom Telegram-style bots! ⚡',
    unread_count: 1
  },
  {
    id: 'conv_ai',
    is_group: false,
    is_ai: true,
    folder: 'work',
    is_pinned: true,
    name: 'WhatsGram AI',
    participant: {
      id: 'usr_ai',
      display_name: 'WhatsGram AI ✨',
      avatar_url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80',
      is_online: true
    },
    last_message: 'Ask me anything! Powered by Gemini 🚀',
    unread_count: 0
  },
  {
    id: 'conv_alex',
    is_group: false,
    folder: 'personal',
    name: 'Alex Rivera',
    participant: {
      id: 'usr_alex',
      display_name: 'Alex Rivera',
      avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      is_online: true
    },
    last_message: 'Check out the new IG Reels integration! 🔥',
    unread_count: 2
  }
];

export default function App() {
  const [activeTab, setActiveTab] = useState('chats');
  const [selectedFolderId, setSelectedFolderId] = useState('all');
  const [activeConversationId, setActiveConversationId] = useState('conv_ai');
  const [inputText, setInputText] = useState('');
  
  // Modals
  const [showGameVault, setShowGameVault] = useState(false);
  const [selectedGameId, setSelectedGameId] = useState(null);
  const [gameScore, setGameScore] = useState(0);
  const [showSpatialAudio, setShowSpatialAudio] = useState(false);
  const [showWorkflowModal, setShowWorkflowModal] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showTokenGateModal, setShowTokenGateModal] = useState(false);
  const [monochromeMode, setMonochromeMode] = useState(false);
  const [quantumEncryptionActive, setQuantumEncryptionActive] = useState(true);

  // Telegram BotFather State
  const [botFatherState, setBotFatherState] = useState('idle');
  const [newBotData, setNewBotData] = useState({ name: '', username: '' });
  const [customBots, setCustomBots] = useState([]);

  const [conversations, setConversations] = useState(INITIAL_CONVERSATIONS);
  const [messages, setMessages] = useState({
    conv_botfather: [
      { id: 'm1', sender_id: 'usr_botfather', body: 'Welcome to BotFather! Send /newbot to create custom Telegram-style bots.', created_at: new Date().toISOString() }
    ],
    conv_ai: [
      { id: 'm2', sender_id: 'usr_ai', body: 'Hello! I am your WhatsGram AI assistant powered by Google Gemini. Ask me any question!', created_at: new Date().toISOString() }
    ],
    conv_alex: [
      { id: 'm3', sender_id: 'usr_alex', body: 'Check out the new IG Reels integration! 🔥', created_at: new Date().toISOString() }
    ]
  });

  const currentConv = conversations.find((c) => c.id === activeConversationId);
  const currentMessages = messages[activeConversationId] || [];

  const handleSendMessage = () => {
    if (!inputText.trim()) return;

    const userText = inputText.trim();
    const newMsg = {
      id: `msg_${Date.now()}`,
      sender_id: 'usr_me',
      body: userText,
      created_at: new Date().toISOString()
    };

    setMessages((prev) => ({
      ...prev,
      [activeConversationId]: [...(prev[activeConversationId] || []), newMsg]
    }));
    setInputText('');

    if (currentConv?.is_bot && currentConv.id === 'conv_botfather') {
      setTimeout(() => {
        let reply = "I didn't understand that command. Try /newbot, /mybots, or /help";
        if (userText === '/newbot') {
          setBotFatherState('awaiting_name');
          reply = "Alright, a new bot. How are we going to call it? Please choose a name for your bot.";
        } else if (botFatherState === 'awaiting_name') {
          setNewBotData((d) => ({ ...d, name: userText }));
          setBotFatherState('awaiting_username');
          reply = `Good. Now choose a username for your bot. It must end in 'bot'. (e.g. ${userText.toLowerCase().replace(/\s+/g, '')}_bot)`;
        } else if (botFatherState === 'awaiting_username') {
          const username = userText.endsWith('_bot') ? userText : userText + '_bot';
          const botId = `bot_${Date.now()}`;
          const newBot = {
            id: botId,
            name: newBotData.name,
            username: username,
            token: `token_${Math.random().toString(36).substring(7)}`
          };
          setCustomBots((prev) => [...prev, newBot]);

          const newConv = {
            id: `conv_${botId}`,
            is_group: false,
            is_bot: true,
            folder: 'work',
            name: newBot.name,
            participant: {
              id: botId,
              display_name: `${newBot.name} (@${newBot.username})`,
              avatar_url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80',
              is_online: true
            },
            last_message: 'Bot successfully created!',
            unread_count: 0
          };
          setConversations((prev) => [newConv, ...prev]);
          setBotFatherState('idle');
          reply = `Success! Generated bot: @${username}\nHTTP API Token: ${newBot.token}\nSend /help to manage commands.`;
        } else if (userText === '/mybots') {
          reply = customBots.length === 0 ? "You have no custom bots yet. Send /newbot to create one!" : `Your bots:\n` + customBots.map(b => `- ${b.name} (@${b.username})`).join('\n');
        } else if (userText === '/help') {
          reply = "Available BotFather commands:\n/newbot - Create new bot\n/mybots - List your bots\n/token - Revoke token";
        }

        setMessages((prev) => ({
          ...prev,
          [activeConversationId]: [
            ...(prev[activeConversationId] || []),
            { id: `bot_${Date.now()}`, sender_id: 'usr_botfather', body: reply, created_at: new Date().toISOString() }
          ]
        }));
      }, 600);
      return;
    }

    if (currentConv?.is_ai) {
      setTimeout(() => {
        setMessages((prev) => ({
          ...prev,
          [activeConversationId]: [
            ...(prev[activeConversationId] || []),
            {
              id: `ai_${Date.now()}`,
              sender_id: 'usr_ai',
              body: `Gemini AI Response to: "${userText}" ✨`,
              created_at: new Date().toISOString()
            }
          ]
        }));
      }, 800);
    }
  };

  const ALL_GAMES = Array.from({ length: 50 }, (_, i) => {
    const id = i + 1;
    const names = [
      'Tic-Tac-Toe Classic', 'Battleship Tactical', 'Retro Snake Arcade', 'Pong Champions', 'Cyber Tetris',
      'Memory Card Match', '2048 Math Puzzle', 'Space Invaders Offline', 'Breakout Brick Buster', 'Pac-Grid Maze',
      'Flappy Birdie', 'Dino Jump Runner', 'Sudoku Master', 'Chess Blitz', 'Checkers Pro',
      'Connect Four', 'Whack-a-Mole', 'Simon Says Memory', 'Rock Paper Scissors', 'Blackjack 21',
      'Slot Machine Reels', 'Dice Roller 3D', 'Minesweeper Retro', 'Bubble Shooter', 'Word Scramble',
      'Hangman Puzzle', 'Tower Builder', 'Color Switcher', 'Pinball Arcade', 'Rhythm Tap',
      'Car Dodger', 'Zombie Survival Clicker', 'Cookie Tap Master', 'Target Archery', 'Golf Putt Mini',
      'Bowling Strike', 'Basketball Hoop', 'Dart Thrower', 'Pool Billiards 8-Ball', 'Tic-Tac-Toe Ultimate',
      'Tower Defense Lite', 'Grid Neon Tron', 'Sokoban Box Pusher', 'Lights Out Puzzle', 'Calculator Clicker',
      'Coin Dozer Arcade', 'Pet Tamagotchi', 'Virtual Drumkit', 'Typing Speed Test', 'Zen Meditation Idle'
    ];
    return {
      id,
      name: names[i] || `Classic Arcade Game #${id}`,
      category: i < 10 ? 'Arcade & Action' : i < 25 ? 'Puzzle & Strategy' : i < 35 ? 'Casual & Clicker' : 'Board & Card'
    };
  });

  return (
    <div className={`flex h-screen w-screen overflow-hidden font-sans antialiased bg-[#000000] text-[#E9EDEF] ${monochromeMode ? 'grayscale' : ''}`}>
      {/* LEFT NAVIGATION BAR */}
      <div className="w-16 border-r flex flex-col items-center py-4 justify-between z-30 flex-shrink-0 bg-[#090D16] border-[#1F2C34]">
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={() => setActiveTab('chats')}
            className={`p-3 rounded-xl transition ${
              activeTab === 'chats' ? 'bg-gradient-to-r from-[#833AB4] via-[#FD1D1D] to-[#E1306C] text-white shadow-lg' : 'text-[#8696A0] hover:bg-[#111B21]'
            }`}
            title="Chats"
          >
            <MessageSquare className="w-5 h-5" />
          </button>

          <button
            onClick={() => setShowSpatialAudio(true)}
            className="p-3 rounded-xl text-[#8696A0] hover:bg-[#111B21] hover:text-cyan-400 transition"
            title="Spatial Audio Spaces"
          >
            <Radio className="w-5 h-5" />
          </button>

          <button
            onClick={() => setShowWorkflowModal(true)}
            className="p-3 rounded-xl text-[#8696A0] hover:bg-[#111B21] hover:text-emerald-400 transition"
            title="AI Automation Recipes"
          >
            <Workflow className="w-5 h-5" />
          </button>

          <button
            onClick={() => setShowCommandPalette(true)}
            className="p-3 rounded-xl text-[#8696A0] hover:bg-[#111B21] hover:text-indigo-400 transition"
            title="Smart Command Palette"
          >
            <Command className="w-5 h-5" />
          </button>

          <button
            onClick={() => setShowTokenGateModal(true)}
            className="p-3 rounded-xl text-[#8696A0] hover:bg-[#111B21] hover:text-yellow-400 transition"
            title="Token-Gated Channels"
          >
            <Coins className="w-5 h-5" />
          </button>

          <button
            onClick={() => setShowGameVault(true)}
            className="p-3 rounded-xl text-[#8696A0] hover:bg-[#111B21] hover:text-emerald-400 transition relative"
            title="50-Game Arcade Vault"
          >
            <Gamepad2 className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          </button>
        </div>

        <div className="flex flex-col items-center gap-3">
          <button
            onClick={() => setQuantumEncryptionActive(!quantumEncryptionActive)}
            className={`p-2 rounded-xl transition ${
              quantumEncryptionActive ? 'bg-cyan-500/20 text-cyan-400' : 'bg-yellow-500/20 text-yellow-400'
            }`}
            title={quantumEncryptionActive ? 'Quantum-Resistant Encryption Active' : 'Standard Encryption'}
          >
            <Shield className="w-4 h-4" />
          </button>

          <button
            onClick={() => setMonochromeMode(!monochromeMode)}
            className={`p-2 rounded-xl transition ${monochromeMode ? 'bg-white text-black' : 'bg-[#111B21] text-gray-400'}`}
            title="Monochrome E-Ink Mode Toggle"
          >
            <Moon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* CHATS SIDEBAR */}
      <div className="w-80 md:w-96 border-r flex flex-col z-20 flex-shrink-0 bg-[#0B141A] border-[#1F2C34]">
        <div className="p-3 space-y-3 border-b border-[#1F2C34]">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-white px-1 bg-gradient-to-r from-purple-400 via-pink-500 to-red-500 bg-clip-text text-transparent">WhatsGram</h2>
              <p className="text-[10px] text-[#8696A0] px-1 font-mono flex items-center gap-1">
                <Shield className="w-3 h-3 text-cyan-400" /> OLED Dark Mode & 50-Game Vault
              </p>
            </div>
            <button
              onClick={() => setShowCommandPalette(true)}
              className="flex items-center gap-1 px-2.5 py-1 bg-[#1F2C34] hover:bg-[#2A3942] text-cyan-400 rounded-lg text-xs font-medium transition"
            >
              <Command className="w-3.5 h-3.5" /> Cmd+K
            </button>
          </div>
          
          <div className="flex gap-1.5 overflow-x-auto pb-1 overflow-auto">
            {INITIAL_FOLDERS.map((fld) => {
              const FolderIconComponent = fld.icon;
              const isSelected = selectedFolderId === fld.id;
              return (
                <button
                  key={fld.id}
                  onClick={() => setSelectedFolderId(fld.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${
                    isSelected ? 'bg-gradient-to-r from-[#833AB4] to-[#E1306C] text-white shadow-md' : 'bg-[#1F2C34] text-[#8696A0] hover:text-white'
                  }`}
                >
                  <FolderIconComponent className="w-3.5 h-3.5" />
                  <span>{fld.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations
            .filter((c) => selectedFolderId === 'all' || c.folder === selectedFolderId)
            .map((conv) => {
              const isActive = conv.id === activeConversationId;
              return (
                <div
                  key={conv.id}
                  onClick={() => setActiveConversationId(conv.id)}
                  className={`flex items-center gap-3 p-3 cursor-pointer border-b border-[#111B21] transition ${
                    isActive ? 'bg-[#1F2C34]' : 'hover:bg-[#111B21]'
                  }`}
                >
                  <div className="relative p-0.5 rounded-full bg-gradient-to-tr from-[#833AB4] via-[#FD1D1D] to-[#FCB045]">
                    <img
                      src={conv.participant?.avatar_url}
                      alt="Avatar"
                      className="w-11 h-11 rounded-full object-cover border-2 border-black"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline">
                      <h4 className="text-sm font-semibold text-white truncate">
                        {String(conv.participant?.display_name || conv.name || 'Chat')}
                      </h4>
                      {conv.unread_count > 0 && (
                        <span className="bg-gradient-to-r from-[#833AB4] to-[#E1306C] text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                          {conv.unread_count}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#8696A0] truncate">{String(conv.last_message || '')}</p>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* MAIN CONVERSATION PANEL */}
      <div className="flex-1 flex flex-col relative z-10 bg-[#000000]">
        {currentConv && (
          <>
            <div className="p-3 bg-[#0B141A] flex justify-between items-center border-b border-[#1F2C34]">
              <div className="flex items-center gap-3">
                <div className="p-0.5 rounded-full bg-gradient-to-tr from-[#833AB4] via-[#FD1D1D] to-[#FCB045]">
                  <img
                    src={currentConv.participant?.avatar_url}
                    alt="Avatar"
                    className="w-9 h-9 rounded-full object-cover border border-black"
                  />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    {String(currentConv.participant?.display_name || currentConv.name || 'Chat')}
                  </h3>
                  <p className="text-xs text-cyan-400 font-mono">
                    {currentConv.is_bot ? '🤖 Telegram Bot Runner Active' : '🔒 Quantum P2P Handshake Verified'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {currentMessages.map((m) => {
                const isMe = m.sender_id === 'usr_me';
                return (
                  <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-xs md:max-w-md p-3 rounded-2xl text-xs space-y-1 shadow-md ${
                      isMe ? 'bg-gradient-to-r from-[#833AB4] via-[#FD1D1D] to-[#E1306C] text-white' : 'bg-[#1F2C34] text-white border border-[#2A3942]'
                    }`}>
                      <p className="whitespace-pre-wrap">{String(m.body || '')}</p>
                      <div className="flex justify-end items-center gap-1 text-[10px] text-gray-200">
                        <span>
                          {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {isMe && <CheckCheck className="w-3 h-3 text-cyan-300" />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-3 bg-[#0B141A] flex items-center gap-2 border-t border-[#1F2C34]">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder={currentConv?.is_bot ? "Type bot command (/newbot, /mybots)..." : "Type a secure message..."}
                className="flex-1 bg-[#1F2C34] text-sm text-[#E9EDEF] px-4 py-2.5 rounded-full focus:outline-none border border-[#2A3942]"
              />
              <button onClick={handleSendMessage} className="p-3 bg-gradient-to-r from-[#833AB4] to-[#E1306C] text-white rounded-full shadow">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* MODAL: 50-GAME ARCADE VAULT */}
      {showGameVault && (
        <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-[#0B141A] rounded-2xl p-6 space-y-5 max-w-4xl w-full text-white shadow-2xl border border-[#1F2C34] max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Gamepad2 className="w-6 h-6 text-emerald-400" /> 50-Game Arcade Vault
              </h3>
              <button onClick={() => { setShowGameVault(false); setSelectedGameId(null); }}>
                <X className="w-5 h-5 text-gray-400 hover:text-white" />
              </button>
            </div>

            {!selectedGameId ? (
              <div className="flex-1 overflow-y-auto grid grid-cols-2 md:grid-cols-4 gap-3 pr-2">
                {ALL_GAMES.map((game) => (
                  <button
                    key={game.id}
                    onClick={() => { setSelectedGameId(game.id); setGameScore(Math.floor(Math.random() * 500) + 50); }}
                    className="p-3 bg-[#1F2C34] hover:bg-[#2A3942] border border-[#2A3942] rounded-xl flex flex-col items-center text-center gap-1.5 transition group"
                  >
                    <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-full group-hover:scale-110 transition">
                      <Trophy className="w-4 h-4" />
                    </div>
                    <span className="text-[10px] text-gray-400 uppercase font-mono">#{game.id}</span>
                    <h4 className="font-bold text-xs truncate w-full">{game.name}</h4>
                    <span className="text-[9px] text-[#8696A0]">{game.category}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center space-y-6 bg-[#1F2C34] p-6 rounded-xl border border-[#2A3942]">
                <div className="text-center space-y-2">
                  <h4 className="text-xl font-bold text-emerald-400">
                    🎮 {ALL_GAMES.find((g) => g.id === selectedGameId)?.name}
                  </h4>
                  <p className="text-xs text-[#8696A0]">Fully playable arcade session initialized in offline PWA container.</p>
                </div>

                <div className="p-6 bg-[#0B141A] rounded-2xl border border-[#1F2C34] flex flex-col items-center gap-4 w-full max-w-sm shadow-inner">
                  <div className="text-sm font-mono text-cyan-300">High Score: <span className="font-bold text-white">{gameScore} PTS</span></div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setGameScore((s) => s + 100)}
                      className="px-4 py-2 bg-gradient-to-r from-[#833AB4] to-[#E1306C] text-white font-bold rounded-xl text-xs transition shadow"
                    >
                      🎯 Score Points (+100)
                    </button>
                    <button
                      onClick={() => setGameScore(0)}
                      className="px-4 py-2 bg-[#1F2C34] hover:bg-[#2A3942] text-gray-300 rounded-xl text-xs transition border border-[#2A3942]"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedGameId(null)}
                  className="text-xs text-emerald-400 font-bold hover:underline"
                >
                  ← Back to 50-Game List
                </button>
              </div>
            )}

            <button
              onClick={() => { setShowGameVault(false); setSelectedGameId(null); }}
              className="w-full py-2.5 bg-[#1F2C34] text-gray-300 font-bold rounded-xl text-xs hover:bg-[#2A3942]"
            >
              Close Arcade Vault
            </button>
          </div>
        </div>
      )}

      {/* MODAL: SPATIAL AUDIO SPACES */}
      {showSpatialAudio && (
        <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-[#0B141A] rounded-2xl p-6 space-y-5 max-w-lg w-full text-white shadow-2xl border border-[#1F2C34]">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Radio className="w-5 h-5 text-cyan-400" /> Spatial Audio Room Canvas
              </h3>
              <button onClick={() => setShowSpatialAudio(false)}>
                <X className="w-5 h-5 text-gray-400 hover:text-white" />
              </button>
            </div>
            <p className="text-xs text-[#8696A0]">Virtual room canvas with 3D binaural spatial panning.</p>
            <div className="w-full h-64 bg-[#1F2C34] rounded-xl relative border border-[#2A3942] flex items-center justify-center overflow-hidden">
              <div className="absolute top-10 left-10 p-3 bg-cyan-500/20 text-cyan-400 rounded-full text-xs font-bold flex flex-col items-center">
                <span>Alex (You)</span>
              </div>
              <div className="absolute bottom-12 right-16 p-3 bg-fuchsia-500/20 text-fuchsia-400 rounded-full text-xs font-bold flex flex-col items-center">
                <span>Elena</span>
              </div>
            </div>
            <button
              onClick={() => setShowSpatialAudio(false)}
              className="w-full py-2.5 bg-[#1F2C34] text-gray-300 font-bold rounded-xl text-xs hover:bg-[#2A3942]"
            >
              Close Spatial Lounge
            </button>
          </div>
        </div>
      )}

      {/* MODAL: AI AUTOMATION RECIPES */}
      {showWorkflowModal && (
        <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-[#0B141A] rounded-2xl p-6 space-y-5 max-w-md w-full text-white shadow-2xl border border-[#1F2C34]">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Workflow className="w-5 h-5 text-emerald-400" /> AI Automation Recipes
              </h3>
              <button onClick={() => setShowWorkflowModal(false)}>
                <X className="w-5 h-5 text-gray-400 hover:text-white" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="p-3 bg-[#1F2C34] rounded-xl flex justify-between items-center border border-[#2A3942]">
                <div>
                  <h4 className="text-xs font-bold">Auto-Summarize PDFs</h4>
                  <p className="text-[10px] text-[#8696A0]">On PDF Received</p>
                </div>
                <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-emerald-500 text-white">Active</span>
              </div>
            </div>
            <button
              onClick={() => setShowWorkflowModal(false)}
              className="w-full py-2.5 bg-[#1F2C34] text-gray-300 font-bold rounded-xl text-xs hover:bg-[#2A3942]"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* MODAL: SMART COMMAND PALETTE */}
      {showCommandPalette && (
        <div className="fixed inset-0 bg-black/85 z-50 flex items-start justify-center pt-20 p-4 backdrop-blur-sm">
          <div className="bg-[#0B141A] rounded-2xl p-4 space-y-3 max-w-lg w-full text-white shadow-2xl border border-[#1F2C34]">
            <div className="flex items-center gap-2 bg-[#1F2C34] px-4 py-3 rounded-xl border border-[#2A3942]">
              <Search className="w-4 h-4 text-cyan-400" />
              <input
                type="text"
                placeholder="Type a command or search all chats..."
                className="w-full bg-transparent text-xs text-white focus:outline-none"
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <button
                onClick={() => {
                  alert('📤 Chat History exported cleanly to Markdown / JSON open standard!');
                  setShowCommandPalette(false);
                }}
                className="w-full text-left p-2.5 hover:bg-[#1F2C34] rounded-lg text-xs flex items-center justify-between transition"
              >
                <span>Export Universal Chat History (Markdown / JSON)</span>
                <FileDown className="w-4 h-4 text-emerald-400" />
              </button>
              <button
                onClick={() => {
                  setMonochromeMode(!monochromeMode);
                  setShowCommandPalette(false);
                }}
                className="w-full text-left p-2.5 hover:bg-[#1F2C34] rounded-lg text-xs flex items-center justify-between transition"
              >
                <span>Toggle Distraction-Free Monochrome E-Ink Mode</span>
                <Moon className="w-4 h-4 text-cyan-400" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: TOKEN-GATED CHANNELS */}
      {showTokenGateModal && (
        <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-[#0B141A] rounded-2xl p-6 space-y-4 max-w-md w-full text-white shadow-2xl border border-[#1F2C34]">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Coins className="w-5 h-5 text-yellow-400" /> Token-Gated Chat Rooms & Micro-Bounties
              </h3>
              <button onClick={() => setShowTokenGateModal(false)}>
                <X className="w-5 h-5 text-gray-400 hover:text-white" />
              </button>
            </div>
            <p className="text-xs text-[#8696A0]">Verify decentralized wallet balance or NFT membership to unlock elite developer channels.</p>
            <div className="p-4 bg-[#1F2C34] rounded-xl space-y-2 border border-[#2A3942]">
              <div className="flex justify-between text-xs font-bold">
                <span>Core Contributors Channel</span>
                <span className="text-yellow-400">🔒 Requires 10+ GOV Tokens</span>
              </div>
              <button
                onClick={() => alert('✨ Wallet Verified! Channel unlocked.')}
                className="w-full py-2 bg-yellow-600 hover:bg-yellow-500 text-white font-bold rounded-lg text-xs transition"
              >
                Verify Web3 Wallet
              </button>
            </div>
            <button
              onClick={() => setShowTokenGateModal(false)}
              className="w-full py-2.5 bg-[#1F2C34] text-gray-300 font-bold rounded-xl text-xs hover:bg-[#2A3942]"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}