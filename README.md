# 🏏 IPL Live Auction Arena

![IPL Banner](https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?auto=format&fit=crop&q=80&w=2000)

A real-time, interactive Indian Premier League (IPL) Auction Simulator and Live Arena. Experience the thrill of live team bidding with a modern, responsive web application.

## 🚀 Features

- **Real-Time Bidding:** Live WebSocket-based updates for synchronized bidding across different clients.
- **Dynamic Player Database:** Detailed view of player statistics, base prices, roles, and profiles.
- **Team Management:** Seamlessly manage franchise purse deductions, squad limits, and overseas player quotas.
- **Interactive UI:** Smooth animations using Framer Motion, clean design with Tailwind CSS, and real-time confetti celebrations.
- **AI Integration:** Features powered by Google's Gemini API for dynamic insights.
- **Admin Controls:** Room host controls for bringing players under the hammer and managing the auction flow.

## 🛠️ Tech Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, Framer Motion, Lucide Icons
- **Backend:** Node.js, Express, WebSockets (WS)
- **Database / Auth:** Supabase
- **AI:** Google GenAI SDK (`@google/genai`)
- **Tooling:** concurrently, esbuild, tsx

## 📦 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v22.12 or higher)
- npm, yarn, or pnpm

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/im-notpranav/ipl-auction.git
   cd ipl-auction
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   Copy the example environment file and add your credentials (including Supabase and Gemini API keys):
   ```bash
   cp .env.example .env.local
   ```
   *Note: Ensure `GEMINI_API_KEY` is set in `.env.local`.*

4. **Run the Application**
   Start both the backend API server and the Vite React frontend concurrently:
   ```bash
   npm run dev
   ```

5. Open your browser and navigate to `http://localhost:5173`

## 📜 Scripts Overview

- `npm run dev`: Starts the development server (frontend + backend).
- `npm run build`: Builds the client and server for production.
- `npm run test`: Runs the test suite for auction logic and playing XI.
- `npm run start`: Starts the production server.
- `npm run verify:players`: Utility script to verify player data.
- `npm run sync:images`: Utility script to sync player images.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the issues page.

## 📄 License

This project is open-source and available under the MIT License.
