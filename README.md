🪐 MonSphere — Web3 Social Chat
A decentralized, smart-contract-powered social communication platform built on the Monad Blockchain.

🧭 Overview
MonSphere reimagines the way people connect online by combining the social interactivity of Web2 platforms like Discord and Telegram with the decentralization, security, and ownership principles of Web3.

Unlike traditional chat apps that rely on centralized servers and databases, MonSphere leverages smart contracts to handle all social interactions — from user registration to friend requests and forum discussions.
This ensures transparency, censorship resistance, and data ownership for every user.

⚙️ Core Concept
MonSphere functions as a decentralized social hub, enabling users to:

Register their wallet and username on-chain.

Send and accept friend requests using smart contracts.

Chat 1:1 or in groups with wallet-authenticated identities.

Join and create forums for open community discussions.

Every major interaction is recorded on the Monad blockchain, ensuring immutability and authenticity.

🧩 Features Breakdown
👤 User Registration

Each new user registers their wallet address.

A username is mapped to the wallet via a smart contract.

The contract stores this as a unique identity on-chain.

Smart Contract Function Example:

function registerUser(string memory _username) public {
    require(!users[msg.sender].isRegistered, "User already registered");
    users[msg.sender] = User(_username, msg.sender, true);
}

👥 Friend System

Users can search for friends by username or wallet.

Friend requests are sent and accepted using transactions.

The friend relationship is stored bi-directionally in the contract.

Smart Contract Functions:

function sendFriendRequest(address _friend) public;
function acceptFriendRequest(address _friend) public;
function removeFriend(address _friend) public;


Data Flow:

User A sends a request → stored as pending in the contract.

User B accepts → both wallets are linked in the friend mapping.

Either user can remove → removes the mapping on both sides.

💬 Chat System

Decentralized chat powered by smart contracts (for metadata) and off-chain message encryption (for scalability).

Messages can be stored in an IPFS-like system or a decentralized database (future scope).

Each chat is uniquely identified by wallet pair or group ID.

Smart Contract Structure:

struct Message {
    address sender;
    string contentHash; // IPFS or off-chain reference
    uint timestamp;
}
mapping(uint => Message[]) public chatHistory;

🧵 Forums

Public or community-driven discussions.

Topics and replies are stored on-chain or referenced via IPFS.

Enables DAO-like community management and decentralized moderation in the future.

🧾 History & Logs

On-chain logs keep track of friend interactions, requests, and chat metadata.

Allows transparent audit trails for any social activity.

⚙️ Settings

Manage connected wallet, display username, and preferences.

Future versions may allow NFT avatars and ENS-style usernames.

🧠 Tech Stack
Layer	Technology	Purpose
Blockchain	Monad	Layer-1 blockchain powering decentralized logic
Smart Contracts	Solidity	Handles user registration, friends, and chat data
Frontend	React.js + Tailwind CSS	Dynamic, responsive user interface
Web3 Library	Ethers.js	Wallet connection and contract interaction
Wallet Integration	MetaMask	Authentication via wallet
Storage (future)	IPFS / Filecoin	Decentralized file and message storage
Deployment	Vercel / Netlify	Frontend hosting
🧱 Architecture
                ┌──────────────────────────────┐
                │          Frontend             │
                │  React + Tailwind + Ethers.js │
                └──────────────┬───────────────┘
                               │
             ┌─────────────────┴─────────────────┐
             │                                   │
     ┌──────────────┐                 ┌────────────────┐
     │ Wallet/Auth  │                 │ Smart Contracts │
     │ (MetaMask)   │                 │ (Solidity on Monad) │
     └──────┬───────┘                 └───────┬────────┘
            │                                 │
            │     ↳ Executes transactions     │
            │                                 │
        ┌───▼────────────┐           ┌────────▼──────────┐
        │  User Registry  │           │  Friend Contract  │
        │  Mapping wallet │           │  Requests & Links │
        └────────────────┘           └───────────────────┘

🚀 Installation & Setup
1️⃣ Clone the repository
git clone https://github.com/<your-username>/MonSphere.git
cd MonSphere

2️⃣ Install dependencies
npm install

3️⃣ Start the development server
npm run dev

4️⃣ Connect your wallet

Open the app in your browser.

Connect using MetaMask.

Register your username.

Start chatting and adding friends!

🧪 Smart Contract Files
File	Description
UserRegistry.sol	Handles user registration and identity mapping.
Friends.sol	Manages friend requests and connections.
Chat.sol	Stores and manages message references between users.
Forum.sol	Enables open discussions and topic creation.
🔐 Security & Privacy

Wallet-based authentication ensures user authenticity.

Smart contracts are transparent and verifiable on-chain.

Off-chain encrypted message storage for privacy and efficiency.

No centralized database or admin control.

🧭 Future Roadmap

✅ Core contracts for registration & friends

✅ Wallet integration (MetaMask + Ethers.js)

🚧 Forum smart contract with IPFS support

🚧 Real-time chat with decentralized storage

🪩 NFT-based profile identities

🧬 DAO governance for forums

🏆 Built For

Monad Blitz Hackathon — Delhi 2025
