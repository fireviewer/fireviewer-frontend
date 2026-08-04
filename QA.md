# Vérifications effectuées

> **Rapport historique.** Ces résultats décrivent la révision de démonstration contrôlée au moment
> de leur exécution. Ils ne prouvent pas la révision courante, le flux événementiel v2, Supabase, la
> revue analyste/éditeur, ni une recette déployée. Toute nouvelle preuve doit indiquer la date, le
> commit, les commandes, le navigateur et les artefacts contrôlés.

- `npm run build` : TypeScript strict et build Vite réussis.
- `npm audit` : aucune vulnérabilité signalée au moment de la génération.
- Affichage contrôlé sous Chromium aux largeurs 320, 430, 768, 1280 et 1536 px.
- Aucun débordement horizontal détecté sur les largeurs testées.
- Aucune erreur JavaScript ou erreur console sur les captures finales.
- Routes invalides rejetées par la validation stricte du `fire_id`.
- États vérifiés : chargement des métadonnées, chargement du modèle, prêt, mode dégradé et hors ligne.
- Vues vérifiées : Vue 3D, Sources & confiance, Historique, Journal et Vue texte.
- Interactions vérifiées : filtres, toggles de couches, ouverture des détails, changement de rôle, prévisualisation de version et simulation de hot-swap.

Ces contrôles valident le frontend de démonstration de cette passe historique, pas un usage
opérationnel, une certification de sécurité publique ou l'intégration live des dépendances externes.
