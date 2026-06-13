# sqlite-tool

[中文](README.zh-CN.md) | [English](README.md) | Français | [日本語](README.ja.md) | [한국어](README.ko.md)

sqlite-tool est un outil visuel pour les bases de données SQLite dans VS Code. Ouvrez un fichier `.db`, `.sqlite` ou `.sqlite3` pour parcourir les tables, consulter et modifier les données, créer des tables et exécuter du SQL directement dans l'éditeur.


![sqlite-tool screenshot](https://raw.githubusercontent.com/lx544690189/SQLite-Tool/main/snapshot/main.png)

## Fonctionnalités

- Ouvre les fichiers SQLite avec un éditeur personnalisé, sans configuration supplémentaire.
- Parcours des tables, du nombre de lignes, des données paginées et des résultats triés.
- Recherche dans tous les champs ou dans un champ sélectionné.
- Ajout, modification et suppression de lignes avec gestion de NULL, protection de clé primaire et confirmation de suppression.
- Affichage du SQL CREATE, renommage des tables et création de tables depuis un formulaire guidé.
- Exécution de requêtes et d'instructions d'écriture dans un éditeur SQL Monaco, avec résultats et historique.
- Suit le thème clair/sombre de VS Code ou permet de changer de thème manuellement dans l'outil.
- Utilise l'état non enregistré natif de VS Code et `Ctrl/Cmd+S` pour écrire les changements sur le disque.

## Installation

Si vous disposez d'un paquet `.vsix`, installez-le avec :

```bash
code --install-extension sqlite-tool-2.0.0.vsix
```

Vous pouvez aussi l'installer depuis VS Code avec l'action « Install from VSIX... » dans la vue Extensions.

## Utilisation

1. Ouvrez un fichier `.db`, `.sqlite` ou `.sqlite3` dans l'explorateur VS Code.
2. Le fichier s'ouvre automatiquement avec l'éditeur `sqlite-tool`.
3. Sélectionnez une table à gauche pour parcourir, rechercher ou modifier les données.
4. Passez à l'exécuteur SQL lorsque vous devez lancer du SQL.
5. Après une modification, l'onglet indique un état non enregistré. Appuyez sur `Ctrl/Cmd+S` pour écrire le fichier de base de données.

## Paramètres

sqlite-tool prend en charge le choix de la langue de l'interface :

- `Auto` : suit la langue d'affichage de VS Code.
- `Chinese` / `English` / `French` / `Japanese` / `Korean` : choisissez une langue manuellement.

Recherchez `sqlite-tool` dans les paramètres VS Code, ou ouvrez le panneau de paramètres de l'outil pour modifier la langue, le thème, la taille de page par défaut et la taille de police de l'éditeur SQL.

## Remarques

- Gardez une sauvegarde avant de modifier des bases importantes.
- Les tables sans clé primaire et sans prise en charge de `rowid` sont en lecture seule pour les lignes : elles ne peuvent pas être modifiées ou supprimées ligne par ligne.
- Si le fichier est modifié à l'extérieur, sqlite-tool vous avertit avant l'enregistrement afin d'éviter d'écraser ces changements.

## Documentation développeur

Les notes de développement, d'architecture, d'auto-vérification et de packaging se trouvent dans [docs/开发者指南.md](docs/开发者指南.md).

## License

MIT
