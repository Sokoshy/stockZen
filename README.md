# StockZen

**Projet expérimental de test d'IA pour le développement full-stack.**

Ce projet est un laboratoire visant à évaluer la capacité d'une IA à concevoir, implémenter et maintenir une application web complète de A à Z, sans problèmes majeurs d'intégration, de fonctionnalités ou de sécurité.

## 🎯 Objectifs du Projet

- **Intégration** : Vérifier que tous les composants (frontend, backend, base de données, API) s'intègrent correctement
- **Fonctionnalités** : S'assurer que les fonctionnalités implémentées fonctionnent comme prévu de bout en bout
- **Sécurité** : Valider que les bonnes pratiques de sécurité sont respectées (RLS, authentification, protection des données sensibles)

## 📝 Type de Projet

**Gestionnaire de stock intelligent pour les petits commerces** (boulangers, restaurants, épiceries).

Une application SaaS full-stack conçue pour être maintenue et développée efficacement par des agents IA, servant de benchmark pour évaluer les capacités de codage IA.

## 🚀 Stack Technologique

| Catégorie | Technologie |
|-----------|-------------|
| Runtime | TypeScript |
| Framework | Next.js (App Router) |
| Package Manager | Bun |
| Base de données | PostgreSQL 18.1 |
| ORM | Drizzle ORM |
| API | tRPC + REST (sync offline) |
| Authentification | Better Auth |
| UI | Tailwind CSS + shadcn/ui |
| Stockage local | IndexedDB (Dexie) |
| Paiements | Stripe |
| Déploiement | Docker → Fly.io |

## 📁 Structure du Projet

```
src/
├── app/                    # Next.js App Router
│   ├── api/
│   │   ├── sync/          # API REST pour synchronisation offline
│   │   └── stripe/        # Webhooks Stripe
│   └── ...                # Pages et layouts
├── components/
│   ├── ui/                # Composants shadcn/ui
│   └── features/          # Composants par fonctionnalité
├── server/
│   ├── api/               # Procédures tRPC
│   └── services/          # Logique métier
├── lib/                   # Utilities et configurations
├── schemas/               # Schémas Zod partagés
└── types/                 # Types TypeScript globaux
```

## 🧪 Tests

```
tests/
├── unit/                  # Tests unitaires
├── integration/           # Tests d'intégration (RLS, sync)
└── e2e/                   # Tests end-to-end
    ├── fixtures/          # Fixtures partagées
    └── helpers/           # Helpers de test
```

Règles de test prioritaires :
- Tests RLS anti-fuite inter-tenant
- Tests de synchronisation offline (idempotence, retry)
- Tests webhooks Stripe

## 🛠️ Configuration

Les variables d'environnement sont gérées via [`src/lib/env.ts`](src/lib/env.ts). Voir `.env.example` pour les variables requises.

```bash
# Installation des dépendances
bun install

# Migration base de données
bun run db:migrate

# Démarrage développement
bun run dev
```

## 📋 Règles de Développement

Le projet suit des règles strictes pour faciliter la maintenance par IA :

- **Convention de nommage** : `camelCase` (vars/functions), `PascalCase` (components/types), `kebab-case` (fichiers)
- **Boundary API** : tRPC pour usage interne uniquement, REST pour sync offline
- **Tenancy RLS** : Accès tenant-scoped uniquement via le helper dédié
- **Audit trail** : `stock_movements` est append-only
- **Offline** : Toutes les écritures passent par l'outbox + `/api/sync`

Voir [`_bmad-output/project-context.md`](_bmad-output/project-context.md) pour les règles complètes.

## 🤖 Pour les Agents IA

Lire impérativement `_bmad-output/project-context.md` avant toute implémentation. Le projet est optimisé pour les agents IA avec 49 règles documentées.

## 📄 Documentation

- [Architecture](_bmad-output/planning-artifacts/architecture.md)
- [PRD](_bmad-output/planning-artifacts/prd.md)
- [Spécifications UX](_bmad-output/planning-artifacts/ux-design-specification.md)

## 📜 Licence

MIT
