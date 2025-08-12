# FPL Analytics Platform 🎯

Personal analytics platform for Fantasy Premier League that aggregates data from multiple sources and provides AI-powered insights.

## 🚀 Features (Planned)

- **Multi-source data aggregation** - FPL API, Sofascore, Understat
- **Intelligent player mapping** - Connecting players across different data sources
- **AI-powered insights** - Natural language queries about your FPL team
- **Personal team analysis** - Tailored recommendations based on your squad
- **Real-time updates** - Automated data synchronization after matches

## 🛠 Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Database:** PostgreSQL + Prisma ORM
- **Styling:** Tailwind CSS + shadcn/ui
- **AI Integration:** OpenAI/Claude API
- **Deployment:** Docker (planned)

## 📦 Installation

```bash
# Clone repository
git clone https://github.com/USERNAME/fpl-platform.git
cd fpl-platform

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env.local
# Edit .env.local with your database credentials

# Setup database
npx prisma migrate dev

# Run development server
npm run dev
```

## 🗺 Development Roadmap

### Phase 1: Foundation ✅
- [x] Project setup with Next.js + TypeScript
- [x] Database schema design
- [ ] Basic infrastructure

### Phase 2: FPL Integration 🚧
- [ ] FPL API client
- [ ] Data models and storage
- [ ] Automated updates

### Phase 3: External Data 📅
- [ ] Sofascore integration
- [ ] Player mapping algorithm
- [ ] Data validation

### Phase 4: AI Integration 📅
- [ ] LLM integration
- [ ] Natural language to SQL
- [ ] Smart recommendations

### Phase 5: User Interface 📅
- [ ] Dashboard design
- [ ] Data visualizations
- [ ] Mobile responsive

## 🔧 Development

```bash
# Run dev server
npm run dev

# Run type checking
npm run type-check

# Run linting
npm run lint

# Format code
npm run format

# Database migrations
npx prisma migrate dev
npx prisma studio  # Visual database editor
```

## 📁 Project Structure

```
fpl-platform/
├── app/              # Next.js app router
│   ├── api/         # API endpoints
│   └── (dashboard)/ # UI pages
├── components/       # React components
├── lib/             # Core logic
│   ├── db/         # Database client
│   ├── parsers/    # Data parsers
│   ├── mappers/    # Player mapping
│   └── ai/         # AI integration
├── prisma/          # Database schema
└── types/           # TypeScript types
```

## 👤 Author

Created as a personal project for FPL analytics.

## 📄 License

Private project - not for commercial use.

---

**Status:** 🚧 Under active development