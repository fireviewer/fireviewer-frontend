# FireViewer — contribution événementielle, consultation et revue

Frontend React + TypeScript de contribution, consultation incidente-centrique et revue humaine.
La collecte v2 documente des **événements datés** : un utilisateur authentifié place un point de
prise de vue privé, indique l'heure, ajoute un message et éventuellement plusieurs médias, puis
suit le traitement de sa contribution. Une image isolée sans contexte spatio-temporel n'est plus le
contrat de collecte principal.

La doctrine produit et les contrats transverses sont maintenus dans le dépôt canonique
[`fireviewer/Fireviewer_doc`](https://github.com/fireviewer/Fireviewer_doc). La refonte reste
additive : les parcours et contrats v1 sont conservés pendant la migration.

> FireViewer documente des observations et leurs incertitudes. Il ne constitue ni un système
> d'alerte, ni un outil de commandement, ni un moteur de prédiction de propagation.

## Parcours événementiel v2

```text
compte Supabase vérifié
→ viewpoint privé + temps + message et/ou médias
→ accusé de réception immédiat
→ analyse privée, localisation ou abstention
→ revue analyste
→ publication éditeur
→ timeline publique et progression 3D/2D
```

Règles d'interface :

- le point de prise de vue exact reste visible seulement par le contributeur pour son dossier et
  par les rôles internes autorisés ;
- la fiche de contribution distingue l'état technique, l'abstention, la décision de revue et la
  publication ;
- l'analyste peut corriger, valider, rejeter ou demander une preuve, sans pouvoir publier avec ce
  seul rôle ;
- l'éditeur publie une version déjà validée par une action séparée ;
- la 3D est la vue principale lorsqu'elle est disponible ; la 2D et les informations textuelles
  restent complètes lorsque WebGL, la mémoire, le réseau ou un asset spatial font défaut ;
- événements actifs, incertitudes, enveloppes probables et surfaces brûlées ne sont jamais
  présentés comme une géométrie unique.

L'activation est contrôlée par les flags `VITE_FV_EVENT_V2_ENABLED`,
`VITE_FV_SUPABASE_AUTH_ENABLED`, `VITE_FV_OFFICIAL_CONNECTORS_ENABLED`,
`VITE_FV_AGENT_EVENT_PIPELINE_ENABLED`, `VITE_FV_3D_PRIMARY_ENABLED` et
`VITE_FV_V2_PUBLICATION_ENABLED`. Les valeurs absentes échouent fermées. Une clé Supabase
`service_role` ou tout autre secret serveur ne doit jamais être placé dans une variable `VITE_*`.

Parcours principaux :

| Route | Fonction |
|---|---|
| `/signaler` ou `/contribuer` | Créer un `EventCandidate` lorsque la v2 est activée |
| `/mes-contributions` | Consulter uniquement ses propres contributions |
| `/mes-contributions/{candidate_id}` | Suivre un reçu et la décision associée |
| `/incident/{fire_id}` | Consulter un incident publié et sa timeline |
| `/admin/revue-evenements` | File privée de revue événementielle |

Contrats spécialisés :

- [interface de revue](docs/REVIEW_UI_CONTRACT.md) ;
- [visualisation de l'incertitude](docs/UNCERTAINTY_VISUALIZATION.md) ;
- [accessibilité et modes dégradés](docs/ACCESSIBILITY_AND_DEGRADED_MODES.md).

## Consultation v1 conservée

La route publique canonique historique reste `/incident/{fire_id}`. Les zones spatiales ne sont
jamais une surface publique : elles restent des références techniques accessibles seulement sous
`/admin/zones/*` lorsqu'un rattachement persistant les lie à un modèle.

La fiche publique charge deux contrats distincts :

- `GET /api/v1/incident/{fire_id}/manifest` : contrat léger, ETag et état du modèle ;
- `GET /api/v1/incident/{fire_id}/public-view` : projection publique versionnée des
  faits, observations validées, sources, épisodes, chronologie, téléchargements et
  limites de diffusion.

Aucune fixture, route ou prévisualisation locale ne complète une donnée manquante. Une
erreur de détail affiche un état dégradé explicite tout en conservant les métadonnées du
manifest. Le viewer GLB est chargé uniquement lorsque le manifest publie un asset ; il
ne prédit pas la propagation et ne remplace pas les consignes officielles.

L'administration utilise des routes dédiées : tableau de bord, carte opérationnelle
nationale interne, file de traitement, incidents, rapprochement spatial, signalements,
audit, état système, configuration, zones, packages et publications. Le MVP utilise un
compte administrateur unique validé par le backend ; le navigateur ne s'attribue jamais
de rôle ou de capacité.

> Les jeux de données de développement et les tests ne constituent pas un service d'urgence. En
> situation réelle, contacter les services d'urgence compétents.

## Démarrage

```bash
npm ci
npm run dev
```

Configurer une origine API explicite dans `.env.local` :

```env
VITE_API_BASE_URL=http://localhost:8000
```

Pour tester volontairement le parcours v2 local, configurer aussi les flags et les paramètres
publics Supabase décrits dans [`.env.example`](.env.example). Cette configuration n'active aucun
service distant à elle seule.

Puis ouvrir par exemple :

```text
http://localhost:5173/incident/FR-83-00042
```

## Vérification

```bash
npm run check
npm run test
npm run build
npm run test:e2e
```

`npm run build` produit le site sans télécharger de carte, de catalogue ou de paquet
spatial. La recette E2E est un smoke autonome sur données absentes : elle vérifie que le
shell public et la liste restent consultables sans rendre le frontend dépendant du backend.
Les tests d'intégration croisés sont exécutés séparément lors de la recette de déploiement.

## Structure utile

```text
src/
├── App.tsx                         routes publiques et Admin
├── auth/                           session Supabase et autorisations dérivées du JWT
├── lib/eventCandidates.ts          uploads privés et contributions v2
├── lib/eventReview.ts              contrats de revue analyste/éditeur
├── lib/publicEventTimeline.ts      projection des événements publiés
├── lib/manifestClient.ts            manifest léger, ETag et revalidation
├── lib/publicIncidentView.ts        projection publique réelle
├── lib/adminApi.ts                  contrats et commandes Admin
├── components/public/               fiche incident et viewer GLB tactique
├── components/admin/                file, dossier incident, gouvernance et zones techniques
└── styles.css                       design system partagé
e2e/                                recettes Playwright avec backend réel
```

Les fixtures synthétiques sous `tests/fixtures/contracts/` servent aux tests de contrat.
Elles ne sont pas montées par l'application publique. Les contrats producteurs sont
verrouillés dans `contracts.lock.json`.

## Déploiement

Le dépôt fournit `vercel.json` et `public/_redirects` pour les réécritures SPA. En
production, `/api/*` est réécrit vers `https://fireviewer-api.vercel.app/api/*`, ce qui
permet au cookie Admin `SameSite=Strict` de rester sur un parcours même origine. Une
origine explicite `VITE_API_BASE_URL` reste utilisée en développement et en recette.
Les secrets, chemins de stockage et politiques d'identité ne doivent jamais être
injectés dans le bundle frontend.
